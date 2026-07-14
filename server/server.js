const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { cca } = require('./auth');
const Account = require('./models/Account');
const Rule = require('./models/Rule');
const app = express();
const PORT = process.env.PORT || 5001;
app.use(cors());
app.use(express.json());
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Admin Login Endpoint
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
    
    if (password === adminPassword) {
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

// Force MSAL to load its token cache from MongoDB before any token operation
const warmUpCache = async () => {
    try {
        const cacheDoc = await Account.findOne({ email: 'global_cache' });
        if (cacheDoc && cacheDoc.refreshToken) {
            cacheDoc.refreshToken.length > 10 && cca.getTokenCache().deserialize(cacheDoc.refreshToken);
        }
    } catch (err) {
        console.error('Cache warm-up error:', err);
    }
};
app.get('/api/accounts', async (req, res) => {
    try {
        const accounts = await Account.find({ email: { $ne: 'global_cache' } }, '-refreshToken -accessToken'); 
        res.json(accounts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/auth/login', async (req, res) => {
    const authCodeUrlParameters = {
        scopes: ["User.Read", "Mail.Read", "Mail.Send", "MailboxSettings.ReadWrite", "offline_access"],
        redirectUri: `${process.env.BACKEND_URL || 'http://localhost:5001'}/api/auth/callback`,
    };
    try {
        const authUrl = await cca.getAuthCodeUrl(authCodeUrlParameters);
        res.redirect(authUrl);
    } catch (error) {
        console.error('Error generating auth url:', error);
        res.status(500).send("Error generating auth url");
    }
});
app.get('/api/auth/callback', async (req, res) => {
    const tokenRequest = {
        code: req.query.code,
        scopes: ["User.Read", "Mail.Read", "Mail.Send", "MailboxSettings.ReadWrite", "offline_access"],
        redirectUri: `${process.env.BACKEND_URL || 'http://localhost:5001'}/api/auth/callback`,
    };
    try {
        const response = await cca.acquireTokenByCode(tokenRequest);
        const { username, name, homeAccountId } = response.account;
        await Account.findOneAndUpdate(
            { email: username },
            { 
                email: username, 
                name: name || username, 
                homeAccountId: homeAccountId,
                refreshToken: "managed-by-msal-cache", 
                accessToken: response.accessToken
            },
            { upsert: true, new: true }
        );
        res.redirect(process.env.FRONTEND_URL || 'http://localhost:5173');
    } catch (error) {
        console.error('Error acquiring token:', error);
        res.status(500).send("Error acquiring token");
    }
});
app.get('/api/emails/:email', async (req, res) => {
    try {
        const accountDoc = await Account.findOne({ email: req.params.email });
        if (!accountDoc) return res.status(404).json({ error: 'Account not found' });

        // Force-load MSAL cache from MongoDB so Render restarts don't break token lookup
        await warmUpCache();

        let accessToken = null;

        // Try MSAL silent token first (most up-to-date)
        try {
            const msalAccount = await cca.getTokenCache().getAccountByHomeId(accountDoc.homeAccountId);
            if (msalAccount) {
                const tokenResponse = await cca.acquireTokenSilent({
                    account: msalAccount,
                    scopes: ["User.Read", "Mail.Read", "Mail.Send", "MailboxSettings.ReadWrite", "offline_access"],
                });
                accessToken = tokenResponse.accessToken;
            }
        } catch (msalErr) {
            console.warn(`MSAL silent token failed for ${req.params.email}, trying stored token:`, msalErr.message);
        }

        // Fallback: use the stored accessToken directly from MongoDB
        if (!accessToken && accountDoc.accessToken) {
            console.log(`Using stored accessToken for ${req.params.email}`);
            accessToken = accountDoc.accessToken;
        }

        if (!accessToken) {
            return res.status(401).json({ error: 'Session expired. Please remove the account and add it again.' });
        }

        // Only fetch emails from the Inbox folder, excluding Sent Items and Drafts
        const graphUrl = `https://graph.microsoft.com/v1.0/me/mailFolders('inbox')/messages?$top=12&$select=sender,subject,receivedDateTime,bodyPreview,body&$orderby=receivedDateTime DESC`;
        const graphResponse = await fetch(graphUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!graphResponse.ok) {
            const errText = await graphResponse.text();
            throw new Error(`Microsoft returned an error: ${graphResponse.statusText} - ${errText}`);
        }
        const data = await graphResponse.json();
        res.json(data.value);
    } catch (error) {
        console.error('Error fetching emails:', error);
        res.status(500).json({ error: error.message });
    }
});
// --- Search API for UI Preview ---
app.post('/api/forward/search', async (req, res) => {
    const { subjectQuery } = req.body;
    if (!subjectQuery) return res.status(400).json({ error: 'Missing subjectQuery' });
    try {
        const accounts = await Account.find({ email: { $ne: 'global_cache' } });
        const forwardedEmailsList = [];
        for (const accountDoc of accounts) {
            try {
                const msalAccount = await cca.getTokenCache().getAccountByHomeId(accountDoc.homeAccountId);
                if (!msalAccount) continue;
                const tokenResponse = await cca.acquireTokenSilent({
                    account: msalAccount,
                    scopes: ["User.Read", "Mail.Read", "Mail.Send", "MailboxSettings.ReadWrite", "offline_access"],
                });
                const searchQuery = `subject:'${subjectQuery}' -from:microsoft.com -from:accountprotection.microsoft.com`;
                const searchResponse = await fetch(`https://graph.microsoft.com/v1.0/me/messages?$search="${encodeURIComponent(searchQuery)}"&$select=id,subject,body,bodyPreview,sender,receivedDateTime`, {
                    headers: { 'Authorization': `Bearer ${tokenResponse.accessToken}`, 'ConsistencyLevel': 'eventual' }
                });
                if (!searchResponse.ok) continue;
                const searchData = await searchResponse.json();
                const matchingEmails = searchData.value;
                for (const email of matchingEmails) {
                    const receivedDate = new Date(email.receivedDateTime);
                    forwardedEmailsList.push({
                        id: email.id,
                        accountId: accountDoc.email,
                        account: accountDoc.email,
                        subject: email.subject || '(No Subject)',
                        sender: email.sender?.emailAddress?.name || email.sender?.emailAddress?.address || 'Unknown Sender',
                        preview: email.bodyPreview || '',
                        body: email.body?.content || 'No content',
                        time: isNaN(receivedDate) ? '' : receivedDate.toLocaleDateString() + ' ' + receivedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    });
                }
            } catch (err) {
                console.error(`Error processing account ${accountDoc.email}:`, err);
            }
        }
        res.json({ matchingEmails: forwardedEmailsList });
    } catch (error) {
        console.error('Error in bulk search:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Auto-Forwarding Rules APIs ---

app.get('/api/autoforward/rules', async (req, res) => {
    try {
        const rules = await Rule.find().sort({ createdAt: -1 });
        res.json(rules);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/autoforward/rules', async (req, res) => {
    const { subjectQuery, targetEmail } = req.body;
    if (!subjectQuery || !targetEmail) {
        return res.status(400).json({ error: 'Missing subjectQuery or targetEmail' });
    }
    try {
        await warmUpCache();
        const accounts = await Account.find({ email: { $ne: 'global_cache' } });
        const graphRuleIds = {};

        for (const accountDoc of accounts) {
            try {
                const msalAccount = await cca.getTokenCache().getAccountByHomeId(accountDoc.homeAccountId);
                if (!msalAccount) continue;
                const tokenResponse = await cca.acquireTokenSilent({
                    account: msalAccount,
                    scopes: ["User.Read", "Mail.Read", "Mail.Send", "MailboxSettings.ReadWrite", "offline_access"],
                });

                const graphUrl = `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messageRules`;
                const ruleBody = {
                    displayName: `Forward_to_${targetEmail}`,
                    sequence: 1,
                    isEnabled: true,
                    conditions: {
                        subjectContains: [subjectQuery]
                    },
                    actions: {
                        forwardTo: [{ emailAddress: { address: targetEmail } }],
                        moveToFolder: "inbox"
                    }
                };

                const response = await fetch(graphUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${tokenResponse.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(ruleBody)
                });

                if (response.ok) {
                    const data = await response.json();
                    graphRuleIds[accountDoc.email] = data.id;
                    console.log(`Created Native Rule ${data.id} for ${accountDoc.email}`);
                } else {
                    const errText = await response.text();
                    console.error(`Failed to create Native Rule for ${accountDoc.email}:`, response.status, errText);
                }
            } catch (err) {
                console.error(`Error processing rule creation for ${accountDoc.email}:`, err);
            }
        }

        const newRule = new Rule({
            subjectQuery,
            targetEmail,
            graphRuleIds
        });
        await newRule.save();
        res.json(newRule);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/autoforward/rules/:id', async (req, res) => {
    try {
        const rule = await Rule.findById(req.params.id);
        if (!rule) return res.status(404).json({ error: 'Rule not found' });

        await warmUpCache();
        const accounts = await Account.find({ email: { $ne: 'global_cache' } });

        // Iterate through graphRuleIds and delete them natively
        if (rule.graphRuleIds && Object.keys(rule.graphRuleIds).length > 0) {
            for (const [accountEmail, graphRuleId] of Object.entries(rule.graphRuleIds)) {
                const accountDoc = accounts.find(a => a.email === accountEmail);
                if (!accountDoc) continue;

                try {
                    const msalAccount = await cca.getTokenCache().getAccountByHomeId(accountDoc.homeAccountId);
                    if (!msalAccount) continue;
                    const tokenResponse = await cca.acquireTokenSilent({
                        account: msalAccount,
                        scopes: ["User.Read", "Mail.Read", "Mail.Send", "MailboxSettings.ReadWrite", "offline_access"],
                    });

                    const graphUrl = `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messageRules/${graphRuleId}`;
                    const response = await fetch(graphUrl, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${tokenResponse.accessToken}` }
                    });

                    if (response.ok || response.status === 204) {
                        console.log(`Deleted Native Rule ${graphRuleId} for ${accountEmail}`);
                    } else {
                        console.error(`Failed to delete Native Rule for ${accountEmail}:`, response.status);
                    }
                } catch (err) {
                    console.error(`Error deleting native rule for ${accountEmail}:`, err);
                }
            }
        }

        await Rule.findByIdAndDelete(req.params.id);
        res.json({ message: 'Rule deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.delete('/api/accounts/:email', async (req, res) => {
    try {
        await Account.findOneAndDelete({ email: req.params.email });
        res.json({ message: 'Account removed' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
