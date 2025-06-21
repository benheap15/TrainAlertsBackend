// Load environment variables from .env file
require('dotenv').config();

// Import necessary modules
const express = require('express');
const webpush = require('web-push');
const cors = require('cors'); // For allowing your Netlify site to talk to this server

const app = express();
const PORT = process.env.PORT || 3000; // Use port 3000, or whatever the environment specifies

// --- Middleware ---
app.use(express.json()); // Allows parsing JSON data from incoming requests
app.use(cors()); // Enable CORS for all routes (important for cross-domain communication)

// --- VAPID Key Setup ---
const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT;

webpush.setVapidDetails(vapidSubject, publicVapidKey, privateVapidKey);

// --- Store Subscriptions (Simple In-Memory Array for now - NOT for Production) ---
// For a real application, you would save these to a database (e.g., PostgreSQL, MongoDB, SQLite)
let subscriptions = [];

// --- API Endpoint: Receive and Store New Subscriptions ---
app.post('/subscribe', (req, res) => {
    const subscription = req.body;
    console.log('Received new subscription:', subscription);

    // Basic check to avoid duplicate subscriptions in this simple example
    if (!subscriptions.some(sub => JSON.stringify(sub) === JSON.stringify(subscription))) {
        subscriptions.push(subscription);
        console.log('Subscription added. Total subscriptions:', subscriptions.length);
        res.status(201).json({ message: 'Subscription added successfully.' });
    } else {
        console.log('Subscription already exists.');
        res.status(200).json({ message: 'Subscription already exists.' });
    }
});

// --- API Endpoint: Send a Test Notification (Manually Triggered) ---
// You can hit this endpoint (e.g., with Postman, Insomnia, or a simple fetch from your browser's console)
// to send a notification to all currently stored subscriptions.
app.post('/send-test-notification', async (req, res) => {
    if (subscriptions.length === 0) {
        return res.status(404).json({ message: 'No active subscriptions to send to.' });
    }

    const notificationPayload = {
        title: 'Train Alert: Test Notification!',
        body: 'This is a test alert from your backend server.',
       icon: 'https://trainalert.netlify.app/icons/icon-192x192.png', // **IMPORTANT: Replace with your actual Netlify site URL**
        url: 'https://trainalert.netlify.app' // **Optional: URL to open when notification is clicked**
    };

    console.log(`Attempting to send notification to ${subscriptions.length} subscribers.`);

    const sendPromises = subscriptions.map(sub =>
        webpush.sendNotification(sub, JSON.stringify(notificationPayload))
            .then(() => console.log('Notification sent to a subscriber.'))
            .catch(error => {
                console.error('Error sending notification:', error);
                // Handle cases where subscription is no longer valid (e.g., user unsubscribed or browser cleared data)
                if (error.statusCode === 410 || error.statusCode === 404) {
                    console.log('Subscription expired or invalid, removing it.');
                    // In a real app, you'd remove this from your database
                    subscriptions = subscriptions.filter(s => JSON.stringify(s) !== JSON.stringify(sub));
                }
            })
    );

    await Promise.allSettled(sendPromises); // Wait for all send operations to finish
    console.log('All test notifications attempted.');
    res.status(200).json({ message: 'Test notifications sent (or attempted)!' });
});


// --- Start the Server ---
app.listen(PORT, '0.0.0.0', () => { // <--- ADDED '0.0.0.0'
    console.log(`Backend server running on http://localhost:${PORT}`);
    console.log('Visit your Netlify frontend, subscribe, then hit /send-test-notification.');
});
