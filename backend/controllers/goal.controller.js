import crypto from 'crypto';
import { dbAll, dbGet, dbRun } from '../config/db.js';
import { checkGoalProgress } from '../services/notification.service.js';

export const getGoals = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const goals = await dbAll(
      'SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    res.status(200).json({ success: true, goals });
  } catch (err) {
    next(err);
  }
};

export const createGoal = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, target_amount, target_date } = req.body;

    if (!name || target_amount === undefined || !target_date) {
      return res.status(400).json({ success: false, message: 'Goal name, target amount, and target date are required.' });
    }

    const valTarget = parseFloat(target_amount);
    if (isNaN(valTarget) || valTarget <= 0) {
      return res.status(400).json({ success: false, message: 'Target amount must be a positive number.' });
    }

    const goalId = crypto.randomUUID();

    await dbRun(
      `INSERT INTO goals (id, user_id, name, target_amount, current_amount, target_date)
       VALUES (?, ?, ?, ?, 0.0, ?)`,
      [goalId, userId, name, valTarget, target_date]
    );

    const goal = {
      id: goalId,
      user_id: userId,
      name,
      target_amount: valTarget,
      current_amount: 0.0,
      target_date
    };

    res.status(201).json({ success: true, goal });
  } catch (err) {
    next(err);
  }
};

export const depositToGoal = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { amount } = req.body;

    if (amount === undefined) {
      return res.status(400).json({ success: false, message: 'Deposit/withdrawal amount is required.' });
    }

    const valAmount = parseFloat(amount);
    if (isNaN(valAmount)) {
      return res.status(400).json({ success: false, message: 'Amount must be a valid number.' });
    }

    const goal = await dbGet('SELECT * FROM goals WHERE id = ? AND user_id = ?', [id, userId]);
    if (!goal) {
      return res.status(404).json({ success: false, message: 'Savings goal not found.' });
    }

    const newAmount = Math.max(0, goal.current_amount + valAmount);

    await dbRun(
      'UPDATE goals SET current_amount = ? WHERE id = ? AND user_id = ?',
      [newAmount, id, userId]
    );

    const updatedGoal = {
      ...goal,
      current_amount: newAmount
    };

    // Trigger goal milestone checks
    await checkGoalProgress(userId, id);

    res.status(200).json({ success: true, goal: updatedGoal });
  } catch (err) {
    next(err);
  }
};

export const deleteGoal = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const goal = await dbGet('SELECT * FROM goals WHERE id = ? AND user_id = ?', [id, userId]);
    if (!goal) {
      return res.status(404).json({ success: false, message: 'Savings goal not found.' });
    }

    await dbRun('DELETE FROM goals WHERE id = ? AND user_id = ?', [id, userId]);

    res.status(200).json({ success: true, message: 'Savings goal deleted successfully.' });
  } catch (err) {
    next(err);
  }
};
