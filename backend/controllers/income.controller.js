import crypto from 'crypto';
import { dbAll, dbGet, dbRun } from '../config/db.js';

// Get list of incomes for user
export const getIncomes = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { is_confirmed, start_date, end_date } = req.query;

    let query = 'SELECT * FROM incomes WHERE user_id = ?';
    const params = [userId];

    if (is_confirmed !== undefined) {
      query += ' AND is_confirmed = ?';
      params.push(parseInt(is_confirmed) === 1 ? 1 : 0);
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

    const incomes = await dbAll(query, params);
    res.status(200).json({ success: true, incomes });
  } catch (err) {
    next(err);
  }
};

// Log income manually
export const createIncome = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { amount, source, description, date, type, is_confirmed } = req.body;

    if (amount === undefined || !source || !date) {
      return res.status(400).json({ success: false, message: 'Missing required income fields.' });
    }

    const valAmount = parseFloat(amount);
    if (isNaN(valAmount) || valAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Income amount must be a positive number.' });
    }

    const incomeId = crypto.randomUUID();
    const resolvedType = type || 'allowance';
    const confirmed = is_confirmed !== undefined ? (is_confirmed ? 1 : 0) : 1;

    await dbRun(
      `INSERT INTO incomes (id, user_id, amount, source, description, date, type, is_confirmed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [incomeId, userId, valAmount, source, description || '', date, resolvedType, confirmed]
    );

    const income = {
      id: incomeId,
      user_id: userId,
      amount: valAmount,
      source,
      description,
      date,
      type: resolvedType,
      is_confirmed: confirmed
    };

    res.status(201).json({ success: true, income });
  } catch (err) {
    next(err);
  }
};

// Update income details (manual modification)
export const updateIncome = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { amount, source, description, date, type, is_confirmed } = req.body;

    const existingIncome = await dbGet('SELECT * FROM incomes WHERE id = ? AND user_id = ?', [id, userId]);
    if (!existingIncome) {
      return res.status(404).json({ success: false, message: 'Income record not found.' });
    }

    const newAmount = amount !== undefined ? parseFloat(amount) : existingIncome.amount;
    if (isNaN(newAmount) || newAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Income amount must be a positive number.' });
    }

    const newSource = source || existingIncome.source;
    const newDesc = description !== undefined ? description : existingIncome.description;
    const newDate = date || existingIncome.date;
    const newType = type || existingIncome.type;
    const newConfirmed = is_confirmed !== undefined ? (is_confirmed ? 1 : 0) : existingIncome.is_confirmed;

    await dbRun(
      `UPDATE incomes 
       SET amount = ?, source = ?, description = ?, date = ?, type = ?, is_confirmed = ?
       WHERE id = ? AND user_id = ?`,
      [newAmount, newSource, newDesc, newDate, newType, newConfirmed, id, userId]
    );

    res.status(200).json({
      success: true,
      income: {
        id,
        user_id: userId,
        amount: newAmount,
        source: newSource,
        description: newDesc,
        date: newDate,
        type: newType,
        is_confirmed: newConfirmed
      }
    });
  } catch (err) {
    next(err);
  }
};

// Delete income
export const deleteIncome = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const existingIncome = await dbGet('SELECT * FROM incomes WHERE id = ? AND user_id = ?', [id, userId]);
    if (!existingIncome) {
      return res.status(404).json({ success: false, message: 'Income record not found.' });
    }

    await dbRun('DELETE FROM incomes WHERE id = ? AND user_id = ?', [id, userId]);

    res.status(200).json({ success: true, message: 'Income record deleted successfully.' });
  } catch (err) {
    next(err);
  }
};

// Confirm a conditional income
export const confirmIncome = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { type, linkExpenseId } = req.body; // type can be 'allowance', 'other', or 'refund'

    const existingIncome = await dbGet('SELECT * FROM incomes WHERE id = ? AND user_id = ?', [id, userId]);
    if (!existingIncome) {
      return res.status(404).json({ success: false, message: 'Income record not found.' });
    }

    const resolvedType = type || 'allowance';

    if (resolvedType === 'refund' && linkExpenseId) {
      // If linked to an expense, we can reduce that expense's amount
      const expense = await dbGet('SELECT * FROM expenses WHERE id = ? AND user_id = ?', [linkExpenseId, userId]);
      if (expense) {
        const newExpenseAmount = Math.max(0, expense.amount - existingIncome.amount);
        if (newExpenseAmount === 0) {
          // If the refund covers the full expense, delete it
          await dbRun('DELETE FROM expenses WHERE id = ? AND user_id = ?', [linkExpenseId, userId]);
        } else {
          // Otherwise deduct the refund amount
          await dbRun(
            'UPDATE expenses SET amount = ?, description = ? WHERE id = ? AND user_id = ?',
            [newExpenseAmount, `${expense.description || ''} (Refunded ₹${existingIncome.amount})`.trim(), linkExpenseId, userId]
          );
        }
      }
    }

    await dbRun(
      `UPDATE incomes SET is_confirmed = 1, type = ? WHERE id = ? AND user_id = ?`,
      [resolvedType, id, userId]
    );

    res.status(200).json({
      success: true,
      message: `Income confirmed as ${resolvedType}.`,
      income: {
        ...existingIncome,
        is_confirmed: 1,
        type: resolvedType
      }
    });
  } catch (err) {
    next(err);
  }
};
