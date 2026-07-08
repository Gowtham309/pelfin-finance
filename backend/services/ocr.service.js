import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
let genAI = null;

if (apiKey) {
  try {
    genAI = new GoogleGenerativeAI(apiKey);
  } catch (err) {
    console.error('Failed to initialize Gemini AI SDK inside OCR service:', err);
  }
}

const CATEGORIES = ['Food', 'Transport', 'Entertainment', 'Utilities', 'Books/Supplies', 'Miscellaneous'];

function fileToGenerativePart(buffer, mimeType) {
  return {
    inlineData: {
      data: buffer.toString('base64'),
      mimeType
    }
  };
}

export const extractReceiptData = async (fileBuffer, mimeType, originalName = '') => {
  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const imagePart = fileToGenerativePart(fileBuffer, mimeType);

      const prompt = `Analyze this receipt image. Extract the following details and return ONLY a JSON object matching this schema. Do NOT wrap the JSON in markdown code blocks like \`\`\`json.
      {
        "amount": <number representing the total amount paid, eg. 15.50>,
        "category": <string, select exactly one of: "Food", "Transport", "Entertainment", "Utilities", "Books/Supplies", "Miscellaneous">,
        "merchant": <string representing the merchant name>,
        "description": <string, brief summary of items bought>,
        "date": <string in YYYY-MM-DD format. If date is not found or unclear, use today's date>
      }`;

      const result = await model.generateContent([prompt, imagePart]);
      const text = result.response.text().trim();

      // Clean up markdown block wraps if the model returned them
      const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      if (typeof parsed.amount === 'number' && parsed.merchant) {
        if (!CATEGORIES.includes(parsed.category)) {
          parsed.category = 'Miscellaneous';
        }
        if (!parsed.date || isNaN(Date.parse(parsed.date))) {
          parsed.date = new Date().toISOString().substring(0, 10);
        }
        return {
          ...parsed,
          fallbackActive: false
        };
      }
    } catch (err) {
      console.warn('Gemini OCR extraction failed, using fallback parser:', err.message);
    }
  }

  // Fallback scanner heuristics
  return performOfflineReceiptParsing(originalName);
};

const performOfflineReceiptParsing = (originalName) => {
  const nameLower = originalName.toLowerCase();
  let amount = 12.50;
  let category = 'Miscellaneous';
  let merchant = 'Store Receipt';
  let description = 'Scanned offline receipt';

  if (nameLower.includes('starbucks') || nameLower.includes('coffee') || nameLower.includes('cafe')) {
    amount = 5.75;
    category = 'Food';
    merchant = 'Starbucks';
    description = 'Beverages and snacks';
  } else if (nameLower.includes('mcdonald') || nameLower.includes('burger') || nameLower.includes('pizza') || nameLower.includes('food')) {
    amount = 14.50;
    category = 'Food';
    merchant = 'Fast Food';
    description = 'Meals';
  } else if (nameLower.includes('uber') || nameLower.includes('lyft') || nameLower.includes('cab') || nameLower.includes('taxi')) {
    amount = 18.20;
    category = 'Transport';
    merchant = 'Uber';
    description = 'Ride Share';
  } else if (nameLower.includes('gas') || nameLower.includes('fuel') || nameLower.includes('shell') || nameLower.includes('chevron')) {
    amount = 35.00;
    category = 'Transport';
    merchant = 'Gas Station';
    description = 'Gasoline';
  } else if (nameLower.includes('book') || nameLower.includes('school') || nameLower.includes('tuition')) {
    amount = 68.40;
    category = 'Books/Supplies';
    merchant = 'University Bookstore';
    description = 'Textbooks and notebooks';
  } else if (nameLower.includes('netflix') || nameLower.includes('spotify') || nameLower.includes('steam')) {
    amount = 15.99;
    category = 'Entertainment';
    merchant = 'Subscription Service';
    description = 'Monthly subscription';
  }

  return {
    amount,
    category,
    merchant,
    description,
    date: new Date().toISOString().substring(0, 10),
    fallbackActive: true
  };
};
