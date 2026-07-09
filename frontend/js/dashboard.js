import { api } from './api.js';
import { setOfflineBannerVisible } from './notifications.js';
import { loadCycleSummary } from './settings.js';

let spentChartInstance = null;

// ── Impulse / necessity category classification ─────────────────────────────
const IMPULSIVE_CATS  = new Set(['Entertainment', 'Food']);
const NECESSARY_CATS  = new Set(['Utilities', 'Books/Supplies', 'Transport']);

// Per-transaction risk labels
const getTransactionRisk = (expense, budgetStatuses, goals, monthTotal) => {
  const isImpulsive = IMPULSIVE_CATS.has(expense.category);
  const isNecessary = NECESSARY_CATS.has(expense.category);

  // Check if this category's budget is running low (>80% spent)
  const catBudget = budgetStatuses.find(b => b.category === expense.category);
  const budgetWarning = catBudget && catBudget.limit_amount > 0
    ? (catBudget.spent / catBudget.limit_amount) >= 0.8
    : false;

  // Food delivery impulse: food expense > ₹200 suggests delivery
  const isLargeFood = expense.category === 'Food' && expense.amount > 200;

  if (expense.category === 'Entertainment' || isLargeFood) {
    return { label: '🔴 Impulse', cls: 'risk-impulse' };
  }
  if (budgetWarning && !isNecessary) {
    return { label: '🟡 Watch', cls: 'risk-watch' };
  }
  if (isNecessary) {
    return { label: '🟢 Essential', cls: 'risk-ok' };
  }
  return { label: '🔵 Normal', cls: 'risk-normal' };
};

// Goal impact tooltip string for a transaction amount
const getGoalImpact = (amount, goals) => {
  if (!goals || goals.length === 0) return null;
  // Pick the first incomplete goal
  const activeGoal = goals.find(g => g.current_amount < g.target_amount);
  if (!activeGoal || activeGoal.target_amount <= 0) return null;
  const pct = ((amount / activeGoal.target_amount) * 100).toFixed(1);
  return `₹${amount.toFixed(0)} = ${pct}% of "${activeGoal.name}"`;
};

// ── Weekly Spend Pattern calculator ────────────────────────────────────────
const computeWeekPattern = (expenses) => {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  oneWeekAgo.setHours(0, 0, 0, 0);

  const weekExpenses = expenses.filter(e => new Date(e.date) >= oneWeekAgo);

  let discretionary = 0;
  let necessary = 0;

  weekExpenses.forEach(e => {
    if (IMPULSIVE_CATS.has(e.category)) {
      discretionary += e.amount;
    } else {
      necessary += e.amount;
    }
  });

  const total = discretionary + necessary;
  const ratio = total > 0 ? Math.round((discretionary / total) * 100) : null;

  let verdict = null;
  let verdictColor = '#10b981';
  let verdictEmoji = '🟢';

  if (ratio !== null) {
    if (ratio >= 60) {
      verdict = 'High discretionary spend';
      verdictColor = '#f87171';
      verdictEmoji = '🔴';
    } else if (ratio >= 40) {
      verdict = 'Moderate — watch closely';
      verdictColor = '#fbbf24';
      verdictEmoji = '🟡';
    } else {
      verdict = 'Healthy spending pattern';
      verdictColor = '#34d399';
      verdictEmoji = '🟢';
    }
  }

  return { discretionary, necessary, total, ratio, verdict, verdictColor, verdictEmoji, weekExpenses };
};

// ── Main dashboard loader ──────────────────────────────────────────────────
export const loadDashboard = async () => {
  try {
    const currentMonth = new Date().toISOString().substring(0, 7);

    // 1. Fetch all data
    const expensesRes  = await api.expenses.list();
    const budgetRes    = await api.budgets.status(currentMonth);
    const goalsRes     = await api.goals.list();

    const expenses       = expensesRes.expenses || [];
    const budgetStatuses = budgetRes.status    || [];
    const goals          = goalsRes.goals      || [];

    // Filter current month
    const currentMonthExpenses = expenses.filter(e => e.date.startsWith(currentMonth));
    const totalSpent = currentMonthExpenses.reduce((acc, curr) => acc + curr.amount, 0);

    // 2. Stat cards
    document.getElementById('card-total-spent').textContent = `₹${totalSpent.toFixed(2)}`;

    const overallBudget = budgetStatuses.find(b => b.category === 'Overall');
    if (overallBudget) {
      const remaining = Math.max(0, overallBudget.limit_amount - totalSpent);
      document.getElementById('card-budget-remaining').textContent = `₹${remaining.toFixed(2)}`;
      document.getElementById('card-budget-desc').textContent = `of ₹${overallBudget.limit_amount.toFixed(2)} overall budget`;
    } else {
      document.getElementById('card-budget-remaining').textContent = 'N/A';
      document.getElementById('card-budget-desc').textContent = 'Configure in Budgets tab';
    }

    const totalSavings = goals.reduce((acc, curr) => acc + curr.current_amount, 0);
    document.getElementById('card-savings-saved').textContent = `₹${totalSavings.toFixed(2)}`;
    document.getElementById('card-savings-desc').textContent = `across ${goals.length} savings goal(s)`;

    // 3. Weekly pattern widget
    renderWeeklyPattern(expenses, goals);

    // 4. Smart recent transactions feed
    renderSmartTransactions(expenses.slice(0, 8), budgetStatuses, goals, totalSpent);

    // 5. Chart
    drawSpentChart(currentMonthExpenses);

    // 6. AI Forecast
    loadForecast();

    // 7. Safe-to-spend
    loadCycleSummary().catch(() => {});

  } catch (err) {
    console.error('Failed to load dashboard overview:', err);
  }
};

// ── Weekly Pattern Widget ──────────────────────────────────────────────────
const renderWeeklyPattern = (expenses, goals) => {
  const container = document.getElementById('weekly-pattern-widget');
  if (!container) return;

  const { discretionary, necessary, total, ratio, verdict, verdictColor, verdictEmoji } = computeWeekPattern(expenses);

  if (ratio === null) {
    container.innerHTML = `
      <div class="widget-title">📊 This Week's Pattern</div>
      <div style="text-align:center; color:var(--text-secondary); padding:1rem 0; font-size:0.9rem;">
        Log some expenses to see your weekly spending pattern.
      </div>
    `;
    return;
  }

  const necessaryRatio = 100 - ratio;

  container.innerHTML = `
    <div class="widget-title">📊 This Week's Pattern</div>

    <!-- Verdict Badge -->
    <div class="pattern-verdict" style="color:${verdictColor}; border-color:${verdictColor}40;">
      ${verdictEmoji} ${verdict}
    </div>

    <!-- Split bar -->
    <div class="pattern-split-bar">
      <div class="pattern-bar-disc" style="width:${ratio}%;" title="Discretionary: ${ratio}%"></div>
      <div class="pattern-bar-nec"  style="width:${necessaryRatio}%;" title="Necessary: ${necessaryRatio}%"></div>
    </div>
    <div class="pattern-bar-labels">
      <span style="color:#f87171;">🔴 Discretionary ${ratio}%</span>
      <span style="color:#34d399;">🟢 Necessary ${necessaryRatio}%</span>
    </div>

    <!-- Breakdown -->
    <div class="pattern-breakdown">
      <div>
        <div style="font-size:1.1rem; font-weight:700; color:#f87171;">₹${discretionary.toFixed(0)}</div>
        <div style="font-size:0.75rem; color:var(--text-secondary);">Food + Entertainment</div>
      </div>
      <div style="color:var(--text-secondary); align-self:center; font-size:1.2rem;">vs</div>
      <div>
        <div style="font-size:1.1rem; font-weight:700; color:#34d399;">₹${necessary.toFixed(0)}</div>
        <div style="font-size:0.75rem; color:var(--text-secondary);">Bills + Transport + Study</div>
      </div>
    </div>

    <!-- Ask Coach CTA -->
    ${ratio >= 40 ? `
    <button id="btn-pattern-coach" class="btn-pattern-coach">
      <svg style="width:14px;height:14px" viewBox="0 0 24 24"><path fill="currentColor" d="M20,2H4C2.9,2 2,2.9 2,4V22L6,18H20C21.1,18 22,17.1 22,16V4C22,2.9 21.1,2 20,2Z"/></svg>
      Ask Coach how to reduce impulsive spending →
    </button>` : ''}
  `;

  // Bind coach CTA
  const coachBtn = container.querySelector('#btn-pattern-coach');
  if (coachBtn) {
    coachBtn.addEventListener('click', () => {
      window.location.hash = '#coach';
      setTimeout(() => {
        const inputField = document.getElementById('coach-msg-input');
        const form = document.getElementById('coach-message-form');
        if (inputField && form) {
          inputField.value = `This week I spent ₹${discretionary.toFixed(0)} on Food & Entertainment (${ratio}% of my spending) and ₹${necessary.toFixed(0)} on essentials. My discretionary ratio feels high. Can you give me 3 specific tips to cut unnecessary spending this week?`;
          form.dispatchEvent(new Event('submit'));
        }
      }, 200);
    });
  }
};

// ── Smart Transaction Feed ─────────────────────────────────────────────────
const renderSmartTransactions = (recentExpenses, budgetStatuses, goals, monthTotal) => {
  const tbody = document.getElementById('dashboard-recent-expenses-tbody');
  if (!tbody) return;

  if (recentExpenses.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; color:var(--text-secondary); padding:2rem;">
          No expenses logged yet. Add some in the Expenses tab!
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = '';
  recentExpenses.forEach(exp => {
    const tr = document.createElement('tr');
    const risk = getTransactionRisk(exp, budgetStatuses, goals, monthTotal);
    const impact = getGoalImpact(exp.amount, goals);

    tr.innerHTML = `
      <td style="color:var(--text-secondary); font-size:0.88rem;">${exp.date}</td>
      <td>
        <div style="font-weight:500;">${exp.merchant}</div>
        ${impact ? `<div class="tx-goal-impact">${impact}</div>` : ''}
      </td>
      <td><span class="badge badge-${exp.category.toLowerCase().replace(/[^a-z]/g,'')}">${exp.category}</span></td>
      <td><span class="risk-tag ${risk.cls}">${risk.label}</span></td>
      <td style="font-weight:700; text-align:right;">₹${exp.amount.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
};

// ── Doughnut Chart ──────────────────────────────────────────────────────────
const drawSpentChart = (monthExpenses) => {
  const categoryTotals = {};
  monthExpenses.forEach(exp => {
    categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + exp.amount;
  });

  const labels = Object.keys(categoryTotals);
  const dataVals = Object.values(categoryTotals);
  const canvas = document.getElementById('dashboard-spent-chart');
  if (!canvas) return;

  if (spentChartInstance) spentChartInstance.destroy();

  if (labels.length === 0) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#9c97b3';
    ctx.font = '14px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText('No current spending data available', canvas.width / 2, canvas.height / 2);
    return;
  }

  const borderColors = {
    Food: '#ff7300', Transport: '#06b6d4', Entertainment: '#f43f5e',
    Utilities: '#f59e0b', 'Books/Supplies': '#10b981', Miscellaneous: '#9c97b3'
  };
  const bgColors = {
    Food: 'rgba(255,115,0,0.25)', Transport: 'rgba(6,182,212,0.25)',
    Entertainment: 'rgba(244,63,94,0.25)', Utilities: 'rgba(245,158,11,0.25)',
    'Books/Supplies': 'rgba(16,185,129,0.25)', Miscellaneous: 'rgba(156,151,179,0.25)'
  };

  spentChartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: dataVals,
        backgroundColor: labels.map(l => bgColors[l] || 'rgba(255,255,255,0.1)'),
        borderColor: labels.map(l => borderColors[l] || 'rgba(255,255,255,0.3)'),
        borderWidth: 1.5,
        hoverOffset: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#f3f0fc', font: { family: 'Outfit', size: 12 } }
        }
      }
    }
  });
};

// ── AI Forecast ─────────────────────────────────────────────────────────────
const loadForecast = async () => {
  const loadingEl = document.getElementById('forecast-loading');
  const contentEl = document.getElementById('forecast-content');
  const totalEl   = document.getElementById('forecast-predicted-total');
  const insightsEl = document.getElementById('forecast-insights');

  try {
    loadingEl.classList.remove('hidden');
    contentEl.classList.add('hidden');

    const result = await api.ai.forecast();
    const data = result.data || {};

    totalEl.textContent = `₹${(data.predictedTotal || 0).toFixed(2)}`;
    insightsEl.innerHTML = data.insights || 'No forecast insight compiled.';

    setOfflineBannerVisible(data.fallbackActive);
    loadingEl.classList.add('hidden');
    contentEl.classList.remove('hidden');
  } catch (err) {
    loadingEl.textContent = 'Forecasting offline or failed.';
    console.error('Forecasting failed:', err);
  }
};
