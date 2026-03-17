const express = require('express');
const notificationrouter = express.Router();
const admin = require('firebase-admin');

// Send notification to single device
notificationrouter.post('/api/fcm/notify-user', async (req, res) => {
  try {
    const { token, title, body, data } = req.body;

    if (!token) {
      return res.status(400).json({ 
        success: false, 
        error: 'Device token is required' 
      });
    }

    const message = {
      notification: {
        title: title || 'New Notification',
        body: body || 'You have a new notification'
      },
      token: token
    };

    if (data) {
      message.data = {};
      for (let key in data) {
        message.data[key] = String(data[key]);
      }
    }

    const response = await admin.messaging().send(message);
    
    res.status(200).json({
      success: true,
      message: 'Notification sent successfully',
      messageId: response
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Send notification to multiple devices
notificationrouter.post('/api/fcm/broadcast', async (req, res) => {
  try {
    const { tokens, title, body, data } = req.body;

    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Tokens array is required and must not be empty' 
      });
    }

    const message = {
      notification: {
        title: title || 'New Notification',
        body: body || 'You have a new notification'
      },
      tokens: tokens
    };

    if (data) {
      message.data = {};
      for (let key in data) {
        message.data[key] = String(data[key]);
      }
    }

    const response = await admin.messaging().sendEachForMulticast(message);
    
    res.status(200).json({
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses
    });
  } catch (error) {
    console.error('Error sending broadcast:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Send notification to topic subscribers
notificationrouter.post('/api/fcm/notify-topic', async (req, res) => {
  try {
    const { topic, title, body, data } = req.body;

    if (!topic) {
      return res.status(400).json({ 
        success: false, 
        error: 'Topic is required' 
      });
    }

    const message = {
      notification: {
        title: title || 'Topic Notification',
        body: body || 'New update available'
      },
      topic: topic
    };

    if (data) {
      message.data = {};
      for (let key in data) {
        message.data[key] = String(data[key]);
      }
    }

    const response = await admin.messaging().send(message);
    
    res.status(200).json({
      success: true,
      message: 'Notification sent to topic successfully',
      messageId: response
    });
  } catch (error) {
    console.error('Error sending to topic:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Subscribe users to a topic
notificationrouter.post('/api/fcm/topic/subscribe', async (req, res) => {
  try {
    const { tokens, topic } = req.body;

    if (!tokens || !topic) {
      return res.status(400).json({ 
        success: false, 
        error: 'Tokens and topic are required' 
      });
    }

    const tokenArray = Array.isArray(tokens) ? tokens : [tokens];
    const response = await admin.messaging().subscribeToTopic(tokenArray, topic);
    
    res.status(200).json({
      success: true,
      message: `Subscribed to topic: ${topic}`,
      successCount: response.successCount,
      failureCount: response.failureCount
    });
  } catch (error) {
    console.error('Error subscribing to topic:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Unsubscribe users from a topic
notificationrouter.post('/api/fcm/topic/unsubscribe', async (req, res) => {
  try {
    const { tokens, topic } = req.body;

    if (!tokens || !topic) {
      return res.status(400).json({ 
        success: false, 
        error: 'Tokens and topic are required' 
      });
    }

    const tokenArray = Array.isArray(tokens) ? tokens : [tokens];
    const response = await admin.messaging().unsubscribeFromTopic(tokenArray, topic);
    
    res.status(200).json({
      success: true,
      message: `Unsubscribed from topic: ${topic}`,
      successCount: response.successCount,
      failureCount: response.failureCount
    });
  } catch (error) {
    console.error('Error unsubscribing from topic:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = notificationrouter;
