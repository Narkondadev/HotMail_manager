const { cca } = require('.//auth');
const mongoose = require('mongoose');
const Account = require('.//models/Account');
mongoose.connect("mongodb+srv://tuihiyu_db_user:JQtS0gZgJj4wHEBS@cluster0.53l7mnf.mongodb.net/?appName=Cluster0");

async function test() {
    const acc = await Account.findOne({ email: 'jgfh56764@hotmail.com' });
    const msalAccount = await cca.getTokenCache().getAccountByHomeId(acc.homeAccountId);
    const tokenResponse = await cca.acquireTokenSilent({ account: msalAccount, scopes: ["User.Read", "Mail.Read", "Mail.Send", "offline_access"] });
    
    const isoDate = new Date().toISOString(); // e.g. 2026-07-12T19:37:19.123Z
    console.log("Using ISO:", isoDate);
    const kqlQuery = `subject:'sign' received>=${isoDate}`;
    const graphUrl = `https://graph.microsoft.com/v1.0/me/messages?$search="${encodeURIComponent(kqlQuery)}"&$select=id,subject,receivedDateTime`;
    
    const res = await fetch(graphUrl, { headers: { 'Authorization': `Bearer ${tokenResponse.accessToken}`, 'ConsistencyLevel': 'eventual' } });
    console.log("Res:", res.status, await res.text());
    
    process.exit(0);
}
test();
