import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

console.log(process.env.GEMINI_API_KEY);

// Access your API key as an environment variable
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function run() {
  // Use gemini-1.5-flash for fast responses
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

  const prompt = "Write a coding joke for a developer.";

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();
  console.log(text);
}

run().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
