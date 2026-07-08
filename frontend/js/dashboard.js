import { api } from './api.js';
import { setOfflineBannerVisible } from './notifications.js';

let spentChartInstance = null;

export const loadDashboard = async () => {
  try {
    const currentMonth = new Date().toISOString().substring(0, 7);

    // 1. Fetch expenses & budget status
    const expensesRes = await api.expenses.list();
    const budgetRes = await api.budgets.status(currentMonth);
    const goalsRes = await api.goals.list();

    const expenses = expensesRes.expenses || [];
    const budgetStatuses = budgetRes.status || [];
    const goals = goalsRes.goals || [];

    // Filter current month expenses
    const currentMonthExpenses = expenses.filter(e => e.date.startsWith(currentMonth));
    const totalSpent = currentMonthExpenses.reduce((acc, curr) => acc + curr.amount, 0);

    // 2. Set Up Overview metrics
    document.getElementById('card-total-spent').textContent = `₹${totalSpent.toFixed(2)}`;

    // Set Up remaining budget summary
    const overallBudget = budgetStatuses.find(b => b.category === 'Overall');
    if (overallBudget) {
      const remaining = Math.max(0, overallBudget.limit_amount - totalSpent);
      document.getElementById('card-budget-remaining').textContent = `₹${remaining.toFixed(2)}`;
      document.getElementById('card-budget-desc').textContent = `of ₹${overallBudget.limit_amount.toFixed(2)} overall budget`;
    } else {
      document.getElementById('card-budget-remaining').textContent = 'N/A';
      document.getElementById('card-budget-desc').textContent = 'Configure in Budgets tab';
    }

    // Set Up savings summary
    const totalSavings = goals.reduce((acc, curr) => acc + curr.current_amount, 0);
    document.getElementById('card-savings-saved').textContent = `₹${totalSavings.toFixed(2)}`;
    document.getElementById('card-savings-desc').textContent = `across ${goals.length} savings goal(s)`;

    // 3. Render recent expenses table
    const recentTableTbody = document.getElementById('dashboard-recent-expenses-tbody');
    const recentExpenses = expenses.slice(0, 5);

    if (recentExpenses.length === 0) {
      recentTableTbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: var(--text-secondary); padding: 1.5rem;">
            No expenses logged yet.
          </td>
        </tr>
      `;
    } else {
      recentTableTbody.innerHTML = '';
      recentExpenses.forEach((exp) => {
        const tr = document.createElement('tr');

        const dateTd = document.createElement('td');
        dateTd.textContent = exp.date;
        
        const merchTd = document.createElement('td');
        merchTd.textContent = exp.merchant;
        
        const catTd = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = `badge badge-${exp.category.toLowerCase().replace(/[^a-z]/g, '')}`;
        badge.textContent = exp.category;
        catTd.appendChild(badge);
        
        const amtTd = document.createElement('td');
        amtTd.style.fontWeight = '600';
        amtTd.textContent = `₹${exp.amount.toFixed(2)}`;

        tr.appendChild(dateTd);
        tr.appendChild(merchTd);
        tr.appendChild(catTd);
        tr.appendChild(amtTd);

        recentTableTbody.appendChild(tr);
      });
    }

    // 4. Draw Chart.js breakdown
    drawSpentChart(currentMonthExpenses);

    // 5. Load AI Forecast details
    loadForecast();

  } catch (err) {
    console.error('Failed to load dashboard overview details:', err);
  }
};

const drawSpentChart = (monthExpenses) => {
  const categoryTotals = {};
  monthExpenses.forEach((exp) => {
    categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + exp.amount;
  });

  const labels = Object.keys(categoryTotals);
  const dataVals = Object.values(categoryTotals);

  const canvas = document.getElementById('dashboard-spent-chart');
  if (!canvas) return;

  if (spentChartInstance) {
    spentChartInstance.destroy();
  }

  if (labels.length === 0) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#9c97b3';
    ctx.font = '14px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText('No current spending data available for chart visualizer', canvas.width / 2, canvas.height / 2);
    return;
  }

  // Neon-glow themed colors
  const borderColors = {
    Food: '#9d4edd',
    Transport: '#06b6d4',
    Entertainment: '#f43f5e',
    Utilities: '#f59e0b',
    'Books/Supplies': '#10b981',
    Miscellaneous: '#9c97b3'
  };

  const bgColors = {
    Food: 'rgba(157, 78, 221, 0.25)',
    Transport: 'rgba(6, 182, 212, 0.25)',
    Entertainment: 'rgba(244, 63, 94, 0.25)',
    Utilities: 'rgba(245, 158, 11, 0.25)',
    'Books/Supplies': 'rgba(16, 185, 129, 0.25)',
    Miscellaneous: 'rgba(156, 151, 179, 0.25)'
  };

  const backgrounds = labels.map(l => bgColors[l] || 'rgba(255, 255, 255, 0.1)');
  const borders = labels.map(l => borderColors[l] || 'rgba(255, 255, 255, 0.3)');

  spentChartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: dataVals,
        backgroundColor: backgrounds,
        borderColor: borders,
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
          labels: {
            color: '#f3f0fc',
            font: {
              family: 'Outfit',
              size: 12
            }
          }
        }
      }
    }
  });
};

const loadForecast = async () => {
  const loadingEl = document.getElementById('forecast-loading');
  const contentEl = document.getElementById('forecast-content');
  const totalEl = document.getElementById('forecast-predicted-total');
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
    loadingEl.textContent = 'Forecasting offline or failed to analyze data.';
    console.error('Forecasting request failed:', err);
  }
};
