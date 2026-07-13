const { cca } = require('.//auth');
const mongoose = require('mongoose');
const Account = require('.//models/Account');
mongoose.connect("mongodb+srv://tuihiyu_db_user:JQtS0gZgJj4wHEBS@cluster0.53l7mnf.mongodb.net/?appName=Cluster0");

async function test() {
    const acc = await Account.findOne({ email: 'jgfh56764@hotmail.com' });
    const msalAccount = await cca.getTokenCache().getAccountByHomeId(acc.homeAccountId);
    const tokenResponse = await cca.acquireTokenSilent({ account: msalAccount, scopes: ["User.Read", "Mail.Read", "Mail.Send", "offline_access"] });
    
    // Test 1: Using only $search with KQL received>=
    // (Wait, KQL requires YYYY-MM-DD or exact dates, let's see if ISO time works)
    const kqlQuery = "subject:'sign' received>=2026-07-12T00:00:00Z";
    const graphUrl1 = `https://graph.microsoft.com/v1.0/me/messages?$search="${encodeURIComponent(kqlQuery)}"&$select=id,subject,receivedDateTime`;
    
    console.log("Testing GraphUrl1:", graphUrl1);
    const res1 = await fetch(graphUrl1, { headers: { 'Authorization': `Bearer ${tokenResponse.accessToken}`, 'ConsistencyLevel': 'eventual' } });
    console.log("Res1:", res1.status, await res1.text());
    
    process.exit(0);
}
test();
