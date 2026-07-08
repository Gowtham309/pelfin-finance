import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { dbAll, dbGet } from '../config/db.js';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
let genAI = null;

if (apiKey) {
  try {
    genAI = new GoogleGenerativeAI(apiKey);
  } catch (err) {
    console.error('Failed to initialize Gemini AI SDK inside AI service:', err);
  }
}

const CATEGORIES = ['Food', 'Transport', 'Entertainment', 'Utilities', 'Books/Supplies', 'Miscellaneous'];

// 1. Natural Language Parser
export const parseNLInput = async (text) => {
  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `Translate the following transaction detail into a structured JSON object.
      Input: "${text}"
      
      Output JSON format:
      {
        "amount": <number, eg. 15.50>,
        "category": <string, choose exactly one from: "Food", "Transport", "Entertainment", "Utilities", "Books/Supplies", "Miscellaneous">,
        "merchant": <string representing the vendor or store>,
        "description": <string, short description of the item or note>,
        "date": <string, YYYY-MM-DD format. If date is not explicit (like "today", "yesterday"), calculate relative to today: ${new Date().toISOString().substring(0, 10)}>
      }
      Respond ONLY with the raw JSON object. Do not include markdown code block formatting (like \`\`\`json) or any conversational text.`;

      const result = await model.generateContent(prompt);
      const textResult = result.response.text().trim();
      const cleanJson = textResult.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      if (typeof parsed.amount === 'number' && parsed.merchant) {
        if (!CATEGORIES.includes(parsed.category)) {
          parsed.category = 'Miscellaneous';
        }
        if (!parsed.date || isNaN(Date.parse(parsed.date))) {
          parsed.date = new Date().toISOString().substring(0, 10);
        }
        return { ...parsed, fallbackActive: false };
      }
    } catch (err) {
      console.warn('Gemini NL parsing failed, using offline fallback engine:', err.message);
    }
  }

  return parseNLInputFallback(text);
};

const parseNLInputFallback = (text) => {
  const textLower = text.toLowerCase();
  let amount = 0.0;

  // Amount parsing (handles $, ₹, INR, Rs, Rs., and rs)
  const dollarRegex = /(?:\$|₹|inr|rs\.?)\s*(\d+(?:\.\d{1,2})?)/i;
  const genericNumberRegex = /\b(\d+(?:\.\d{1,2})?)\b/g;

  const dollarMatch = text.match(dollarRegex);
  if (dollarMatch) {
    amount = parseFloat(dollarMatch[1]);
  } else {
    const numbers = [];
    let match;
    while ((match = genericNumberRegex.exec(text)) !== null) {
      numbers.push(parseFloat(match[1]));
    }
    const validAmounts = numbers.filter(n => n < 2000 || n.toString().includes('.'));
    if (validAmounts.length > 0) {
      const decimalVal = validAmounts.find(n => n % 1 !== 0);
      amount = decimalVal !== undefined ? decimalVal : validAmounts[0];
    }
  }

  // Category & Merchant mapping
  let category = 'Miscellaneous';
  let merchant = 'Merchant';
  const description = text;

  const mappings = [
    {
      category: 'Food',
      keywords: ['starbucks', 'coffee', 'mcdonald', 'burger', 'pizza', 'food', 'lunch', 'dinner', 'cafe', 'grocery', 'groceries', 'subway', 'dunkin', 'eat', 'restaurant', 'taco', 'kfc', 'swiggy', 'zomato', 'haldirams'],
      merchants: { starbucks: 'Starbucks', mcdonald: 'McDonalds', subway: 'Subway', dunkin: 'Dunkin Donuts', pizza: 'Pizza Shop', swiggy: 'Swiggy', zomato: 'Zomato', haldirams: 'Haldirams' }
    },
    {
      category: 'Transport',
      keywords: ['uber', 'lyft', 'bus', 'train', 'gas', 'metro', 'transit', 'cab', 'taxi', 'fare', 'gasoline', 'shell', 'chevron', 'bp', 'ola', 'auto'],
      merchants: { uber: 'Uber', ola: 'Ola Cabs', lyft: 'Lyft', shell: 'Shell' }
    },
    {
      category: 'Entertainment',
      keywords: ['netflix', 'spotify', 'movie', 'game', 'concert', 'beer', 'club', 'bar', 'pub', 'show', 'cinema', 'hulu', 'disney', 'nintendo', 'playstation', 'xbox', 'steam', 'bowling', 'pvr', 'bookmyshow'],
      merchants: { netflix: 'Netflix', spotify: 'Spotify', steam: 'Steam', pvr: 'PVR Cinemas', bookmyshow: 'BookMyShow' }
    },
    {
      category: 'Utilities',
      keywords: ['rent', 'electricity', 'wifi', 'water', 'phone', 'internet', 'utility', 'utilities', 'bill', 't-mobile', 'verizon', 'comcast', 'power', 'jio', 'airtel'],
      merchants: { jio: 'Reliance Jio', airtel: 'Airtel' }
    },
    {
      category: 'Books/Supplies',
      keywords: ['book', 'books', 'course', 'tuition', 'pen', 'notebook', 'exam', 'stationery', 'pencil', 'calculator', 'textbook', 'coursera', 'udemy', 'ipad', 'laptop'],
      merchants: { amazon: 'Amazon', bookstore: 'Campus Bookstore' }
    }
  ];

  let matched = false;
  for (const group of mappings) {
    for (const kw of group.keywords) {
      const escapedKw = kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedKw}\\b`, 'i');
      if (regex.test(textLower)) {
        category = group.category;
        merchant = group.merchants[kw] || (kw.charAt(0).toUpperCase() + kw.slice(1));
        matched = true;
        break;
      }
    }
    if (matched) break;
  }

  // Preposition-based merchant detection for SMS formatting
  const prepositionMatch = text.match(/(?:at|to|from)\s+([a-zA-Z0-9\s.-]+)/i);
  if (prepositionMatch && merchant === 'Merchant') {
    const rawMerch = prepositionMatch[1].trim();
    const words = rawMerch.split(/\s+/);
    // Trailing keywords to trim off
    const stopWords = ['on', 'using', 'via', 'for', 'through', 'ref', 'vpa', 'date', 'limit', 'card', 'ac', 'using', 'upi'];
    const filtered = [];
    for (const w of words) {
      if (stopWords.includes(w.toLowerCase()) || /^\d/.test(w)) break;
      filtered.push(w);
    }
    if (filtered.length > 0) {
      merchant = filtered.join(' ').replace(/[^a-zA-Z0-9\s]/g, '').trim();
      // Capitalize first letters
      merchant = merchant.replace(/\b\w/g, c => c.toUpperCase());
    }
  }

  // Date Parsing supporting DD-MM-YYYY, DD/MM/YYYY, DD-MMM-YY
  let date = new Date().toISOString().substring(0, 10);
  if (textLower.includes('yesterday')) {
    const yesterday = new Date(Date.now() - 86400000);
    date = yesterday.toISOString().substring(0, 10);
  } else {
    // 1. Matches DD-MM-YYYY or DD/MM/YYYY or DD-MM-YY
    const dateRegex = /\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/;
    const indDateMatch = text.match(dateRegex);
    if (indDateMatch) {
      let day = parseInt(indDateMatch[1]);
      let monthVal = parseInt(indDateMatch[2]);
      let year = parseInt(indDateMatch[3]);
      if (year < 100) year += 2000;
      
      const dObj = new Date(year, monthVal - 1, day);
      if (!isNaN(dObj.getTime())) {
        date = dObj.toISOString().substring(0, 10);
      }
    } else {
      // 2. Matches word-based dates like 08-Jul-26 or 08/Jul/2026
      const wordDateRegex = /\b(\d{1,2})[-/](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-/](\d{2,4})\b/i;
      const wordDateMatch = text.match(wordDateRegex);
      if (wordDateMatch) {
        const monthsMap = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
        let day = parseInt(wordDateMatch[1]);
        let mStr = wordDateMatch[2].toLowerCase();
        let year = parseInt(wordDateMatch[3]);
        if (year < 100) year += 2000;
        
        const dObj = new Date(year, monthsMap[mStr], day);
        if (!isNaN(dObj.getTime())) {
          date = dObj.toISOString().substring(0, 10);
        }
      }
    }
  }

  return {
    amount,
    category,
    merchant,
    description: description.substring(0, 200),
    date,
    fallbackActive: true
  };
};

// 2. AI Financial Coach
export const generateCoachResponse = async (userId, userMessage, history = []) => {
  // Fetch user contextual info to feed into Gemini prompt
  const recentExpenses = await dbAll(
    'SELECT amount, category, merchant, date FROM expenses WHERE user_id = ? ORDER BY date DESC LIMIT 5',
    [userId]
  );
  
  const currentMonth = new Date().toISOString().substring(0, 7);
  const budgets = await dbAll(
    'SELECT category, limit_amount FROM budgets WHERE user_id = ? AND month = ?',
    [userId, currentMonth]
  );

  const goals = await dbAll(
    'SELECT name, target_amount, current_amount FROM goals WHERE user_id = ?',
    [userId]
  );

  const contextPrompt = `You are "Pelfin Coach", an expert personal finance coach specializing in helping college students manage their money.
  Be encouraging, pragmatic, and student-focused (suggesting options like cooking at home, public transport, textbooks options, student discounts).
  
  Here is the student's current financial context:
  - Recent transactions: ${JSON.stringify(recentExpenses)}
  - Active Budgets for this month (${currentMonth}): ${JSON.stringify(budgets)}
  - Savings Goals: ${JSON.stringify(goals)}
  
  Please answer the student's message with these details in mind. Keep your responses structured (using bullet points and bolding where appropriate) and limit response length to 3 paragraphs max.`;

  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      // Structure Gemini chat format
      const chatHistory = history.map(h => ({
        role: h.sender === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }]
      }));

      // Add context as standard instruction prefix
      const chat = model.startChat({
        history: [
          { role: 'user', parts: [{ text: contextPrompt }] },
          { role: 'model', parts: [{ text: 'Understood. I am Pelfin Coach, ready to guide this student financially.' }] },
          ...chatHistory
        ]
      });

      const response = await chat.sendMessage(userMessage);
      return {
        text: response.response.text(),
        fallbackActive: false
      };
    } catch (err) {
      console.warn('Gemini chat coach failed, using offline fallback matching:', err.message);
    }
  }

  return performOfflineCoachResponse(userMessage, budgets, goals);
};

const performOfflineCoachResponse = (message, budgets, goals) => {
  const msgLower = message.toLowerCase();

  let text = '';
  
  if (msgLower.includes('budget') || msgLower.includes('limit')) {
    text = `**Pelfin Offline Coach:** Setting boundaries is the first step to financial freedom! 🚀\n\n` +
           `Currently, you have **${budgets.length}** budgets set up for this month. Here's a tip: try the **50/30/20 Rule**:\n` +
           `- **50% Needs:** Rent, groceries, transport, utilities.\n` +
           `- **30% Wants:** Entertainment, eating out, coffee runs.\n` +
           `- **20% Savings:** Build your emergency fund or save for your long-term goals!\n\n` +
           `Review your Category Allocator tab to check if you're exceeding your set limits!`;
  } else if (msgLower.includes('save') || msgLower.includes('goal') || msgLower.includes('invest')) {
    const goalsCount = goals.length;
    text = `**Pelfin Offline Coach:** Saving money as a student is challenging, but super rewarding! 💰\n\n` +
           (goalsCount > 0 
             ? `I see you have **${goalsCount}** active savings goal(s). To accelerate your progress:\n`
             : `I see you don't have any savings goals active. Setting a goal like an "Emergency Fund" or "Semester Break Trip" helps keep you motivated!\n\n`) +
           `- **Automate Deposits:** Try depositing just ₹500 or ₹1000 a week automatically.\n` +
           `- **Cut Micro-Expenses:** Skip one barista coffee or food delivery run a week and transfer that amount to your goal.\n` +
           `- **Use High-Yield Savings Accounts (HYSA):** Ensure your savings earn interest!`;
  } else if (msgLower.includes('debt') || msgLower.includes('loan') || msgLower.includes('credit')) {
    text = `**Pelfin Offline Coach:** Debt can feel overwhelming, but managing it wisely is key! 🎓💳\n\n` +
           `- **Credit Card Rule:** Always pay your statement balance in full every single month. Treat a credit card like a debit card—never spend money you don't currently have.\n` +
           `- **Student Loans:** Learn the difference between subsidized and unsubsidized interest rates. If you have unsubsidized loans, consider making micro-payments on the interest while still in school if you can.\n` +
           `- **Avoid Buy Now Pay Later (BNPL):** Services like Klarna or Afterpay can trick you into overspending on wants. Avoid them!`;
  } else {
    text = `**Pelfin Offline Coach:** Hello there! I'm your offline companion. How can I help you manage your funds today?\n\n` +
           `Try asking me things like:\n` +
           `- *"How do I start a budget?"*\n` +
           `- *"Tips on saving money as a student"*\n` +
           `- *"How should I manage credit card debt?"*\n\n` +
           `*Note: The Gemini API Key is missing or rate-limited. I am providing heuristic guidance in offline fallback mode.*`;
  }

  return {
    text,
    fallbackActive: true
  };
};

// 3. AI Spending Forecaster
export const getSpendingForecast = async (userId) => {
  // Fetch monthly aggregated expenses for past months
  const monthlyExpenses = await dbAll(
    `SELECT strftime("%Y-%m", date) as month, category, SUM(amount) as total 
     FROM expenses 
     WHERE user_id = ? 
     GROUP BY month, category 
     ORDER BY month DESC 
     LIMIT 30`,
    [userId]
  );

  const currentMonth = new Date().toISOString().substring(0, 7);

  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `You are a financial planning engine. Analyze the historical category-wise monthly expenses below for a college student:
      ${JSON.stringify(monthlyExpenses)}
      
      Generate a financial forecast report for next month. Recommend:
      1. An overall predicted spending amount.
      2. Predictions for specific categories.
      3. A student-focused tip on where they can trim waste (e.g. food, subscriptions) based on their highest categories.
      
      Keep the report structured in clean JSON format:
      {
        "predictedTotal": <number>,
        "categoryPredictions": [
          { "category": "Food", "amount": <number> }, ...
        ],
        "insights": "<string containing summary text>"
      }
      Respond ONLY with the raw JSON. Do not include markdown code block formatting (like \`\`\`json).`;

      const result = await model.generateContent(prompt);
      const textResult = result.response.text().trim();
      const cleanJson = textResult.replace(/```json/gi, '').replace(/```/g, '').trim();
      
      const parsed = JSON.parse(cleanJson);
      return {
        ...parsed,
        fallbackActive: false
      };
    } catch (err) {
      console.warn('Gemini Forecasting failed, using local fallback math:', err.message);
    }
  }

  // Fallback math-based forecaster
  return performOfflineForecast(monthlyExpenses, currentMonth);
};

const performOfflineForecast = (monthlyExpenses, currentMonth) => {
  const categoryTotals = {};
  const categoryMonthsCount = {};

  monthlyExpenses.forEach(e => {
    // Exclude current month to avoid incomplete data biasing the average
    if (e.month === currentMonth) return;

    if (!categoryTotals[e.category]) {
      categoryTotals[e.category] = 0;
      categoryMonthsCount[e.category] = 0;
    }
    categoryTotals[e.category] += e.total;
    categoryMonthsCount[e.category] += 1;
  });

  const categoryPredictions = [];
  let predictedTotal = 0;

  CATEGORIES.forEach(cat => {
    const total = categoryTotals[cat] || 0;
    const months = categoryMonthsCount[cat] || 0;
    const avg = months > 0 ? total / months : 25.0; // Default fallback estimate for empty history
    
    // Add a slight inflation/variation buffer (e.g. 5% increase prediction for students)
    const predictedAmt = parseFloat((avg * 1.05).toFixed(2));
    categoryPredictions.push({
      category: cat,
      amount: predictedAmt
    });
    predictedTotal += predictedAmt;
  });

  predictedTotal = parseFloat(predictedTotal.toFixed(2));

  // Determine highest spending category to build dynamic insight
  let maxCat = 'Food';
  let maxAmt = 0;
  categoryPredictions.forEach(cp => {
    if (cp.amount > maxAmt) {
      maxAmt = cp.amount;
      maxCat = cp.category;
    }
  });

  let insights = `Based on your past spending, we predict next month's total expenses will be around ₹${predictedTotal.toFixed(2)}. `;
  if (maxAmt > 50) {
    insights += `Your highest predicted spending category is **${maxCat}** (₹${maxAmt.toFixed(2)}). Consider meal prepping or seeking student discounts to trim this category. `;
  } else {
    insights += `Log more transactions to refine your personalized financial forecasts and coaching recommendations! `;
  }
  insights += `*Note: The forecasting engine is operating in offline fallback mode using 3-month running averages.*`;

  return {
    predictedTotal,
    categoryPredictions,
    insights,
    fallbackActive: true
  };
};
