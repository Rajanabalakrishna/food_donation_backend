require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({
  auth: process.env.NOTION_API_KEY
});

const databaseId = process.env.NOTION_DATABASE_ID;

async function addFoodToNotion(foodData) {
  try {
    // Validate foodData exists
    if (!foodData) {
      throw new Error('foodData is null or undefined');
    }

    console.log('📦 Received foodData:', JSON.stringify(foodData, null, 2));

    // Safely access nested properties with fallbacks
    const eventName = foodData.event_manager_name || 'Unknown Donor';
    const address = foodData.address || 'No address provided';
    const quantity = foodData.total_quantity_kg || 0;
    const phone = foodData.phone_number || '';
    const latitude = foodData.location?.latitude || 0;
    const longitude = foodData.location?.longitude || 0;
    const isOrdered = foodData.is_ordered || false;

    console.log('📋 Preparing Notion entry:', {
      eventName,
      address,
      quantity,
      phone,
      latitude,
      longitude,
      isOrdered
    });

    const response = await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        'Food Name': {
          rich_text: [{ text: { content: eventName } }]
        },
        'Location': {
          rich_text: [{ text: { content: address } }]
        }
      }
    });
    
    console.log('✅ Successfully added to Notion:', response.id);
    return response;
  } catch (error) {
    console.error('❌ Notion upload error:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  }
}

module.exports = { addFoodToNotion };
