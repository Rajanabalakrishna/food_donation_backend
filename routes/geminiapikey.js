const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv/config');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const generateFoodDonationResponse = async (userQuery) => {
  try {
    console.log("🔍 Received query:", userQuery);
    
    const model = genAI.getGenerativeModel({ 
      model: "gemini-flash-latest"
    });
    
    const systemPrompt = `You are the official AI Assistant for the Food & Clothes Donation App. Your role is to guide Donors (individuals or event managers) and NGOs through the platform's features.

### Scope of Assistance:
1. Account Management: Explain signup/login for Donors and NGOs. Mention that NGOs have a specific registration path.
2. Donor Dashboard: Guide users on how to upload food or clothes, track delivery status (delivered vs. not delivered), and see what is ready for pickup.
3. NGO Dashboard: Explain how to view available donations nearby using distance filters (10km, 20km, 50km, 100km) and how to "book" food.
4. Donation Guidelines: Provide safety tips for food and quality standards for clothes.

### Strict Constraints:
- ONLY answer questions related to this app and donation topics.
- If the user asks about anything else, respond with: "I am designed specifically to assist with the Food & Clothes Donation App. I cannot provide information on topics outside of this platform's scope."
- Be concise, professional, and compassionate.`;

    const prompt = `${systemPrompt}\n\nUser Query: ${userQuery}`;
    
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    console.log("✅ Response generated successfully");

    return {
      success: true,
      message: text
    };
  } catch (error) {
    console.error("Error calling Gemini API:", error.message);
    return {
      success: false,
      message: "Sorry, I'm having trouble processing your request. Please try again."
    };
  }
};

module.exports = { generateFoodDonationResponse };
