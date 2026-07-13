const { cca } = require('./auth');
const mongoose = require('mongoose');
const Account = require('./models/Account');
const Rule = require('./models/Rule');
mongoose.connect("mongodb+srv://tuihiyu_db_user:JQtS0gZgJj4wHEBS@cluster0.53l7mnf.mongodb.net/?appName=Cluster0");

async function test() {
    const acc = await Account.findOne({ email: 'jgfh56764@hotmail.com' });
    const msalAccount = await cca.getTokenCache().getAccountByHomeId(acc.homeAccountId);
    const tokenResponse = await cca.acquireTokenSilent({ account: msalAccount, scopes: ["User.Read", "Mail.Read", "Mail.Send", "offline_access"] });
    
    // Test 1: Date in the past (should return emails)
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const kqlQuery1 = `subject:'sign' received>=${pastDate}`;
    const graphUrl1 = `https://graph.microsoft.com/v1.0/me/messages?$search="${encodeURIComponent(kqlQuery1)}"&$select=id,subject,receivedDateTime`;
    
    const res1 = await fetch(graphUrl1, { headers: { 'Authorization': `Bearer ${tokenResponse.accessToken}`, 'ConsistencyLevel': 'eventual' } });
    const data1 = await res1.json();
    console.log("Past Date Query returned:", data1.value ? data1.value.length : 0, "emails");

    // Test 2: Date in the future (should return 0 emails)
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const kqlQuery2 = `subject:'sign' received>=${futureDate}`;
    const graphUrl2 = `https://graph.microsoft.com/v1.0/me/messages?$search="${encodeURIComponent(kqlQuery2)}"&$select=id,subject,receivedDateTime`;
    
    const res2 = await fetch(graphUrl2, { headers: { 'Authorization': `Bearer ${tokenResponse.accessToken}`, 'ConsistencyLevel': 'eventual' } });
    const data2 = await res2.json();
    console.log("Future Date Query returned:", data2.value ? data2.value.length : 0, "emails");
    
    process.exit(0);
}
test();
