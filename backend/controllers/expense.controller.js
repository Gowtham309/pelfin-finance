import crypto from 'crypto';
import { dbAll, dbGet, dbRun } from '../config/db.js';
import { checkBudgets } from '../services/notification.service.js';
import { extractReceiptData } from '../services/ocr.service.js';
import { parseNLInput } from '../services/ai.service.js';

// Parse CSV text helper
export const parseCSVData = (csvText) => {
  const lines = csvText.split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/["']/g, ''));

  const dateIdx = headers.findIndex(h => h.includes('date'));
  const amountIdx = headers.findIndex(h => h.includes('amount') || h.includes('value'));
  const merchantIdx = headers.findIndex(h => h.includes('merchant') || h.includes('payee') || h.includes('description') || h.includes('name'));
  const categoryIdx = headers.findIndex(h => h.includes('category') || h.includes('type'));
  const descIdx = headers.findIndex(h => h.includes('description') || h.includes('memo') || h.includes('note'));

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = [];
    let current = '';
    let inQuotes = false;
    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cols.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    cols.push(current.trim().replace(/^"|"$/g, ''));

    const amountStr = cols[amountIdx !== -1 ? amountIdx : 1];
    if (!amountStr) continue;

    const amount = parseFloat(amountStr.replace(/[^0-9.-]/g, ''));
    if (isNaN(amount)) continue;

    const rawDate = dateIdx !== -1 && cols[dateIdx] ? cols[dateIdx] : new Date().toISOString().substring(0, 10);
    let date = new Date(rawDate);
    if (isNaN(date.getTime())) {
      date = new Date();
    }
    const formattedDate = date.toISOString().substring(0, 10);

    const merchant = merchantIdx !== -1 && cols[merchantIdx] ? cols[merchantIdx] : 'Merchant';
    const category = categoryIdx !== -1 && cols[categoryIdx] ? cols[categoryIdx] : 'Miscellaneous';
    const description = descIdx !== -1 && cols[descIdx] ? cols[descIdx] : '';

    records.push({
      amount: Math.abs(amount), // store positive values for spending
      category: category.charAt(0).toUpperCase() + category.slice(1),
      merchant,
      description,
      date: formattedDate
    });
  }
  return records;
};

export const getExpenses = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { category, start_date, end_date } = req.query;

    let query = 'SELECT * FROM expenses WHERE user_id = ?';
    const params = [userId];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    if (start_date) {
      query += ' AND date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      query += ' AND date <= ?';
      params.push(end_date);
    }

    query += ' ORDER BY date DESC, created_at DESC';

    const expenses = await dbAll(query, params);
    res.status(200).json({ success: true, expenses });
  } catch (err) {
    next(err);
  }
};

export const createExpense = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { amount, category, merchant, description, date, is_recurring } = req.body;

    if (amount === undefined || !category || !merchant || !date) {
      return res.status(400).json({ success: false, message: 'Missing required expense fields.' });
    }

    const valAmount = parseFloat(amount);
    if (isNaN(valAmount) || valAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Expense amount must be a positive number.' });
    }

    const expenseId = crypto.randomUUID();
    const isRecur = is_recurring ? 1 : 0;

    await dbRun(
      `INSERT INTO expenses (id, user_id, amount, category, merchant, description, date, is_recurring)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [expenseId, userId, valAmount, category, merchant, description || '', date, isRecur]
    );

    const expense = {
      id: expenseId,
      user_id: userId,
      amount: valAmount,
      category,
      merchant,
      description,
      date,
      is_recurring: isRecur
    };

    // Trigger budget warning checks
    await checkBudgets(userId, category, date);

    res.status(201).json({ success: true, expense });
  } catch (err) {
    next(err);
  }
};

export const updateExpense = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { amount, category, merchant, description, date, is_recurring } = req.body;

    const existingExpense = await dbGet('SELECT * FROM expenses WHERE id = ? AND user_id = ?', [id, userId]);
    if (!existingExpense) {
      return res.status(404).json({ success: false, message: 'Expense not found.' });
    }

    const newAmount = amount !== undefined ? parseFloat(amount) : existingExpense.amount;
    if (isNaN(newAmount) || newAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Expense amount must be a positive number.' });
    }

    const newCategory = category || existingExpense.category;
    const newMerchant = merchant || existingExpense.merchant;
    const newDesc = description !== undefined ? description : existingExpense.description;
    const newDate = date || existingExpense.date;
    const newRecur = is_recurring !== undefined ? (is_recurring ? 1 : 0) : existingExpense.is_recurring;

    await dbRun(
      `UPDATE expenses 
       SET amount = ?, category = ?, merchant = ?, description = ?, date = ?, is_recurring = ?
       WHERE id = ? AND user_id = ?`,
      [newAmount, newCategory, newMerchant, newDesc, newDate, newRecur, id, userId]
    );

    const updatedExpense = {
      id,
      user_id: userId,
      amount: newAmount,
      category: newCategory,
      merchant: newMerchant,
      description: newDesc,
      date: newDate,
      is_recurring: newRecur
    };

    // Trigger budget warning checks for old and new month/category settings
    await checkBudgets(userId, existingExpense.category, existingExpense.date);
    if (existingExpense.category !== newCategory || existingExpense.date.substring(0, 7) !== newDate.substring(0, 7)) {
      await checkBudgets(userId, newCategory, newDate);
    }

    res.status(200).json({ success: true, expense: updatedExpense });
  } catch (err) {
    next(err);
  }
};

export const deleteExpense = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const existingExpense = await dbGet('SELECT * FROM expenses WHERE id = ? AND user_id = ?', [id, userId]);
    if (!existingExpense) {
      return res.status(404).json({ success: false, message: 'Expense not found.' });
    }

    await dbRun('DELETE FROM expenses WHERE id = ? AND user_id = ?', [id, userId]);

    // Check budget thresholds post deletion
    await checkBudgets(userId, existingExpense.category, existingExpense.date);

    res.status(200).json({ success: true, message: 'Expense deleted successfully.' });
  } catch (err) {
    next(err);
  }
};

export const importCSV = async (req, res, next) => {
  try {
    const userId = req.user.id;
    let csvText = '';

    if (req.file) {
      csvText = req.file.buffer.toString('utf8');
    } else if (req.body.csvText) {
      csvText = req.body.csvText;
    } else {
      return res.status(400).json({ success: false, message: 'No CSV file or data provided.' });
    }

    const records = parseCSVData(csvText);
    if (records.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid transaction records parsed from CSV.' });
    }

    const insertedRecords = [];
    for (const record of records) {
      const expenseId = crypto.randomUUID();
      await dbRun(
        `INSERT INTO expenses (id, user_id, amount, category, merchant, description, date, is_recurring)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [expenseId, userId, record.amount, record.category, record.merchant, record.description, record.date, 0]
      );
      insertedRecords.push({
        id: expenseId,
        ...record
      });

      // Trigger budget warning checks for each record
      await checkBudgets(userId, record.category, record.date);
    }

    res.status(201).json({
      success: true,
      count: insertedRecords.length,
      expenses: insertedRecords
    });
  } catch (err) {
    next(err);
  }
};

export const ocrReceipt = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No receipt image uploaded.' });
    }

    const parsedData = await extractReceiptData(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    res.status(200).json({
      success: true,
      data: parsedData
    });
  } catch (err) {
    next(err);
  }
};

export const handleSMSWebhook = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { secret } = req.query;
    const expectedSecret = process.env.JWT_SECRET || 'pelfin_super_secure_jwt_secret_token_change_in_prod';

    if (!secret || secret !== expectedSecret) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Invalid secret.' });
    }

    const { text, body, message, SMS } = req.body;
    const smsText = text || body || message || SMS;

    if (!smsText) {
      return res.status(400).json({ success: false, message: 'Bad Request: SMS content is required.' });
    }

    const user = await dbGet('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const parsed = await parseNLInput(smsText);

    if (!parsed.amount || !parsed.merchant) {
      return res.status(422).json({ success: false, message: 'Unprocessable Entity: Failed to parse transaction fields.' });
    }

    const expenseId = crypto.randomUUID();

    await dbRun(
      `INSERT INTO expenses (id, user_id, amount, category, merchant, description, date, is_recurring)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [expenseId, userId, parsed.amount, parsed.category, parsed.merchant, parsed.description || 'Auto-parsed from SMS', parsed.date]
    );

    const expense = {
      id: expenseId,
      user_id: userId,
      amount: parsed.amount,
      category: parsed.category,
      merchant: parsed.merchant,
      description: parsed.description || 'Auto-parsed from SMS',
      date: parsed.date
    };

    await checkBudgets(userId, parsed.category, parsed.date);

    res.status(201).json({
      success: true,
      message: 'Transaction auto-logged via SMS webhook!',
      expense
    });
  } catch (err) {
    next(err);
  }
};
