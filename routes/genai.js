const express = require('express');
const { generateFoodDonationResponse } = require('./geminiapikey');

const genrouter = express.Router();

// POST endpoint to test chatbot
genrouter.post('/', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const response = await generateFoodDonationResponse(query);
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = genrouter;
