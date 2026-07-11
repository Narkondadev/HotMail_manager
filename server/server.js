require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { cca } = require('./auth');
const Account = require('./models/Account');
const app = express();
const PORT = process.env.PORT || 5001;
app.use(cors());
app.use(express.json());
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));
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
        scopes: ["User.Read", "Mail.Read", "Mail.Send", "offline_access"],
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
        scopes: ["User.Read", "Mail.Read", "Mail.Send", "offline_access"],
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
        res.redirect(process.env.FRONTEND_URL);
    } catch (error) {
        console.error('Error acquiring token:', error);
        res.status(500).send("Error acquiring token");
    }
});
app.get('/api/emails/:email', async (req, res) => {
    try {
        const accountDoc = await Account.findOne({ email: req.params.email });
        if (!accountDoc) return res.status(404).json({ error: 'Account not found' });
        const msalAccount = await cca.getTokenCache().getAccountByHomeId(accountDoc.homeAccountId);
        if (!msalAccount) return res.status(401).json({ error: 'Session expired. Please remove the account and add it again.' });
        const tokenResponse = await cca.acquireTokenSilent({
            account: msalAccount,
            scopes: ["User.Read", "Mail.Read", "Mail.Send", "offline_access"],
        });
        const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/messages?$select=sender,subject,bodyPreview,body,receivedDateTime&$orderby=receivedDateTime DESC&$top=50', {
            headers: { 'Authorization': `Bearer ${tokenResponse.accessToken}` }
        });
        if (!graphResponse.ok) {
            throw new Error(`Microsoft returned an error: ${graphResponse.statusText}`);
        }
        const data = await graphResponse.json();
        res.json(data.value);
    } catch (error) {
        console.error('Error fetching emails:', error);
        res.status(500).json({ error: error.message });
    }
});
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
                    scopes: ["User.Read", "Mail.Read", "Mail.Send", "offline_access"],
                });
                const searchResponse = await fetch(`https://graph.microsoft.com/v1.0/me/messages?$search="subject:${encodeURIComponent(subjectQuery)}"&$select=id,subject,body,bodyPreview,sender,receivedDateTime`, {
                    headers: { 'Authorization': `Bearer ${tokenResponse.accessToken}` }
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
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
app.post('/api/forward/execute', async (req, res) => {
    const { subjectQuery, targetEmail } = req.body;
    if (!subjectQuery || !targetEmail) {
        return res.status(400).json({ error: 'Missing subjectQuery or targetEmail' });
    }
    try {
        const accounts = await Account.find({ email: { $ne: 'global_cache' } });
        let totalForwarded = 0;
        let accountsProcessed = 0;
        for (const accountDoc of accounts) {
            try {
                const msalAccount = await cca.getTokenCache().getAccountByHomeId(accountDoc.homeAccountId);
                if (!msalAccount) continue;
                const tokenResponse = await cca.acquireTokenSilent({
                    account: msalAccount,
                    scopes: ["User.Read", "Mail.Read", "Mail.Send", "offline_access"],
                });
                const searchResponse = await fetch(`https://graph.microsoft.com/v1.0/me/messages?$search="subject:${encodeURIComponent(subjectQuery)}"&$select=id`, {
                    headers: { 'Authorization': `Bearer ${tokenResponse.accessToken}` }
                });
                if (!searchResponse.ok) continue;
                const searchData = await searchResponse.json();
                const matchingEmails = searchData.value;
                for (const email of matchingEmails) {
                    const forwardBody = {
                        comment: "Automatically forwarded by Hotmail Manager",
                        toRecipients: [{ emailAddress: { address: targetEmail } }]
                    };
                    const forwardResponse = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${email.id}/forward`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${tokenResponse.accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(forwardBody)
                    });
                    if (forwardResponse.ok || forwardResponse.status === 202) {
                        totalForwarded++;
                    }
                    await sleep(3000);
                }
                accountsProcessed++;
            } catch (err) {
                console.error(`Error processing account ${accountDoc.email}:`, err);
            }
        }
        res.json({ message: 'Forwarding complete', accountsProcessed, totalForwarded });
    } catch (error) {
        console.error('Error in bulk forward execute:', error);
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
