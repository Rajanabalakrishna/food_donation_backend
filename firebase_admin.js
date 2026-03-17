const admin = require('firebase-admin');

// Don't initialize here - it's already done in index.js

const messaging = admin.messaging();

// Send to a single device
async function sendNotification(deviceToken) {
  const message = {
    notification: {
      title: 'Hello!',
      body: 'This is a test notification'
    },
    token: deviceToken
  };

  try {
    const response = await messaging.send(message);
    console.log('Successfully sent message:', response);
  } catch (error) {
    console.log('Error sending message:', error);
  }
}

// Send to multiple devices
async function sendToMultiple(tokens) {
  const message = {
    notification: {
      title: 'Notification Title',
      body: 'Notification Body'
    },
    tokens: tokens // array of device tokens
  };

  try {
    const response = await messaging.sendMulticast(message);
    console.log(`${response.successCount} messages sent successfully`);
  } catch (error) {
    console.log('Error:', error);
  }
}

module.exports = {
  sendNotification,
  sendToMultiple,
  messaging
};
