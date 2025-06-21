// Load environment variables from .env file (for local development)
// On Render, these variables are set directly in the Render environment settings.
require('dotenv').config();

// Import necessary modules
const express = require('express');
const webpush = require('web-push');
const cors = require('cors'); // For allowing your Netlify site to talk to this server

const app = express();
// Render automatically provides a PORT environment variable.
// We fall back to 3000 for local development.
const PORT = process.env.PORT || 3000;

// --- Middleware ---
// Allows parsing JSON data from incoming requests (e.g., the subscription object)
app.use(express.json());
// Enable CORS for all routes. This is vital for your Netlify frontend
// to communicate with this backend server, as they are on different domains.
app.use(cors());

// --- VAPID Key Setup ---
// These are retrieved from Render's environment variables (in production)
// or from your local .env file (for local development).
const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;
// The VAPID subject MUST be a mailto: URL or an https: URL
const vapidSubject = process.env.VAPID_SUBJECT;

// Set the VAPID details for web-push library
webpush.setVapidDetails(vapidSubject, publicVapidKey, privateVapidKey);

// --- Store Subscriptions (Simple In-Memory Array for now - NOT for Production) ---
// IMPORTANT: For a real production application, you MUST save these
// subscriptions to a persistent database (e.g., PostgreSQL, MongoDB, SQLite).
// If the server restarts, all subscriptions in this array will be lost!
let subscriptions = [];

// --- API Endpoint: Receive and Store New Subscriptions ---
// This endpoint is called by your frontend when a user enables notifications.
app.post('/subscribe', (req, res) => {
    const subscription = req.body;
    console.log('Received new subscription:', subscription);

    // In a real application, you'd add this to your database.
    // Basic check to avoid duplicate subscriptions in this simple in-memory example.
    if (!subscriptions.some(sub => JSON.stringify(sub) === JSON.stringify(subscription))) {
        subscriptions.push(subscription);
        console.log('Subscription added. Total subscriptions:', subscriptions.length);
        res.status(201).json({ message: 'Subscription added successfully.' });
    } else {
        console.log('Subscription already exists, not adding duplicate.');
        res.status(200).json({ message: 'Subscription already exists.' });
    }
});

// --- API Endpoint: Send a Test Notification (Manually Triggered) ---
// You can hit this endpoint (e.g., with Postman, Insomnia, or a simple fetch in browser console)
// to send a notification to all currently stored subscriptions.
app.post('/send-test-notification', async (req, res) => {
    if (subscriptions.length === 0) {
        // Return 404 if no subscriptions, as your frontend currently expects this.
        return res.status(404).json({ message: 'No active subscriptions to send to.' });
    }

    const notificationPayload = {
        title: 'Train Alert: Test Notification!',
        body: 'This is a test alert from your backend server for your PWA.',
        // IMPORTANT: Replace with YOUR ACTUAL Netlify site URL for the icon and URL
        icon: 'https://trainalert.netlify.app/icons/icon-192x192.png',
        url: 'https://trainalert.netlify.app'
    };

    console.log(`Attempting to send notification to ${subscriptions.length} subscriber(s).`);

    const sendPromises = subscriptions.map(async (sub, index) => {
        try {
            await webpush.sendNotification(sub, JSON.stringify(notificationPayload));
            console.log(`Notification sent to subscriber ${index + 1}.`);
        } catch (error) {
            console.error(`Error sending notification to subscriber ${index + 1}:`, error);
            // Handle cases where subscription is no longer valid (e.g., user unsubscribed, browser cleared data, or endpoint expired)
            if (error.statusCode === 410 || error.statusCode === 404) {
                console.log(`Subscription ${index + 1} expired or invalid, removing it.`);
                // In a real app, you'd remove this specific subscription from your database.
                // For this in-memory example, we'll filter it out later.
                return { status: 'failed', subscription: sub, error: error.statusCode };
            }
            return { status: 'failed', subscription: sub, error: error.statusCode || error.message };
        }
        return { status: 'success' };
    });

    const results = await Promise.allSettled(sendPromises);

    // After all sends, filter out failed/invalid subscriptions for the in-memory array
    subscriptions = subscriptions.filter((sub, index) => {
        return results[index].status === 'fulfilled' && results[index].value.status !== 'failed';
    });

    console.log(`Finished attempting all test notifications. Remaining active subscriptions: ${subscriptions.length}`);
    res.status(200).json({ message: 'Test notifications sent (or attempted)!', remainingSubscriptions: subscriptions.length });
});

// --- Start the Server ---
// Render provides a specific port. We bind to '0.0.0.0' to ensure
// the server is accessible from outside the container.
app.listen(PORT, '0.0.0.0', () => {
    // This log message should now appear in your Render logs!
    console.log(`Backend server running and accessible on http://0.0.0.0:${PORT}`);
    console.log('Visit your Netlify frontend at https://trainalert.netlify.app, subscribe, then hit your Render /send-test-notification endpoint.');
});
