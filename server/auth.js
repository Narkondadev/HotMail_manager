const msal = require('@azure/msal-node');
const Account = require('./models/Account');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const cachePlugin = {
    beforeCacheAccess: async (cacheContext) => {
        try {
            const cacheDoc = await Account.findOne({ email: 'global_cache' });
            if (cacheDoc && cacheDoc.refreshToken) {
                cacheContext.tokenCache.deserialize(cacheDoc.refreshToken);
            }
        } catch (err) {
            console.error('Error reading cache from DB', err);
        }
    },
    afterCacheAccess: async (cacheContext) => {
        if (cacheContext.cacheHasChanged) {
            try {
                const allAccounts = await cacheContext.tokenCache.getAllAccounts();
                if (!allAccounts || allAccounts.length === 0) {
                    return; // NEVER overwrite MongoDB global_cache with an empty cache!
                }
                const serializedCache = cacheContext.tokenCache.serialize();
                if (serializedCache && serializedCache.length > 200) {
                    await Account.findOneAndUpdate(
                        { email: 'global_cache' },
                        { 
                            email: 'global_cache', 
                            name: 'Cache', 
                            homeAccountId: 'cache', 
                            refreshToken: serializedCache 
                        },
                        { upsert: true }
                    );
                }
            } catch (err) {
                console.error('Error writing cache to DB', err);
            }
        }
    }
};
const msalConfig = {
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
    cache: {
        cachePlugin
    }
};
const cca = new msal.ConfidentialClientApplication(msalConfig);
module.exports = { cca };
