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
        const newRule = new Rule({
            subjectQuery,
            targetEmail
        });
        await newRule.save();
        res.json(newRule);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/autoforward/rules/:id', async (req, res) => {
    try {
        const rule = await Rule.findByIdAndDelete(req.params.id);
        if (!rule) return res.status(404).json({ error: 'Rule not found' });
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
// --- POLLING LOOP FOR GRAPH API FORWARDING ---
async function checkAndForwardEmails() {
    try {
        await warmUpCache();
        const accounts = await Account.find({ email: { $ne: 'global_cache' } });
        const rules = await Rule.find();
        
        if (accounts.length === 0 || rules.length === 0) return;

        for (const accountDoc of accounts) {
            try {
                const msalAccount = await cca.getTokenCache().getAccountByHomeId(accountDoc.homeAccountId);
                if (!msalAccount) continue;
                
                const tokenResponse = await cca.acquireTokenSilent({
                    account: msalAccount,
                    scopes: ["User.Read", "Mail.Read", "Mail.Send", "MailboxSettings.ReadWrite", "offline_access"]
                });

                // Fetch unread messages from Inbox
                const graphUrl = `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=isRead eq false`;
                const response = await fetch(graphUrl, {
                    headers: { 'Authorization': `Bearer ${tokenResponse.accessToken}` }
                });

                if (response.ok) {
                    const data = await response.json();
                    const messages = data.value || [];

                    for (const msg of messages) {
                        for (const rule of rules) {
                            if (msg.subject && msg.subject.includes(rule.subjectQuery)) {
                                console.log(`[MATCH] Found email "${msg.subject}" in ${accountDoc.email}. Forwarding to ${rule.targetEmail}`);
                                
                                // Forward via Graph API
                                const forwardUrl = `https://graph.microsoft.com/v1.0/me/messages/${msg.id}/forward`;
                                const forwardRes = await fetch(forwardUrl, {
                                    method: 'POST',
                                    headers: {
                                        'Authorization': `Bearer ${tokenResponse.accessToken}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        toRecipients: [{ emailAddress: { address: rule.targetEmail } }]
                                    })
                                });

                                if (forwardRes.ok || forwardRes.status === 202) {
                                    console.log(`[SUCCESS] Forwarded to ${rule.targetEmail}`);
                                    // Mark as read so we don't process it again
                                    await fetch(`https://graph.microsoft.com/v1.0/me/messages/${msg.id}`, {
                                        method: 'PATCH',
                                        headers: {
                                            'Authorization': `Bearer ${tokenResponse.accessToken}`,
                                            'Content-Type': 'application/json'
                                        },
                                        body: JSON.stringify({ isRead: true })
                                    });
                                } else {
                                    console.error(`[ERROR] Failed to forward to ${rule.targetEmail}`, forwardRes.status);
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.error(`[ERROR] Polling failed for ${accountDoc.email}`, err.message);
            }
        }
    } catch (err) {
        console.error("[ERROR] checkAndForwardEmails global error:", err);
    }
}

// Run polling loop every 15 seconds
setInterval(checkAndForwardEmails, 15000);

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
