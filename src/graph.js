import { Client } from "@microsoft/microsoft-graph-client";

/**
 * Initializes the Microsoft Graph Client using the access token
 */
export function getGraphClient(accessToken) {
    return Client.init({
        authProvider: (done) => {
            done(null, accessToken);
        }
    });
}

/**
 * Fetches emails from the user's inbox using the Microsoft Graph API
 */
export async function getEmails(accessToken) {
    const client = getGraphClient(accessToken);
    try {
        // Fetch the top 50 messages, ordered by received date
        const response = await client.api('/me/messages')
            .select('id,subject,bodyPreview,body,sender,toRecipients,receivedDateTime')
            .orderby('receivedDateTime DESC')
            .top(50)
            .get();
        return response.value;
    } catch (error) {
        console.error("Error fetching emails via Graph API:", error);
        throw error;
    }
}



