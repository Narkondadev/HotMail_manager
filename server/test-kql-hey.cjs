const { cca } = require('./auth');
const mongoose = require('mongoose');
const Account = require('./models/Account');
mongoose.connect("mongodb+srv://tuihiyu_db_user:JQtS0gZgJj4wHEBS@cluster0.53l7mnf.mongodb.net/?appName=Cluster0");

async function test() {
    const acc = await Account.findOne({ email: 'jgfh56764@hotmail.com' });
    const msalAccount = await cca.getTokenCache().getAccountByHomeId(acc.homeAccountId);
    const tokenResponse = await cca.acquireTokenSilent({ account: msalAccount, scopes: ["User.Read", "Mail.Read", "Mail.Send", "offline_access"] });
    
    // Look at last 24 hours for "hey"
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const kqlQuery1 = `subject:'hey' -from:microsoft.com -from:accountprotection.microsoft.com received>=${pastDate}`;
    const graphUrl1 = `https://graph.microsoft.com/v1.0/me/mailFolders('inbox')/messages?$search="${encodeURIComponent(kqlQuery1)}"&$select=id,subject,receivedDateTime`;
    
    const res1 = await fetch(graphUrl1, { headers: { 'Authorization': `Bearer ${tokenResponse.accessToken}`, 'ConsistencyLevel': 'eventual' } });
    const data1 = await res1.json();
    console.log("Emails found:", data1.value ? data1.value.length : 0);
    if (data1.value) data1.value.forEach(e => console.log(`- ${e.subject} (${e.receivedDateTime})`));
    
    process.exit(0);
}
test();
