const { cca } = require('./auth');
const mongoose = require('mongoose');
const Account = require('./models/Account');
mongoose.connect("mongodb+srv://tuihiyu_db_user:JQtS0gZgJj4wHEBS@cluster0.53l7mnf.mongodb.net/?appName=Cluster0");

async function test() {
    const accounts = await Account.find({ email: { $ne: 'global_cache' } });
    console.log("Checking all accounts for recent emails (last 1 hour)...");
    
    for (const acc of accounts) {
        const msalAccount = await cca.getTokenCache().getAccountByHomeId(acc.homeAccountId);
        const tokenResponse = await cca.acquireTokenSilent({ account: msalAccount, scopes: ["User.Read", "Mail.Read", "Mail.Send", "offline_access"] });
        
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const graphUrl = `https://graph.microsoft.com/v1.0/me/messages?$filter=receivedDateTime ge ${oneHourAgo}&$select=id,subject,receivedDateTime,sender`;
        
        const res = await fetch(graphUrl, { headers: { 'Authorization': `Bearer ${tokenResponse.accessToken}` } });
        const data = await res.json();
        
        if (data.value && data.value.length > 0) {
            console.log(`\nAccount: ${acc.email} has ${data.value.length} recent emails:`);
            data.value.forEach(m => console.log(` - Subject: "${m.subject}" | From: ${m.sender?.emailAddress?.address} | Received: ${m.receivedDateTime}`));
        } else {
            console.log(`\nAccount: ${acc.email} has NO recent emails in the last hour.`);
        }
    }
    process.exit(0);
}
test();
