const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv/config');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const generateFoodDonationResponse = async (userQuery) => {
  try {
    console.log("🔍 Received query:", userQuery);
    
    const model = genAI.getGenerativeModel({ 
      model: "gemini-flash-latest"
    });
    
    const systemPrompt = `You are a helpful chatbot assistant for a food donation app. 
    Your role is to answer queries about:
    - How to donate food
    - Food donation guidelines and safety
    - Types of food that can be donated
    - Finding food donation centers
    - Benefits of food donation
    - Tax deductions for food donations
    - Food storage and handling tips
    
    Provide concise, helpful, and compassionate responses. If asked about something outside food donation, politely redirect to food donation topics.`;

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
