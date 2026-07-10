import { dbGet, dbRun, dbAll } from '../config/db.js';
import crypto from 'crypto';

export const checkBudgets = async (userId, category, dateString) => {
  try {
    const month = dateString.substring(0, 7); // Extract "YYYY-MM"

    // Fetch budget for specific category and overall limit
    const budgets = await dbAll(
      "SELECT * FROM budgets WHERE user_id = ? AND month = ? AND (category = ? OR category = 'Overall')",
      [userId, month, category]
    );

    if (budgets.length === 0) return;

    for (const budget of budgets) {
      const isOverall = budget.category === 'Overall';

      let totalSpentQuery = 'SELECT SUM(amount) as total FROM expenses WHERE user_id = ? AND strftime("%Y-%m", date) = ?';
      let params = [userId, month];

      if (!isOverall) {
        totalSpentQuery += ' AND category = ?';
        params.push(budget.category);
      }

      const spentResult = await dbGet(totalSpentQuery, params);
      const totalSpent = spentResult?.total || 0;
      const budgetLimit = budget.limit_amount;
      const percent = (totalSpent / budgetLimit) * 100;

      let threshold = 0;
      let alertTitle = '';
      let alertMessage = '';

      if (percent >= 100) {
        threshold = 100;
        alertTitle = `${budget.category} Budget Exceeded`;
        alertMessage = `You have spent ₹${totalSpent.toFixed(2)} of your ₹${budgetLimit.toFixed(2)} budget for ${budget.category} in ${month} (${percent.toFixed(0)}%).`;
      } else if (percent >= 80) {
        threshold = 80;
        alertTitle = `${budget.category} Budget Warning`;
        alertMessage = `You have spent ₹${totalSpent.toFixed(2)} of your ₹${budgetLimit.toFixed(2)} budget for ${budget.category} in ${month} (${percent.toFixed(0)}%).`;
      }

      if (threshold > 0) {
        // Prevent duplicate spam messages
        const existingAlert = await dbGet(
          'SELECT id FROM notifications WHERE user_id = ? AND type = "budget_warning" AND title = ? AND message = ?',
          [userId, alertTitle, alertMessage]
        );

        if (!existingAlert) {
          const notificationId = crypto.randomUUID();
          await dbRun(
            'INSERT INTO notifications (id, user_id, title, message, type) VALUES (?, ?, ?, ?, ?)',
            [notificationId, userId, alertTitle, alertMessage, 'budget_warning']
          );
        }
      }
    }
  } catch (err) {
    console.error('Error during budget notification check:', err);
  }
};

export const checkGoalProgress = async (userId, goalId) => {
  try {
    const goal = await dbGet('SELECT * FROM goals WHERE id = ? AND user_id = ?', [goalId, userId]);
    if (!goal) return;

    const percent = (goal.current_amount / goal.target_amount) * 100;
    let threshold = 0;

    if (percent >= 100) {
      threshold = 100;
    } else if (percent >= 90) {
      threshold = 90;
    } else if (percent >= 50) {
      threshold = 50;
    }

    if (threshold > 0) {
      const alertTitle = `Goal Milestone Reached: ${goal.name}`;
      const alertMessage = `Your savings goal "${goal.name}" is now at ${percent.toFixed(0)}%! (₹${goal.current_amount.toFixed(2)} saved of ₹${goal.target_amount.toFixed(2)})`;

      const existingAlert = await dbGet(
        'SELECT id FROM notifications WHERE user_id = ? AND type = "goal_milestone" AND title = ? AND message = ?',
        [userId, alertTitle, alertMessage]
      );

      if (!existingAlert) {
        const notificationId = crypto.randomUUID();
        await dbRun(
          'INSERT INTO notifications (id, user_id, title, message, type) VALUES (?, ?, ?, ?, ?)',
          [notificationId, userId, alertTitle, alertMessage, 'goal_milestone']
        );
      }
    }
  } catch (err) {
    console.error('Error during savings goal progress notification check:', err);
  }
};
