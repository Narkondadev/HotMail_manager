const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { cca, msal, msalConfig } = require('./auth');
const Account = require('./models/Account');
const Share = require('./models/Share');
const Customer = require('./models/Customer');
const app = express();
const PORT = process.env.PORT || 5001;
app.use(cors());
app.use(express.json());
mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('Connected to MongoDB');
        Share.collection.dropIndex('otp_1').catch(() => { });
        Share.collection.dropIndex('createdAt_1').catch(() => { });
        await warmUpCache();
        console.log('MSAL cache pre-warmed at startup.');
        // Silently migrate all account tokens from global_cache blob to per-account storage
        migrateToPerAccountCache().catch(() => { });
    })
    .catch(err => console.error('MongoDB connection error:', err));

const crypto = require('crypto');

// Admin Auth Middleware
const authenticateAdmin = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
    const expectedToken = crypto.createHash('sha256').update(adminPassword).digest('hex');

    if (token === expectedToken) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// Admin Login Endpoint
app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';

    if (email === 'tuihiyu@gmail.com' && password === adminPassword) {
        const token = crypto.createHash('sha256').update(adminPassword).digest('hex');
        res.json({ success: true, token });
    } else {
        res.status(401).json({ error: 'Invalid email or password' });
    }
});

// ============================================================
// PER-ACCOUNT MSAL CCA FACTORY
// Creates a lightweight CCA that loads/saves only 1 account's
// tokens instead of the entire 1.2MB+ global blob.
// Scales to 1000+ accounts without performance degradation.
// ============================================================
const createPerAccountCCA = (accountEmail) => {
    const accountCachePlugin = {
        beforeCacheAccess: async (cacheContext) => {
            try {
                const acc = await Account.findOne({ email: accountEmail }, 'msalCache');
                if (acc && acc.msalCache && acc.msalCache.length > 100) {
                    cacheContext.tokenCache.deserialize(acc.msalCache);
                }
            } catch (e) { }
        },
        afterCacheAccess: async (cacheContext) => {
            if (cacheContext.cacheHasChanged) {
                try {
                    const allAccs = await cacheContext.tokenCache.getAllAccounts();
                    if (allAccs && allAccs.length > 0) {
                        const serialized = cacheContext.tokenCache.serialize();
                        if (serialized && serialized.length > 100) {
                            await Account.findOneAndUpdate(
                                { email: accountEmail },
                                { msalCache: serialized },
                                { upsert: false }
                            );
                        }
                    }
                } catch (e) { }
            }
        }
    };
    return new msal.ConfidentialClientApplication({
        auth: msalConfig.auth,
        cache: { cachePlugin: accountCachePlugin }
    });
};

// ============================================================
// EXTRACT PER-ACCOUNT CACHE FROM GLOBAL BLOB (MIGRATION)
// Parses global cache JSON and extracts entries for one account
// by homeAccountId prefix — no API calls needed.
// ============================================================
const extractPerAccountCache = (globalCacheJson, homeAccountId) => {
    try {
        const cache = JSON.parse(globalCacheJson);
        const prefix = homeAccountId.toLowerCase();
        const pick = (obj) => Object.fromEntries(
            Object.entries(obj || {}).filter(([k]) => k.toLowerCase().startsWith(prefix))
        );
        return JSON.stringify({
            Account: pick(cache.Account),
            AccessToken: pick(cache.AccessToken),
            RefreshToken: pick(cache.RefreshToken),
            IdToken: pick(cache.IdToken),
            AppMetadata: {}
        });
    } catch (e) { return null; }
};

// ============================================================
// SILENT MIGRATION: global_cache blob → per-account msalCache
// Runs once at startup. Does NOT call any Microsoft API.
// Accounts without msalCache get their tokens extracted from
// the global blob and saved individually. Zero re-auth needed.
// ============================================================
const migrateToPerAccountCache = async () => {
    try {
        const cacheDoc = await Account.findOne({ email: 'global_cache' });
        if (!cacheDoc || !cacheDoc.refreshToken || cacheDoc.refreshToken.length < 200) return;
        const accounts = await Account.find(
            { email: { $ne: 'global_cache' }, msalCache: { $exists: false } },
            'email homeAccountId msalCache'
        );
        let migrated = 0;
        for (const acc of accounts) {
            if (!acc.homeAccountId) continue;
            const perCache = extractPerAccountCache(cacheDoc.refreshToken, acc.homeAccountId);
            if (!perCache) continue;
            const parsed = JSON.parse(perCache);
            if (Object.keys(parsed.Account || {}).length > 0) {
                await Account.findOneAndUpdate({ email: acc.email }, { msalCache: perCache });
                migrated++;
            }
        }
        if (migrated > 0) console.log(`✅ Migrated ${migrated} accounts to per-account MSAL cache.`);
    } catch (e) {
        console.error('Migration error:', e.message);
    }
};

// ============================================================
// UNIFIED TOKEN ACQUISITION (per-account → global fallback)
// Tries per-account CCA first (fast, 2KB load).
// Falls back to global CCA if no per-account cache exists yet.
// Auto-saves per-account cache after successful global lookup.
// ============================================================
const getAccessTokenForAccount = async (accountDoc) => {
    const scopes = ["User.Read", "Mail.Read", "Mail.Send", "MailboxSettings.ReadWrite", "offline_access"];

    // Layer 1: Per-account CCA (fast — loads only 2KB for this account)
    if (accountDoc.msalCache && accountDoc.msalCache.length > 100) {
        try {
            const perCCA = createPerAccountCCA(accountDoc.email);
            const allAccs = await perCCA.getTokenCache().getAllAccounts();
            if (allAccs && allAccs.length > 0) {
                const tokenRes = await perCCA.acquireTokenSilent({ account: allAccs[0], scopes });
                if (tokenRes && tokenRes.accessToken) return tokenRes.accessToken;
            }
        } catch (e) {
            console.warn(`Per-account token failed for ${accountDoc.email}:`, e.message);
        }
    }

    // Layer 2: Global CCA fallback (used until migration is complete)
    await warmUpCache();
    try {
        const msalAcc = await getMsalAccount(accountDoc.homeAccountId, accountDoc.email);
        if (msalAcc) {
            const tokenRes = await cca.acquireTokenSilent({ account: msalAcc, scopes });
            if (tokenRes && tokenRes.accessToken) {
                // Lazy migration: extract this account's cache and save it
                const perCache = extractPerAccountCache(cca.getTokenCache().serialize(), accountDoc.homeAccountId);
                if (perCache && Object.keys(JSON.parse(perCache).Account || {}).length > 0) {
                    Account.findOneAndUpdate({ email: accountDoc.email }, { msalCache: perCache }).catch(() => { });
                }
                await saveMsalCache();
                return tokenRes.accessToken;
            }
        }
    } catch (e) {
        console.warn(`Global CCA token failed for ${accountDoc.email}:`, e.message);
    }

    // Layer 3: Direct refresh token fallback
    if (accountDoc.refreshToken && accountDoc.refreshToken.length > 30 && accountDoc.refreshToken !== 'managed-by-msal-cache') {
        try {
            const tokenRes = await cca.acquireTokenByRefreshToken({ refreshToken: accountDoc.refreshToken, scopes });
            if (tokenRes && tokenRes.accessToken) {
                accountDoc.accessToken = tokenRes.accessToken;
                await accountDoc.save().catch(() => { });
                await saveMsalCache();
                return tokenRes.accessToken;
            }
        } catch (e) { }
    }

    // Layer 4: Stored JWT fallback
    if (accountDoc.accessToken && accountDoc.accessToken !== 'managed-by-msal-cache' && accountDoc.accessToken.includes('.')) {
        return accountDoc.accessToken;
    }

    return null;
};

// ============================================================
// IN-MEMORY EMAIL CACHE (fast dedup within same second)
// DB cache is primary; this prevents parallel duplicate requests
// ============================================================
const emailCache = new Map();
const EMAIL_CACHE_TTL_MS = 5 * 1000; // 5-second dedup guard only

const getEmailCache = (email) => {
    const cached = emailCache.get(email);
    if (cached && (Date.now() - cached.timestamp) < EMAIL_CACHE_TTL_MS) {
        return cached.data;
    }
    return null;
};

const setEmailCache = (email, data) => {
    emailCache.set(email, { data, timestamp: Date.now() });
};

const invalidateEmailCache = (email) => {
    emailCache.delete(email);
};

// Force MSAL to load its token cache from MongoDB before any token operation
let isCacheWarmed = false;
const warmUpCache = async (force = false) => {
    if (isCacheWarmed && !force) return;
    try {
        const cacheDoc = await Account.findOne({ email: 'global_cache' });
        if (cacheDoc && cacheDoc.refreshToken) {
            cacheDoc.refreshToken.length > 10 && cca.getTokenCache().deserialize(cacheDoc.refreshToken);
            isCacheWarmed = true;
        }
    } catch (err) {
        console.error('Cache warm-up error:', err);
    }
};

const saveMsalCache = async () => {
    try {
        const allAccounts = await cca.getTokenCache().getAllAccounts();
        if (!allAccounts || allAccounts.length === 0) {
            return; // NEVER overwrite MongoDB global_cache with 0 accounts!
        }
        const serialized = cca.getTokenCache().serialize();
        if (serialized && serialized.length > 200) {
            await Account.findOneAndUpdate(
                { email: 'global_cache' },
                {
                    email: 'global_cache',
                    name: 'MSAL Global Cache',
                    homeAccountId: 'global_cache_id',
                    refreshToken: serialized
                },
                { upsert: true, returnDocument: 'after' }
            );
        }
    } catch (err) {
        console.error('Failed to save MSAL cache to MongoDB:', err);
    }
};

const getMsalAccount = async (homeAccountId, userEmail) => {
    try {
        let acc = await cca.getTokenCache().getAccountByHomeId(homeAccountId);
        if (!acc && userEmail) {
            const allAccounts = await cca.getTokenCache().getAllAccounts();
            acc = allAccounts.find(a => a.username && a.username.toLowerCase() === userEmail.toLowerCase());
        }
        return acc;
    } catch (e) {
        return null;
    }
};
app.get('/api/accounts', authenticateAdmin, async (req, res) => {
    try {
        const accounts = await Account.find(
            { email: { $ne: 'global_cache' } },
            '-refreshToken -accessToken -msalCache -cachedEmails -emailsCachedAt'
        );
        res.json(accounts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});




// --- Individual Account Token Verification Endpoint ---
app.post('/api/accounts/verify-one', authenticateAdmin, async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Email parameter required' });
    }
    try {
        await warmUpCache();
        const accountDoc = await Account.findOne({ email: email.trim().toLowerCase() });
        if (!accountDoc) {
            return res.status(404).json({ error: 'Account not found' });
        }

        let accessToken = null;
        let tokenValid = false;
        const scopes = ["User.Read", "Mail.Read", "Mail.Send", "MailboxSettings.ReadWrite", "offline_access"];

        try {
            const msalAccount = await getMsalAccount(accountDoc.homeAccountId, accountDoc.email);
            if (msalAccount) {
                const tokenResponse = await cca.acquireTokenSilent({
                    account: msalAccount,
                    scopes: scopes,
                });
                if (tokenResponse && tokenResponse.accessToken) {
                    accessToken = tokenResponse.accessToken;
                }
            }
            if (!accessToken && accountDoc.accessToken && accountDoc.accessToken !== 'managed-by-msal-cache' && accountDoc.accessToken.includes('.')) {
                accessToken = accountDoc.accessToken;
            }
        } catch (err) {
            console.warn(`Silent token acquisition failed for ${accountDoc.email}:`, err.message);
        }

        if (accessToken) {
            try {
                const testResponse = await fetch('https://graph.microsoft.com/v1.0/me?$select=id', {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                tokenValid = testResponse.ok;
            } catch (e) {
                tokenValid = false;
            }
        }

        const newStatus = tokenValid ? 'active' : 'blocked';
        accountDoc.status = newStatus;
        await accountDoc.save().catch(() => { });
        await saveMsalCache();

        res.json({ success: true, email: accountDoc.email, status: accountDoc.status });
    } catch (error) {
        console.error('Verify-one health error:', error);
        res.status(500).json({ error: error.message });
    }
});

// loginCca: no-cache CCA used ONLY for adding new accounts.
// Never reads/writes the global_cache blob (334 accounts = very large).
// All existing accounts continue to use createPerAccountCCA() as before.
const loginCca = new msal.ConfidentialClientApplication({ auth: msalConfig.auth });

app.get('/api/auth/login', async (req, res) => {
    const authCodeUrlParameters = {
        scopes: ["User.Read", "Mail.Read", "Mail.Send", "MailboxSettings.ReadWrite", "offline_access"],
        redirectUri: `${process.env.BACKEND_URL || 'http://localhost:5001'}/api/auth/callback`,
    };
    try {
        const authUrl = await loginCca.getAuthCodeUrl(authCodeUrlParameters);
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
        const response = await loginCca.acquireTokenByCode(tokenRequest);
        const { username, name, homeAccountId } = response.account;
        // Extract only this new account's tokens — global_cache blob NOT involved
        const perCache = extractPerAccountCache(loginCca.getTokenCache().serialize(), homeAccountId);
        await Account.findOneAndUpdate(
            { email: username },
            {
                email: username,
                name: name || username,
                homeAccountId: homeAccountId,
                refreshToken: response.refreshToken || "managed-by-msal-cache",
                accessToken: response.accessToken,
                msalCache: perCache || undefined,
                status: 'active'
            },
            { upsert: true, returnDocument: 'after' }
        );
        // saveMsalCache() removed — per-account msalCache above is sufficient.
        // global_cache (334 accounts) is NOT touched during login anymore.
        res.redirect(process.env.FRONTEND_URL || 'http://localhost:5173');
    } catch (error) {
        console.error('Error acquiring token:', error);
        res.status(500).send("Error acquiring token");
    }
});
app.get('/api/emails/:email', authenticateAdmin, async (req, res) => {
    try {
        const emailKey = req.params.email.toLowerCase();

        // ⚡ SPEED: Check 5-second in-memory dedup guard first
        const memCached = getEmailCache(emailKey);
        if (memCached) return res.json(memCached);

        // ⚡ SPEED: Fetch account doc (includes DB email cache)
        const accountDoc = await Account.findOne({ email: emailKey });
        if (!accountDoc) return res.status(404).json({ error: 'Account not found' });

        // ⚡ SPEED: Check 1-minute DB email cache (primary cache layer)
        const ONE_MINUTE = 60 * 1000;
        if (accountDoc.cachedEmails && accountDoc.emailsCachedAt &&
            (Date.now() - new Date(accountDoc.emailsCachedAt).getTime()) < ONE_MINUTE) {
            setEmailCache(emailKey, accountDoc.cachedEmails); // also warm RAM
            return res.json(accountDoc.cachedEmails);
        }

        // DB cache miss — get fresh token and fetch from Microsoft
        const accessToken = await getAccessTokenForAccount(accountDoc);
        if (!accessToken) {
            return res.status(401).json({ error: 'Session expired. Please re-authenticate via Add New Hotmail.' });
        }

        const graphUrl = `https://graph.microsoft.com/v1.0/me/mailFolders('inbox')/messages?$top=6&$select=id,sender,subject,receivedDateTime,bodyPreview,body&$orderby=receivedDateTime DESC`;
        const graphResponse = await fetch(graphUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!graphResponse.ok) {
            const errText = await graphResponse.text();
            if (graphResponse.status === 401 || errText.includes('invalid_grant')) {
                accountDoc.status = 'blocked';
                invalidateEmailCache(emailKey);
                await accountDoc.save().catch(() => { });
            }
            throw new Error(`Microsoft error: ${graphResponse.statusText}`);
        }

        const data = await graphResponse.json();
        const emails = data.value || [];

        // ⚡ SPEED: Save to both DB cache (1-min TTL) and RAM dedup cache
        await Account.findOneAndUpdate(
            { email: emailKey },
            { cachedEmails: emails, emailsCachedAt: new Date(), status: 'active' }
        ).catch(() => { });
        setEmailCache(emailKey, emails);

        res.json(emails);
    } catch (error) {
        console.error('Error fetching emails:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Search API for UI Preview (Parallelized for Speed) ---
app.post('/api/forward/search', authenticateAdmin, async (req, res) => {
    const { subjectQuery } = req.body;
    if (!subjectQuery) return res.status(400).json({ error: 'Missing subjectQuery' });
    try {
        const accounts = await Account.find({ email: { $ne: 'global_cache' } });
        const searchQuery = `subject:'${subjectQuery}' -from:microsoft.com -from:accountprotection.microsoft.com`;

        const searchPromises = accounts.map(async (accountDoc) => {
            try {
                const msalAccount = await cca.getTokenCache().getAccountByHomeId(accountDoc.homeAccountId);
                if (!msalAccount) return [];
                const tokenResponse = await cca.acquireTokenSilent({
                    account: msalAccount,
                    scopes: ["User.Read", "Mail.Read", "Mail.Send", "MailboxSettings.ReadWrite", "offline_access"],
                });
                const searchResponse = await fetch(`https://graph.microsoft.com/v1.0/me/messages?$search="${encodeURIComponent(searchQuery)}"&$select=id,subject,body,bodyPreview,sender,receivedDateTime`, {
                    headers: { 'Authorization': `Bearer ${tokenResponse.accessToken}`, 'ConsistencyLevel': 'eventual' }
                });
                if (!searchResponse.ok) return [];
                const searchData = await searchResponse.json();
                const matchingEmails = searchData.value || [];
                return matchingEmails.map(email => {
                    const receivedDate = new Date(email.receivedDateTime);
                    return {
                        id: email.id,
                        accountId: accountDoc.email,
                        account: accountDoc.email,
                        subject: email.subject || '(No Subject)',
                        sender: email.sender?.emailAddress?.name || email.sender?.emailAddress?.address || 'Unknown Sender',
                        preview: email.bodyPreview || '',
                        body: email.body?.content || 'No content',
                        time: isNaN(receivedDate) ? '' : receivedDate.toLocaleDateString() + ' ' + receivedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    };
                });
            } catch (err) {
                console.error(`Error processing account ${accountDoc.email}:`, err);
                return [];
            }
        });

        const resultsArray = await Promise.all(searchPromises);
        const forwardedEmailsList = resultsArray.flat();
        res.json({ matchingEmails: forwardedEmailsList });
    } catch (error) {
        console.error('Error in bulk search:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Auto-Forwarding Stub Endpoints (Disabled to prevent RAM overload) ---
app.get('/api/autoforward/rules', authenticateAdmin, (req, res) => res.json([]));
app.post('/api/autoforward/rules', authenticateAdmin, (req, res) => res.status(400).json({ error: 'Auto-forwarding feature disabled to prevent high RAM usage.' }));

// --- CUSTOMER ENDPOINTS ---
app.get('/api/customers', authenticateAdmin, async (req, res) => {
    try {
        const customers = await Customer.find().sort({ createdAt: -1 });
        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/customers', authenticateAdmin, async (req, res) => {
    const { name, otp, hotmailEmails } = req.body;
    if (!name || !otp || !hotmailEmails || !Array.isArray(hotmailEmails) || hotmailEmails.length === 0) {
        return res.status(400).json({ error: 'Customer name, 6-digit OTP, and at least one assigned Hotmail are required.' });
    }
    try {
        const newCustomer = new Customer({
            name: name.trim(),
            otp: otp.trim(),
            hotmailEmails: hotmailEmails.map(e => e.trim().toLowerCase())
        });
        await newCustomer.save();
        res.json(newCustomer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/customers/:id', authenticateAdmin, async (req, res) => {
    try {
        const customer = await Customer.findByIdAndDelete(req.params.id);
        if (!customer) return res.status(404).json({ error: 'Customer not found' });
        res.json({ message: 'Customer deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/customers/:id', authenticateAdmin, async (req, res) => {
    const { name, otp, hotmailEmails } = req.body;
    if (!name || !otp || !hotmailEmails || !Array.isArray(hotmailEmails) || hotmailEmails.length === 0) {
        return res.status(400).json({ error: 'Customer name, 6-digit OTP, and at least one assigned Hotmail are required.' });
    }
    try {
        const updatedCustomer = await Customer.findByIdAndUpdate(
            req.params.id,
            {
                name: name.trim(),
                otp: otp.trim(),
                hotmailEmails: hotmailEmails.map(e => e.trim().toLowerCase())
            },
            { new: true }
        );
        if (!updatedCustomer) return res.status(404).json({ error: 'Customer not found' });
        res.json(updatedCustomer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/customers/verify', async (req, res) => {
    const { otp } = req.body;
    if (!otp) {
        return res.status(400).json({ error: 'OTP code required' });
    }
    try {
        const customer = await Customer.findOne({ otp: otp.trim() });
        if (!customer) {
            return res.status(401).json({ error: 'Invalid Customer Access OTP' });
        }
        res.json({
            success: true,
            customer: {
                _id: customer._id,
                name: customer.name,
                otp: customer.otp,
                hotmailEmails: customer.hotmailEmails
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/customers/unlock-inbox', async (req, res) => {
    const { customerOtp, hotmailEmail, shareOtp } = req.body;
    if (!customerOtp || !hotmailEmail || !shareOtp) {
        return res.status(400).json({ error: 'Customer Access OTP, Hotmail Email, and Share OTP code are required.' });
    }
    try {
        // ⚡ SPEED: Run customer lookup + Account + Shares all in parallel
        const [customer, , matchingShares] = await Promise.all([
            Customer.findOne({ otp: customerOtp.trim() }),
            warmUpCache(),
            Share.find({ otp: shareOtp.trim() })
        ]);
        if (!customer) {
            return res.status(401).json({ error: 'Invalid Security Access OTP.' });
        }
        const normalizedEmail = hotmailEmail.trim().toLowerCase();
        if (!customer.hotmailEmails.map(e => e.toLowerCase()).includes(normalizedEmail)) {
            return res.status(403).json({ error: 'Access Denied: This Hotmail address is not assigned to your Customer profile.' });
        }

        const accountDoc = await Account.findOne({ email: normalizedEmail });
        if (!accountDoc) {
            return res.status(404).json({ error: 'Hotmail account not found in system.' });
        }

        // ⚡ SPEED: Check 1-minute DB email cache first
        const ONE_MINUTE = 60 * 1000;
        let allMessages = null;
        if (accountDoc.cachedEmails && accountDoc.emailsCachedAt &&
            (Date.now() - new Date(accountDoc.emailsCachedAt).getTime()) < ONE_MINUTE) {
            allMessages = accountDoc.cachedEmails;
        }

        if (!allMessages) {
            // DB cache miss — get fresh token via per-account CCA
            const accessToken = await getAccessTokenForAccount(accountDoc);
            if (!accessToken) {
                if (accountDoc.status !== 'blocked') {
                    await Account.findOneAndUpdate({ email: normalizedEmail }, { status: 'blocked' });
                }
                return res.status(401).json({ error: 'Account session expired. Please contact admin to re-authenticate.' });
            }

            const graphUrl = `https://graph.microsoft.com/v1.0/me/mailFolders('inbox')/messages?$top=6&$select=id,sender,subject,bodyPreview,body,receivedDateTime&$orderby=receivedDateTime DESC`;
            const fetchResponse = await fetch(graphUrl, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            if (!fetchResponse.ok) {
                const errText = await fetchResponse.text();
                return res.status(fetchResponse.status).json({ error: `Microsoft Graph API error: ${errText}` });
            }

            const emailData = await fetchResponse.json();
            allMessages = emailData.value || [];
            // ⚡ SPEED: Save to DB cache (1-min TTL) + auto-heal status
            Account.findOneAndUpdate(
                { email: normalizedEmail },
                { cachedEmails: allMessages, emailsCachedAt: new Date(), status: 'active' }
            ).catch(() => { });
        }

        // Apply subject filters in-memory (zero extra API calls)
        let rawQuery = shareOtp.trim();
        let subjectQueries = [];
        if (matchingShares && matchingShares.length > 0) {
            subjectQueries = matchingShares.map(s => s.subjectQuery.trim().toLowerCase()).filter(Boolean);
        } else if (rawQuery && rawQuery.toLowerCase() !== customerOtp.trim().toLowerCase()) {
            subjectQueries = [rawQuery.toLowerCase()];
        }

        let filteredMessages = allMessages;
        if (subjectQueries.length > 0) {
            const matching = allMessages.filter(m => {
                const subLower = (m.subject || '').toLowerCase();
                const bodyLower = (m.bodyPreview || '').toLowerCase();
                return subjectQueries.some(q => subLower.includes(q) || bodyLower.includes(q));
            });
            if (matching.length > 0) filteredMessages = matching;
        }

        const displayFilter = matchingShares.length > 0
            ? matchingShares.map(s => s.subjectQuery).join(', ')
            : (rawQuery || 'Inbox Feed');

        res.json({
            share: { hotmailEmail: normalizedEmail, subjectQuery: displayFilter, otp: shareOtp.trim() },
            emails: filteredMessages
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/customers/emails', async (req, res) => {
    const { customerOtp, hotmailEmail, subjectFilter } = req.body;
    if (!customerOtp || !hotmailEmail) {
        return res.status(400).json({ error: 'Customer Access OTP and Hotmail Email are required.' });
    }
    try {
        // ⚡ SPEED: Run customer lookup + Share lookup in parallel
        const rawQuery = (subjectFilter || '').trim();
        const [customer, matchingShares] = await Promise.all([
            Customer.findOne({ otp: customerOtp.trim() }),
            Share.find({ otp: rawQuery })
        ]);
        if (!customer) {
            return res.status(401).json({ error: 'Invalid Customer Access OTP.' });
        }
        const normalizedEmail = hotmailEmail.trim().toLowerCase();
        if (!customer.hotmailEmails.map(e => e.toLowerCase()).includes(normalizedEmail)) {
            return res.status(403).json({ error: 'This Hotmail address is not assigned to your Customer profile.' });
        }

        const accountDoc = await Account.findOne({ email: normalizedEmail });
        if (!accountDoc) {
            return res.status(404).json({ error: 'Hotmail account not found in system.' });
        }

        // ⚡ SPEED: Check 1-minute DB email cache
        const ONE_MINUTE = 60 * 1000;
        let allMessages = null;
        if (accountDoc.cachedEmails && accountDoc.emailsCachedAt &&
            (Date.now() - new Date(accountDoc.emailsCachedAt).getTime()) < ONE_MINUTE) {
            allMessages = accountDoc.cachedEmails;
        }

        if (!allMessages) {
            const accessToken = await getAccessTokenForAccount(accountDoc);
            if (!accessToken) {
                return res.status(401).json({ error: 'Account session expired. Please contact admin.' });
            }

            const graphUrl = `https://graph.microsoft.com/v1.0/me/mailFolders('inbox')/messages?$top=6&$select=id,sender,subject,bodyPreview,body,receivedDateTime&$orderby=receivedDateTime DESC`;
            const fetchResponse = await fetch(graphUrl, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            if (!fetchResponse.ok) {
                const errText = await fetchResponse.text();
                return res.status(fetchResponse.status).json({ error: `Microsoft Graph API error: ${errText}` });
            }

            const emailData = await fetchResponse.json();
            allMessages = emailData.value || [];
            // ⚡ SPEED: Save to DB cache (1-min TTL)
            Account.findOneAndUpdate(
                { email: normalizedEmail },
                { cachedEmails: allMessages, emailsCachedAt: new Date() }
            ).catch(() => { });
        }

        // Apply subject filters in-memory (no extra API calls)
        let subjectQueries = [];
        if (matchingShares && matchingShares.length > 0) {
            subjectQueries = matchingShares.map(s => s.subjectQuery.trim().toLowerCase()).filter(Boolean);
        } else if (rawQuery && rawQuery.toLowerCase() !== customerOtp.trim().toLowerCase()) {
            subjectQueries = [rawQuery.toLowerCase()];
        }

        let filteredMessages = allMessages;
        if (subjectQueries.length > 0) {
            const matching = allMessages.filter(m => {
                const subLower = (m.subject || '').toLowerCase();
                const bodyLower = (m.bodyPreview || '').toLowerCase();
                return subjectQueries.some(q => subLower.includes(q) || bodyLower.includes(q));
            });
            if (matching.length > 0) filteredMessages = matching;
        }

        res.json(filteredMessages);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- SHARE ENDPOINTS ---
app.get('/api/shares', authenticateAdmin, async (req, res) => {
    try {
        const shares = await Share.find().sort({ createdAt: -1 });
        res.json(shares);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/shares', authenticateAdmin, async (req, res) => {
    const { subjectQuery, customOtp, otp: rawOtp } = req.body;
    const otp = (customOtp || rawOtp || '').trim();
    if (!subjectQuery || !otp) {
        return res.status(400).json({ error: 'Missing subjectQuery or OTP code.' });
    }
    try {
        const newShare = new Share({
            otp,
            subjectQuery: subjectQuery.trim()
        });
        await newShare.save();
        res.json(newShare);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/shares/:id', authenticateAdmin, async (req, res) => {
    try {
        const share = await Share.findByIdAndDelete(req.params.id);
        if (!share) return res.status(404).json({ error: 'Share not found' });
        res.json({ message: 'Share stopped successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/shares/verify', async (req, res) => {
    const { hotmailEmail, otp } = req.body;
    if (!hotmailEmail || !otp) {
        return res.status(400).json({ error: 'Missing Hotmail email or OTP code.' });
    }
    try {
        const shares = await Share.find({ otp: otp.trim() });
        if (!shares || shares.length === 0) {
            return res.status(401).json({ error: 'Invalid OTP code.' });
        }
        const accountDoc = await Account.findOne({ email: hotmailEmail.trim().toLowerCase() });
        if (!accountDoc) {
            return res.status(401).json({ error: 'This Hotmail account is not registered on the platform.' });
        }
        const combinedSubjects = shares.map(s => s.subjectQuery).join(', ');
        res.json({
            success: true,
            share: {
                _id: shares[0]._id,
                otp: otp.trim(),
                subjectQuery: combinedSubjects,
                hotmailEmail: accountDoc.email
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/shares/emails', async (req, res) => {
    const { hotmailEmail, otp } = req.query;
    if (!hotmailEmail || !otp) {
        return res.status(400).json({ error: 'Missing credentials' });
    }
    try {
        const shares = await Share.find({ otp: otp.trim() });
        if (!shares || shares.length === 0) return res.status(401).json({ error: 'Session invalid or expired' });

        const accountDoc = await Account.findOne({ email: hotmailEmail.trim().toLowerCase() });
        if (!accountDoc) return res.status(404).json({ error: 'Hotmail account not registered' });

        await warmUpCache();
        let accessToken = null;
        try {
            const msalAccount = await getMsalAccount(accountDoc.homeAccountId, accountDoc.email);
            if (msalAccount) {
                const tokenResponse = await cca.acquireTokenSilent({
                    account: msalAccount,
                    scopes: ["User.Read", "Mail.Read", "Mail.Send", "MailboxSettings.ReadWrite", "offline_access"],
                });
                accessToken = tokenResponse.accessToken;
                await saveMsalCache();
            }
        } catch (err) {
            console.error('Silent token acquisition failed for share emails, trying fallback:', err.message);
        }

        if (!accessToken && accountDoc.accessToken && accountDoc.accessToken !== 'managed-by-msal-cache' && accountDoc.accessToken.includes('.')) {
            accessToken = accountDoc.accessToken;
        }

        if (!accessToken) {
            // Auto-flag this account as blocked so admin sees red dot immediately
            if (accountDoc.status !== 'blocked') {
                accountDoc.status = 'blocked';
                await accountDoc.save().catch(() => { });
            }
            return res.status(401).json({ error: 'Session expired. Account requires re-authentication by Admin.' });
        }

        const graphUrl = `https://graph.microsoft.com/v1.0/me/mailFolders('inbox')/messages?$top=6&$select=sender,subject,receivedDateTime,bodyPreview,body&$orderby=receivedDateTime DESC`;
        const graphResponse = await fetch(graphUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!graphResponse.ok) {
            const errText = await graphResponse.text();
            if (graphResponse.status === 401 || errText.includes('Unauthorized') || errText.includes('invalid_grant')) {
                if (accountDoc.status !== 'blocked') {
                    accountDoc.status = 'blocked';
                    await accountDoc.save().catch(() => { });
                }
            }
            throw new Error(`Microsoft returned an error: ${graphResponse.statusText}`);
        }
        // Token worked - restore status to active if it was blocked
        if (accountDoc.status === 'blocked') {
            accountDoc.status = 'active';
            await accountDoc.save().catch(() => { });
        }
        const data = await graphResponse.json();

        const subjectQueries = shares.map(s => s.subjectQuery.trim().toLowerCase()).filter(Boolean);
        const filtered = (data.value || []).filter(msg => {
            if (!msg.subject) return false;
            const lowerSubj = msg.subject.toLowerCase();
            return subjectQueries.some(q => lowerSubj.includes(q));
        });

        res.json(filtered);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.delete('/api/accounts/:email', authenticateAdmin, async (req, res) => {
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
