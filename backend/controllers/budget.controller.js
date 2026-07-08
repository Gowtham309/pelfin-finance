import crypto from 'crypto';
import { dbAll, dbGet, dbRun } from '../config/db.js';

export const getBudgets = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { month } = req.query;
    const queryMonth = month || new Date().toISOString().substring(0, 7); // Default to YYYY-MM

    const budgets = await dbAll(
      'SELECT * FROM budgets WHERE user_id = ? AND month = ?',
      [userId, queryMonth]
    );

    res.status(200).json({ success: true, budgets });
  } catch (err) {
    next(err);
  }
};

export const upsertBudget = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { category, limit_amount, month } = req.body;

    if (!category || limit_amount === undefined || !month) {
      return res.status(400).json({ success: false, message: 'Category, limit amount, and month are required.' });
    }

    const valLimit = parseFloat(limit_amount);
    if (isNaN(valLimit) || valLimit <= 0) {
      return res.status(400).json({ success: false, message: 'Limit amount must be a positive number.' });
    }

    // Verify month format YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: 'Month must be in YYYY-MM format.' });
    }

    const budgetId = crypto.randomUUID();

    // Use ON CONFLICT to update limit if user/category/month already exists
    await dbRun(
      `INSERT INTO budgets (id, user_id, category, limit_amount, month)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, category, month) 
       DO UPDATE SET limit_amount = excluded.limit_amount`,
      [budgetId, userId, category, valLimit, month]
    );

    // Fetch the final state
    const budget = await dbGet(
      'SELECT * FROM budgets WHERE user_id = ? AND category = ? AND month = ?',
      [userId, category, month]
    );

    res.status(200).json({ success: true, budget });
  } catch (err) {
    next(err);
  }
};

export const getBudgetStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { month } = req.query;
    const queryMonth = month || new Date().toISOString().substring(0, 7);

    // 1. Fetch all budgets
    const budgets = await dbAll(
      'SELECT * FROM budgets WHERE user_id = ? AND month = ?',
      [userId, queryMonth]
    );

    // 2. Fetch expenditures grouped by category
    const expenses = await dbAll(
      'SELECT category, SUM(amount) as total FROM expenses WHERE user_id = ? AND strftime("%Y-%m", date) = ? GROUP BY category',
      [userId, queryMonth]
    );

    const expenseMap = {};
    let totalSpent = 0;

    expenses.forEach((e) => {
      expenseMap[e.category] = e.total;
      totalSpent += e.total;
    });

    // 3. Assemble statuses
    const status = budgets.map((b) => {
      const spent = b.category === 'Overall' ? totalSpent : (expenseMap[b.category] || 0);
      return {
        id: b.id,
        category: b.category,
        limit_amount: b.limit_amount,
        spent,
        percent: b.limit_amount > 0 ? (spent / b.limit_amount) * 100 : 0
      };
    });

    res.status(200).json({ success: true, month: queryMonth, status });
  } catch (err) {
    next(err);
  }
};
