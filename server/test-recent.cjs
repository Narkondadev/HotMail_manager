const { cca } = require('./auth');
const mongoose = require('mongoose');
const Account = require('./models/Account');
mongoose.connect("mongodb+srv://tuihiyu_db_user:JQtS0gZgJj4wHEBS@cluster0.53l7mnf.mongodb.net/?appName=Cluster0");

async function test() {
    const accounts = await Account.find({ email: { $ne: 'global_cache' } });
    for (const acc of accounts) {
        const msalAccount = await cca.getTokenCache().getAccountByHomeId(acc.homeAccountId);
        const tokenResponse = await cca.acquireTokenSilent({ account: msalAccount, scopes: ["User.Read", "Mail.Read", "Mail.Send", "offline_access"] });
        
        const graphUrl = `https://graph.microsoft.com/v1.0/me/messages?$top=5&$select=id,subject,receivedDateTime,sender`;
        const res = await fetch(graphUrl, { headers: { 'Authorization': `Bearer ${tokenResponse.accessToken}` } });
        const data = await res.json();
        
        console.log(`\nAccount: ${acc.email} Recent 5 emails:`);
        if(data.value) data.value.forEach(m => console.log(` - [${m.receivedDateTime}] ${m.subject} | From: ${m.sender?.emailAddress?.address}`));
    }
    process.exit(0);
}
test();
