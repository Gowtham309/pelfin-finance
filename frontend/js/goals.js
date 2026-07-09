import { api } from './api.js';
import { fetchNotifications } from './notifications.js';

const goalForm = document.getElementById('goal-create-form');
const goalsList = document.getElementById('goals-status-list');

// ── Helper: navigate to coach tab with pre-filled message ──────────────────
export const openCoachWithGoal = (goal) => {
  const remaining = Math.max(0, goal.target_amount - goal.current_amount);
  const pct = goal.target_amount > 0 ? ((goal.current_amount / goal.target_amount) * 100).toFixed(0) : 0;
  const message = `I want to save ₹${goal.target_amount.toFixed(0)} for my "${goal.name}" goal by ${goal.target_date}. I currently have ₹${goal.current_amount.toFixed(0)} saved (${pct}%). I still need ₹${remaining.toFixed(0)} more. How should I plan my weekly savings and what can I cut from my spending to reach this goal faster?`;

  // Switch to coach panel
  window.location.hash = '#coach';

  // Wait for panel to render, then inject message
  setTimeout(() => {
    const inputField = document.getElementById('coach-msg-input');
    const form = document.getElementById('coach-message-form');
    if (inputField && form) {
      inputField.value = message;
      form.dispatchEvent(new Event('submit'));
    }
  }, 200);
};

// ── Goal intelligence calculations ─────────────────────────────────────────
const computeGoalStats = (goal) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const targetDate = new Date(goal.target_date);
  targetDate.setHours(0, 0, 0, 0);

  const daysLeft = Math.max(0, Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24)));
  const weeksLeft = daysLeft / 7;

  const remaining = Math.max(0, goal.target_amount - goal.current_amount);
  const percent = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0;
  const isComplete = percent >= 100;

  // Required daily and weekly savings
  const dailyNeeded = daysLeft > 0 ? remaining / daysLeft : 0;
  const weeklyNeeded = weeksLeft > 0 ? remaining / weeksLeft : 0;

  // ETA estimate based on average past deposits (approximate: use current_amount / days since creation as pace)
  const createdDate = goal.created_at ? new Date(goal.created_at) : today;
  const daysSinceCreation = Math.max(1, Math.ceil((today - createdDate) / (1000 * 60 * 60 * 24)));
  const dailyPace = goal.current_amount > 0 ? goal.current_amount / daysSinceCreation : 0;

  // How many more days at current pace to reach goal
  const daysToGoalAtPace = dailyPace > 0 ? remaining / dailyPace : Infinity;
  const etaDate = new Date(today.getTime() + daysToGoalAtPace * 24 * 60 * 60 * 1000);

  // On-track logic: compare required daily pace vs current daily pace
  let trackStatus = 'no-data'; // 'on-track', 'behind', 'ahead', 'no-data', 'overdue'
  let trackMessage = '';

  if (isComplete) {
    trackStatus = 'complete';
    trackMessage = '🎉 Goal Achieved!';
  } else if (daysLeft === 0) {
    trackStatus = 'overdue';
    trackMessage = `⌛ Deadline passed — ₹${remaining.toFixed(0)} remaining`;
  } else if (goal.current_amount === 0) {
    trackStatus = 'no-data';
    trackMessage = `Start saving to track your progress`;
  } else {
    const buffer = dailyNeeded * 0.1; // 10% tolerance
    if (dailyPace >= dailyNeeded - buffer) {
      const daysEarly = Math.max(0, daysLeft - daysToGoalAtPace);
      trackStatus = 'on-track';
      trackMessage = daysEarly > 3
        ? `🟢 On track — ${Math.floor(daysEarly)} days early at this pace`
        : `🟢 On track — keep it up!`;
    } else {
      const weeksLate = Math.ceil((daysToGoalAtPace - daysLeft) / 7);
      trackStatus = 'behind';
      trackMessage = `🔴 Behind by ~${weeksLate} week${weeksLate !== 1 ? 's' : ''} at current pace`;
    }
  }

  // Discretionary cut suggestion (food delivery savings → goal weeks saved)
  // Assume avg food delivery = ₹150. Suggest cutting 2/week = ₹300/week
  const deliveryCutPerWeek = 300;
  const weeksShaved = weeklyNeeded > 0 && deliveryCutPerWeek > 0
    ? Math.floor((deliveryCutPerWeek / weeklyNeeded) * weeksLeft * 10) / 10
    : 0;

  return {
    daysLeft,
    weeksLeft,
    remaining,
    percent,
    isComplete,
    dailyNeeded,
    weeklyNeeded,
    trackStatus,
    trackMessage,
    etaDate: isFinite(daysToGoalAtPace) ? etaDate : null,
    weeksShaved
  };
};

// ── Render Goals Grid ──────────────────────────────────────────────────────
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
        <div style="font-size:2.5rem; margin-bottom:0.75rem;">🎯</div>
        <div style="font-size:1rem; font-weight:600; margin-bottom:0.5rem;">No savings targets yet</div>
        <div style="font-size:0.85rem;">Create your first goal — a gadget, a trip, an emergency fund — and Pelfin will map out exactly how to get there.</div>
      </div>
    `;
    return;
  }

  goalsList.innerHTML = '';
  goals.forEach((goal) => buildGoalCard(goal));
};

const buildGoalCard = (goal) => {
  const stats = computeGoalStats(goal);
  const card = document.createElement('div');
  card.className = 'glass-card goal-smart-card';

  // ── Status colour mapping
  const statusColors = {
    'complete':  { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)', text: '#34d399' },
    'on-track':  { bg: 'rgba(16,185,129,0.07)', border: 'rgba(16,185,129,0.2)',  text: '#34d399' },
    'behind':    { bg: 'rgba(244,63,94,0.08)',   border: 'rgba(244,63,94,0.25)',  text: '#f87171' },
    'overdue':   { bg: 'rgba(244,63,94,0.12)',   border: 'rgba(244,63,94,0.35)', text: '#f87171' },
    'no-data':   { bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.1)', text: 'var(--text-secondary)' }
  };
  const sc = statusColors[stats.trackStatus] || statusColors['no-data'];
  card.style.borderColor = sc.border;
  card.style.background = sc.bg + ', rgba(10, 7, 20, 0.5)';

  // ── Header
  card.innerHTML = `
    <!-- Goal Header Row -->
    <div class="goal-card-header">
      <div>
        <span class="goal-card-title">${goal.name}</span>
        <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.2rem;">
          Target by <strong style="color:var(--text-primary)">${goal.target_date}</strong>
          ${stats.daysLeft > 0 && !stats.isComplete ? `• <strong style="color:var(--accent-cyan-light)">${stats.daysLeft} days left</strong>` : ''}
        </div>
      </div>
      <div style="display:flex; gap:0.5rem; align-items:center;">
        <!-- Ask Coach Button -->
        <button class="btn-ask-coach-goal" title="Ask AI Coach about this goal">
          <svg style="width:16px;height:16px" viewBox="0 0 24 24"><path fill="currentColor" d="M20,2H4C2.9,2 2,2.9 2,4V22L6,18H20C21.1,18 22,17.1 22,16V4C22,2.9 21.1,2 20,2Z"/></svg>
          Ask Coach
        </button>
        <!-- Delete -->
        <button class="btn-icon-delete btn-goal-delete" title="Delete goal">
          <svg style="width:18px;height:18px" viewBox="0 0 24 24"><path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
        </button>
      </div>
    </div>

    <!-- Progress Bar -->
    <div class="progress-track" style="height:10px; margin-bottom:0.5rem;">
      <div class="progress-bar" style="width:${Math.min(100, stats.percent)}%; background: ${stats.isComplete
        ? 'linear-gradient(90deg,#10b981,#34d399)'
        : 'linear-gradient(90deg,var(--accent-purple),var(--accent-cyan))'};
        box-shadow: 0 0 10px ${stats.isComplete ? 'rgba(16,185,129,0.5)' : 'var(--accent-cyan-glow)'};"></div>
    </div>

    <!-- Amount row -->
    <div class="goal-numbers">
      <span>₹${goal.current_amount.toFixed(2)} saved</span>
      <span style="font-weight:700; color:var(--text-primary)">${stats.percent.toFixed(0)}% of ₹${goal.target_amount.toFixed(2)}</span>
    </div>

    <!-- Track Status Badge -->
    <div class="goal-track-badge" style="color:${sc.text}; border-color:${sc.border};">
      ${stats.trackMessage}
    </div>

    <!-- Stats Grid -->
    ${!stats.isComplete && stats.trackStatus !== 'overdue' ? `
    <div class="goal-stats-grid">
      <div class="goal-stat-item">
        <div class="goal-stat-val">₹${stats.dailyNeeded.toFixed(0)}</div>
        <div class="goal-stat-label">per day needed</div>
      </div>
      <div class="goal-stat-item">
        <div class="goal-stat-val">₹${stats.weeklyNeeded.toFixed(0)}</div>
        <div class="goal-stat-label">per week needed</div>
      </div>
      ${stats.etaDate ? `
      <div class="goal-stat-item">
        <div class="goal-stat-val" style="font-size:0.85rem;">${stats.etaDate.toLocaleDateString('en-IN', {day:'numeric', month:'short'})}</div>
        <div class="goal-stat-label">ETA at current pace</div>
      </div>` : ''}
    </div>` : ''}

    <!-- Tip row -->
    ${stats.weeksShaved > 0 && !stats.isComplete ? `
    <div class="goal-tip-row">
      💡 Skip 2 food deliveries/week → reach this goal <strong>~${stats.weeksShaved.toFixed(1)} weeks</strong> sooner
    </div>` : ''}

    <!-- Quick deposit chips -->
    <div class="goal-quick-chips">
      <span style="font-size:0.78rem; color:var(--text-secondary); align-self:center;">Quick save:</span>
      <button class="quick-chip" data-amount="50">+₹50</button>
      <button class="quick-chip" data-amount="100">+₹100</button>
      <button class="quick-chip" data-amount="500">+₹500</button>
    </div>

    <!-- Manual deposit / withdraw row -->
    <form class="goal-actions">
      <input type="number" class="form-input goal-amount-input" placeholder="₹ Amount" step="0.01" required>
      <button type="submit" class="btn-primary" style="padding:0.4rem 0.9rem; font-size:0.85rem;">Add</button>
      <button type="button" class="btn-secondary goal-withdraw-btn" style="padding:0.4rem 0.9rem; font-size:0.85rem;">Withdraw</button>
    </form>
  `;

  // ── Bind events

  // Delete
  card.querySelector('.btn-goal-delete').addEventListener('click', async () => {
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

  // Ask Coach
  card.querySelector('.btn-ask-coach-goal').addEventListener('click', () => {
    openCoachWithGoal(goal);
  });

  // Quick chip deposits
  card.querySelectorAll('.quick-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      const amount = parseFloat(chip.dataset.amount);
      chip.textContent = '✓';
      chip.disabled = true;
      try {
        await api.goals.deposit(goal.id, amount);
        setTimeout(() => loadGoals(), 600);
        fetchNotifications();
      } catch (err) {
        alert(err.message || 'Failed to deposit.');
        chip.textContent = `+₹${amount}`;
        chip.disabled = false;
      }
    });
  });

  // Manual deposit/withdraw form
  const manualForm = card.querySelector('.goal-actions');
  const amountInput = card.querySelector('.goal-amount-input');

  manualForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseFloat(amountInput.value);
    if (isNaN(amount) || amount <= 0) return;
    try {
      await api.goals.deposit(goal.id, amount);
      loadGoals();
      fetchNotifications();
    } catch (err) {
      alert(err.message || 'Failed to deposit savings.');
    }
  });

  card.querySelector('.goal-withdraw-btn').addEventListener('click', async () => {
    const amount = parseFloat(amountInput.value);
    if (isNaN(amount) || amount <= 0) return;
    try {
      await api.goals.deposit(goal.id, -amount);
      loadGoals();
      fetchNotifications();
    } catch (err) {
      alert(err.message || 'Failed to withdraw savings.');
    }
  });

  goalsList.appendChild(card);
};

// ── Init ──────────────────────────────────────────────────────────────────
export const initGoals = () => {
  // Default target date = 6 months from now
  const future = new Date();
  future.setMonth(future.getMonth() + 6);
  document.getElementById('goal-target-date').value = future.toISOString().substring(0, 10);

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
      fetchNotifications();
    } catch (err) {
      alert(err.message || 'Failed to create goal.');
    }
  });
};

// ── Export goal list fetcher for coach chip population ────────────────────
export const fetchGoalNames = async () => {
  try {
    const data = await api.goals.list();
    return (data.goals || []).filter(g => g.current_amount < g.target_amount);
  } catch {
    return [];
  }
};
