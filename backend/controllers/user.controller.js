import crypto from 'crypto';
import { dbGet, dbRun } from '../config/db.js';
import { mlClassify, recordCorrection, evaluateAccuracy, initMLModel } from '../services/ml.service.js';

// ── Get allowance settings ────────────────────────────────────────────────────
export const getSettings = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const settings = await dbGet(
      `SELECT allowance_amount, allowance_day, allowance_sources, conditional_threshold, fixed_expenses_estimate, savings_goal 
       FROM user_settings WHERE user_id = ?`,
      [userId]
    );
    res.status(200).json({
      success: true,
      settings: settings || {
        allowance_amount: 0,
        allowance_day: 1,
        allowance_sources: '',
        conditional_threshold: 500,
        fixed_expenses_estimate: 0,
        savings_goal: 0
      }
    });
  } catch (err) {
    next(err);
  }
};

// ── Save allowance settings ───────────────────────────────────────────────────
export const saveSettings = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      allowance_amount,
      allowance_day,
      allowance_sources,
      conditional_threshold,
      fixed_expenses_estimate,
      savings_goal
    } = req.body;

    const amount = parseFloat(allowance_amount);
    const day = parseInt(allowance_day);
    const sources = allowance_sources !== undefined ? allowance_sources : '';
    const threshold = parseFloat(conditional_threshold);
    const fixedEst = parseFloat(fixed_expenses_estimate);
    const goal = parseFloat(savings_goal);

    if (isNaN(amount) || amount < 0) {
      return res.status(400).json({ success: false, message: 'Invalid allowance amount.' });
    }
    if (isNaN(day) || day < 1 || day > 31) {
      return res.status(400).json({ success: false, message: 'Allowance day must be between 1 and 31.' });
    }
    if (isNaN(threshold) || threshold < 0) {
      return res.status(400).json({ success: false, message: 'Invalid conditional threshold.' });
    }
    if (isNaN(fixedEst) || fixedEst < 0) {
      return res.status(400).json({ success: false, message: 'Invalid fixed expenses estimate.' });
    }
    if (isNaN(goal) || goal < 0) {
      return res.status(400).json({ success: false, message: 'Invalid savings goal.' });
    }

    await dbRun(
      `INSERT INTO user_settings (user_id, allowance_amount, allowance_day, allowance_sources, conditional_threshold, fixed_expenses_estimate, savings_goal, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
         allowance_amount = excluded.allowance_amount,
         allowance_day    = excluded.allowance_day,
         allowance_sources = excluded.allowance_sources,
         conditional_threshold = excluded.conditional_threshold,
         fixed_expenses_estimate = excluded.fixed_expenses_estimate,
         savings_goal = excluded.savings_goal,
         updated_at       = CURRENT_TIMESTAMP`,
      [userId, amount, day, sources, threshold, fixedEst, goal]
    );

    res.status(200).json({
      success: true,
      settings: {
        allowance_amount: amount,
        allowance_day: day,
        allowance_sources: sources,
        conditional_threshold: threshold,
        fixed_expenses_estimate: fixedEst,
        savings_goal: goal
      }
    });
  } catch (err) {
    next(err);
  }
};

// ── Compute "safe to spend today" and Forecasting details ─────────────────────
export const getSafeToSpend = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const settings = await dbGet(
      `SELECT allowance_amount, allowance_day, allowance_sources, conditional_threshold, fixed_expenses_estimate, savings_goal 
       FROM user_settings WHERE user_id = ?`,
      [userId]
    );

    if (!settings || !settings.allowance_amount) {
      return res.status(200).json({
        success: true,
        safeToSpend: null,
        message: 'Set your allowance in Settings to enable this feature.'
      });
    }

    const {
      allowance_amount,
      allowance_day,
      fixed_expenses_estimate = 0,
      savings_goal = 0
    } = settings;

    const now = new Date();
    const today = now.getDate();
    const year = now.getFullYear();
    const month = now.getMonth();

    // Determine cycle start date
    let cycleStart;
    if (today >= allowance_day) {
      cycleStart = new Date(year, month, allowance_day);
    } else {
      cycleStart = new Date(year, month - 1, allowance_day);
    }

    // Determine next cycle start date
    let nextCycleStart;
    if (today >= allowance_day) {
      nextCycleStart = new Date(year, month + 1, allowance_day);
    } else {
      nextCycleStart = new Date(year, month, allowance_day);
    }

    const msPerDay = 86400000;
    const totalCycleDays = Math.round((nextCycleStart - cycleStart) / msPerDay);
    
    // Days elapsed prior to today
    const cycleStartStr = cycleStart.toISOString().substring(0, 10);
    const todayStr = now.toISOString().substring(0, 10);
    const nextCycleStartStr = nextCycleStart.toISOString().substring(0, 10);

    const todayDateObj = new Date(todayStr);
    const daysElapsedPrior = Math.round((todayDateObj - cycleStart) / msPerDay);
    const daysRemaining = Math.max(1, totalCycleDays - daysElapsedPrior);

    // Sum actual incomes in this cycle
    const incomeRow = await dbGet(
      `SELECT COALESCE(SUM(amount), 0) as total FROM incomes
       WHERE user_id = ? AND date >= ? AND date < ? AND is_confirmed = 1 AND type != 'refund'`,
      [userId, cycleStartStr, nextCycleStartStr]
    );
    const loggedIncome = incomeRow?.total || 0;

    // Check if any allowance-type income has been logged in this cycle
    const allowanceLoggedRow = await dbGet(
      `SELECT COUNT(*) as count FROM incomes
       WHERE user_id = ? AND date >= ? AND date < ? AND is_confirmed = 1 AND type = 'allowance'`,
      [userId, cycleStartStr, nextCycleStartStr]
    );
    const allowanceLogged = allowanceLoggedRow?.count > 0;
    const expectedAllowance = allowanceLogged ? 0 : allowance_amount;
    const totalIncome = loggedIncome + expectedAllowance;

    // Discretionary Pool
    const discretionaryPool = Math.max(0, totalIncome - savings_goal - fixed_expenses_estimate);

    // Baseline Daily Budget
    const baselineDailyBudget = discretionaryPool / totalCycleDays;

    // Sum actual discretionary spending prior to today
    const priorSpentRow = await dbGet(
      `SELECT COALESCE(SUM(amount), 0) as total FROM expenses
       WHERE user_id = ? AND date >= ? AND date < ? AND is_recurring = 0`,
      [userId, cycleStartStr, todayStr]
    );
    const priorSpent = priorSpentRow?.total || 0;

    // Carryover calculation
    const expectedSpentPrior = baselineDailyBudget * daysElapsedPrior;
    const carryover = expectedSpentPrior - priorSpent;

    // Today's Limit (baseline + carryover)
    const todayLimit = baselineDailyBudget + carryover;

    // Sum spent today
    const todaySpentRow = await dbGet(
      `SELECT COALESCE(SUM(amount), 0) as total FROM expenses
       WHERE user_id = ? AND date = ? AND is_recurring = 0`,
      [userId, todayStr]
    );
    const todaySpent = todaySpentRow?.total || 0;

    // Safe to Spend today remaining
    const safeToSpend = Math.max(0, todayLimit - todaySpent);

    // Total spent this cycle (including recurring/fixed)
    const totalSpentRow = await dbGet(
      `SELECT COALESCE(SUM(amount), 0) as total FROM expenses
       WHERE user_id = ? AND date >= ? AND date < ?`,
      [userId, cycleStartStr, nextCycleStartStr]
    );
    const totalSpentThisCycle = totalSpentRow?.total || 0;

    // Generate a daily milestone status array for the cycle so far
    const dailyStatuses = [];
    for (let i = 0; i <= daysElapsedPrior; i++) {
      const targetDate = new Date(cycleStart.getTime() + i * msPerDay);
      const targetDateStr = targetDate.toISOString().substring(0, 10);

      // Sum spent on that target date
      const daySpentRow = await dbGet(
        `SELECT COALESCE(SUM(amount), 0) as total FROM expenses
         WHERE user_id = ? AND date = ? AND is_recurring = 0`,
        [userId, targetDateStr]
      );
      const daySpent = daySpentRow?.total || 0;

      // Calculate the limit for that specific day
      const expectedPrior = baselineDailyBudget * i;
      const spentPriorRow = await dbGet(
        `SELECT COALESCE(SUM(amount), 0) as total FROM expenses
         WHERE user_id = ? AND date >= ? AND date < ? AND is_recurring = 0`,
        [userId, cycleStartStr, targetDateStr]
      );
      const spentPrior = spentPriorRow?.total || 0;
      const dayCarryover = expectedPrior - spentPrior;
      const dayLimit = baselineDailyBudget + dayCarryover;

      dailyStatuses.push({
        date: targetDateStr,
        limit: parseFloat(dayLimit.toFixed(2)),
        spent: parseFloat(daySpent.toFixed(2)),
        status: daySpent <= dayLimit ? 'met' : 'exceeded'
      });
    }

    res.status(200).json({
      success: true,
      safeToSpend: parseFloat(safeToSpend.toFixed(2)),
      todayLimit: parseFloat(todayLimit.toFixed(2)),
      todaySpent: parseFloat(todaySpent.toFixed(2)),
      carryover: parseFloat(carryover.toFixed(2)),
      daysRemaining,
      totalCycleDays,
      discretionaryPool: parseFloat(discretionaryPool.toFixed(2)),
      totalIncome: parseFloat(totalIncome.toFixed(2)),
      totalSpentThisCycle: parseFloat(totalSpentThisCycle.toFixed(2)),
      dailyStatuses,
      cycleStartDate: cycleStartStr,
      nextCycleDate: nextCycleStartStr
    });
  } catch (err) {
    next(err);
  }
};

// ── ML: classify a text snippet ───────────────────────────────────────────────
export const mlClassifyText = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, message: 'Text is required.' });
    }
    const category = await mlClassify(text);
    res.status(200).json({ success: true, category });
  } catch (err) {
    next(err);
  }
};

// ── ML: record a user correction ──────────────────────────────────────────────
export const mlCorrect = async (req, res, next) => {
  try {
    const { text, category } = req.body;
    if (!text || !category) {
      return res.status(400).json({ success: false, message: 'Both text and category are required.' });
    }
    await recordCorrection(text, category);
    res.status(200).json({ success: true, message: 'Correction recorded. Model retrained.' });
  } catch (err) {
    next(err);
  }
};

// ── ML: accuracy report ───────────────────────────────────────────────────────
export const mlAccuracy = async (req, res, next) => {
  try {
    const report = await evaluateAccuracy();
    res.status(200).json({ success: true, report });
  } catch (err) {
    next(err);
  }
};
