import { api } from './api.js';

const budgetForm = document.getElementById('budget-upsert-form');
const budgetStatusList = document.getElementById('budget-status-list');
const monthInput = document.getElementById('budget-month');

let budgetsChartInstance = null;

export const loadBudgets = async () => {
  try {
    const selectedMonth = monthInput.value || new Date().toISOString().substring(0, 7);
    if (!monthInput.value) {
      monthInput.value = selectedMonth;
    }

    const data = await api.budgets.status(selectedMonth);
    const statuses = data.status || [];

    renderBudgetWidgets(statuses);
    drawBudgetsChart(statuses);
  } catch (err) {
    console.error('Failed to load budget statuses:', err);
  }
};

const renderBudgetWidgets = (statuses) => {
  if (statuses.length === 0) {
    budgetStatusList.innerHTML = `
      <div class="glass-card" style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 2.5rem;">
        No budgets allocated for this month yet. Configure limits using the form above.
      </div>
    `;
    return;
  }

  budgetStatusList.innerHTML = '';
  statuses.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'glass-card';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';

    const title = document.createElement('h4');
    title.style.fontWeight = '600';
    title.textContent = item.category;

    const values = document.createElement('span');
    values.style.fontSize = '0.9rem';
    values.style.color = 'var(--text-secondary)';
    values.innerHTML = `Spent: <strong style="color:var(--text-primary)">₹${item.spent.toFixed(2)}</strong> of ₹${item.limit_amount.toFixed(2)}`;

    header.appendChild(title);
    header.appendChild(values);
    card.appendChild(header);

    // Progress Bar Track
    const progContainer = document.createElement('div');
    progContainer.className = 'budget-progress-container';

    const track = document.createElement('div');
    track.className = 'progress-track';

    const bar = document.createElement('div');
    const displayPercent = Math.min(100, item.percent);
    bar.style.width = `${displayPercent}%`;

    // Progress styling threshold levels
    if (item.percent >= 100) {
      bar.className = 'progress-bar danger';
    } else if (item.percent >= 80) {
      bar.className = 'progress-bar warning';
    } else {
      bar.className = 'progress-bar normal';
    }

    track.appendChild(bar);
    progContainer.appendChild(track);

    const footerText = document.createElement('span');
    footerText.style.fontSize = '0.8rem';
    footerText.style.alignSelf = 'flex-end';
    footerText.style.color = item.percent >= 100 ? 'var(--accent-pink-light)' : 'var(--text-secondary)';
    footerText.textContent = `${item.percent.toFixed(0)}% used`;

    progContainer.appendChild(footerText);
    card.appendChild(progContainer);

    budgetStatusList.appendChild(card);
  });
};

const drawBudgetsChart = (statuses) => {
  const canvas = document.getElementById('budgets-chart');
  if (!canvas) return;

  if (budgetsChartInstance) {
    budgetsChartInstance.destroy();
  }

  // Exclude overall budget to chart specific category breakouts
  const categoryStatuses = statuses.filter(s => s.category !== 'Overall');

  const labels = categoryStatuses.map(s => s.category);
  const limits = categoryStatuses.map(s => s.limit_amount);
  const expenditures = categoryStatuses.map(s => s.spent);

  if (labels.length === 0) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#9c97b3';
    ctx.font = '14px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText('No budget limit breakout configured.', canvas.width / 2, canvas.height / 2);
    return;
  }

  budgetsChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Limit Allocation',
          data: limits,
          backgroundColor: 'rgba(6, 182, 212, 0.25)',
          borderColor: '#06b6d4',
          borderWidth: 1.5
        },
        {
          label: 'Actual Spending',
          data: expenditures,
          backgroundColor: 'rgba(157, 78, 221, 0.25)',
          borderColor: '#9d4edd',
          borderWidth: 1.5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#f3f0fc', font: { family: 'Outfit' } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#f3f0fc', font: { family: 'Outfit' } }
        }
      },
      plugins: {
        legend: {
          labels: { color: '#f3f0fc', font: { family: 'Outfit' } }
        }
      }
    }
  });
};

export const initBudgets = () => {
  // Set target month selector default value to today's month
  monthInput.value = new Date().toISOString().substring(0, 7);

  // Form Submission
  budgetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const category = document.getElementById('budget-category').value;
    const limit_amount = document.getElementById('budget-limit').value;
    const month = monthInput.value;

    try {
      await api.budgets.upsert({ category, limit_amount, month });
      loadBudgets();
      alert('Budget limit successfully updated!');
    } catch (err) {
      alert(err.message || 'Failed to upsert budget.');
    }
  });

  // Target Month Change
  monthInput.addEventListener('change', () => {
    loadBudgets();
  });
};
