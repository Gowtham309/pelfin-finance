import { api } from './api.js';
import { fetchNotifications } from './notifications.js';

const goalForm = document.getElementById('goal-create-form');
const goalsList = document.getElementById('goals-status-list');

export const loadGoals = async () => {
  try {
    const data = await api.goals.list();
    const goals = data.goals || [];

    renderGoalsGrid(goals);
  } catch (err) {
    console.error('Failed to retrieve savings goals:', err);
  }
};

const renderGoalsGrid = (goals) => {
  if (goals.length === 0) {
    goalsList.innerHTML = `
      <div class="glass-card" style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 2.5rem;">
        No savings targets initialized yet. Create your first goal using the left panel.
      </div>
    `;
    return;
  }

  goalsList.innerHTML = '';
  goals.forEach((goal) => {
    const card = document.createElement('div');
    card.className = 'glass-card';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';

    // Header Row
    const header = document.createElement('div');
    header.className = 'goal-card-header';

    const titleDiv = document.createElement('div');
    const title = document.createElement('span');
    title.className = 'goal-card-title';
    title.textContent = goal.name;
    const targetDateSpan = document.createElement('div');
    targetDateSpan.style.fontSize = '0.75rem';
    targetDateSpan.style.color = 'var(--text-secondary)';
    targetDateSpan.textContent = `Target by: ${goal.target_date}`;

    titleDiv.appendChild(title);
    titleDiv.appendChild(targetDateSpan);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon-delete';
    delBtn.innerHTML = `
      <svg style="width:18px;height:18px" viewBox="0 0 24 24"><path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
    `;
    delBtn.addEventListener('click', async () => {
      if (confirm(`Delete the savings goal "${goal.name}"?`)) {
        try {
          await api.goals.delete(goal.id);
          loadGoals();
          fetchNotifications();
        } catch (e) {
          alert('Failed to delete savings goal.');
        }
      }
    });

    header.appendChild(titleDiv);
    header.appendChild(delBtn);
    card.appendChild(header);

    // Compute progress percent
    const percent = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0;
    const displayPercent = Math.min(100, percent);

    // Progress Bar Track
    const track = document.createElement('div');
    track.className = 'progress-track';

    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    bar.style.width = `${displayPercent}%`;
    bar.style.background = percent >= 100 
      ? 'linear-gradient(90deg, var(--success), #34d399)' 
      : 'linear-gradient(90deg, var(--accent-purple), var(--accent-cyan))';
    bar.style.boxShadow = percent >= 100
      ? '0 0 10px var(--success-glow)'
      : '0 0 10px var(--accent-cyan-glow)';

    track.appendChild(bar);
    card.appendChild(track);

    // Goals digits details
    const textRow = document.createElement('div');
    textRow.className = 'goal-numbers';
    textRow.innerHTML = `
      <span>₹${goal.current_amount.toFixed(2)} saved</span>
      <span>${percent.toFixed(0)}% of ₹${goal.target_amount.toFixed(2)}</span>
    `;
    card.appendChild(textRow);

    // Micro Actions Form (Deposit/Withdraw)
    const form = document.createElement('form');
    form.className = 'goal-actions';
    
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'form-input';
    input.placeholder = 'Amount';
    input.step = '0.01';
    input.required = true;
    input.style.padding = '0.4rem 0.65rem';
    input.style.fontSize = '0.85rem';

    const depBtn = document.createElement('button');
    depBtn.type = 'submit';
    depBtn.className = 'btn-primary';
    depBtn.style.padding = '0.4rem 0.75rem';
    depBtn.style.fontSize = '0.85rem';
    depBtn.textContent = 'Add';

    const withBtn = document.createElement('button');
    withBtn.type = 'button';
    withBtn.className = 'btn-secondary';
    withBtn.style.padding = '0.4rem 0.75rem';
    withBtn.style.fontSize = '0.85rem';
    withBtn.textContent = 'Withdraw';

    form.appendChild(input);
    form.appendChild(depBtn);
    form.appendChild(withBtn);
    card.appendChild(form);

    // Click logic
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = parseFloat(input.value);
      if (isNaN(amount) || amount <= 0) return;

      try {
        await api.goals.deposit(goal.id, amount);
        loadGoals();
        fetchNotifications();
      } catch (err) {
        alert(err.message || 'Failed to deposit savings.');
      }
    });

    withBtn.addEventListener('click', async () => {
      const amount = parseFloat(input.value);
      if (isNaN(amount) || amount <= 0) return;

      try {
        // Pass negative value to subtract
        await api.goals.deposit(goal.id, -amount);
        loadGoals();
        fetchNotifications();
      } catch (err) {
        alert(err.message || 'Failed to withdraw savings.');
      }
    });

    goalsList.appendChild(card);
  });
};

export const initGoals = () => {
  // Set default goal target date to 6 months from now
  const future = new Date();
  future.setMonth(future.getMonth() + 6);
  document.getElementById('goal-target-date').value = future.toISOString().substring(0, 10);

  // Form Submission
  goalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('goal-name').value;
    const target_amount = document.getElementById('goal-target-amount').value;
    const target_date = document.getElementById('goal-target-date').value;

    try {
      await api.goals.create({ name, target_amount, target_date });
      goalForm.reset();
      
      const fut = new Date();
      fut.setMonth(fut.getMonth() + 6);
      document.getElementById('goal-target-date').value = fut.toISOString().substring(0, 10);
      
      loadGoals();
      alert('Savings target initialized successfully!');
    } catch (err) {
      alert(err.message || 'Failed to create goal.');
    }
  });
};
