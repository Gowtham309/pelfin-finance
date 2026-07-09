import { api } from './api.js';

const allowanceForm = document.getElementById('settings-allowance-form');
const allowanceStatus = document.getElementById('settings-allowance-status');
const cycleSummary = document.getElementById('cycle-summary-content');
const mlReportContent = document.getElementById('ml-report-content');
const runEvalBtn = document.getElementById('btn-run-ml-eval');

// ── Load existing settings and cycle summary ──────────────────────────────────
const loadSettings = async () => {
  try {
    const res = await api.users.getSettings();
    const s = res.settings || {};
    if (s.allowance_amount) {
      document.getElementById('settings-allowance-amount').value = s.allowance_amount;
    }
    if (s.allowance_day) {
      document.getElementById('settings-allowance-day').value = s.allowance_day;
    }
    if (s.allowance_sources) {
      document.getElementById('settings-allowance-sources').value = s.allowance_sources;
    }
    if (s.conditional_threshold !== undefined) {
      document.getElementById('settings-conditional-threshold').value = s.conditional_threshold;
    }
    if (s.fixed_expenses_estimate !== undefined) {
      document.getElementById('settings-fixed-estimate').value = s.fixed_expenses_estimate;
    }
    if (s.savings_goal !== undefined) {
      document.getElementById('settings-savings-goal').value = s.savings_goal;
    }
    await loadCycleSummary();
  } catch (err) {
    console.warn('Failed to load user settings:', err.message);
  }
};

// ── Load cycle safe-to-spend summary ─────────────────────────────────────────
const loadCycleSummary = async () => {
  try {
    const res = await api.users.getSafeToSpend();
    if (!res.safeToSpend && res.safeToSpend !== 0) {
      cycleSummary.innerHTML = `<div style="text-align:center; color:var(--text-secondary); padding:1rem;">Set your allowance above to see cycle stats.</div>`;
      return;
    }

    const pct = res.discretionaryPool > 0
      ? Math.min(100, (res.totalSpentThisCycle / res.discretionaryPool) * 100).toFixed(0)
      : 0;

    const carryoverText = res.carryover >= 0
      ? `<span style="color:#10b981; font-weight:700;">+₹${res.carryover.toFixed(2)}</span>`
      : `<span style="color:#f43f5e; font-weight:700;">-₹${Math.abs(res.carryover).toFixed(2)}</span>`;

    cycleSummary.innerHTML = `
      <div style="font-size:2rem; font-weight:800; color:#10b981; text-align:center;">
        ₹${res.safeToSpend.toFixed(2)}<br>
        <span style="font-size:1rem; font-weight:500; color:var(--text-secondary);">safe to spend today</span>
      </div>
      <div style="text-align:center; font-size:0.9rem; margin-top:0.25rem;">
        Carryover: ${carryoverText}
      </div>
      <div style="height:6px; background:rgba(255,255,255,0.08); border-radius:99px; overflow:hidden; margin:0.75rem 0;">
        <div style="height:100%; width:${pct}%; background: linear-gradient(90deg, #10b981, #f43f5e); border-radius:99px; transition:width 0.5s;"></div>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; font-size:0.85rem;">
        <div style="background:rgba(255,255,255,0.04); padding:0.6rem; border-radius:8px;">
          <div style="color:var(--text-secondary);">Cycle Income</div>
          <div style="font-weight:600;">₹${res.totalIncome.toFixed(2)}</div>
        </div>
        <div style="background:rgba(255,255,255,0.04); padding:0.6rem; border-radius:8px;">
          <div style="color:var(--text-secondary);">Spent This Cycle</div>
          <div style="font-weight:600; color:${pct > 80 ? '#f43f5e' : 'inherit'};">₹${res.totalSpentThisCycle.toFixed(2)}</div>
        </div>
        <div style="background:rgba(255,255,255,0.04); padding:0.6rem; border-radius:8px;">
          <div style="color:var(--text-secondary);">Discretionary Pool</div>
          <div style="font-weight:600; color:#22d3ee;">₹${res.discretionaryPool.toFixed(2)}</div>
        </div>
        <div style="background:rgba(255,255,255,0.04); padding:0.6rem; border-radius:8px;">
          <div style="color:var(--text-secondary);">Days Left</div>
          <div style="font-weight:600;">${res.daysRemaining} / ${res.totalCycleDays} days</div>
        </div>
      </div>
      <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.5rem; text-align:center;">
        Cycle: ${res.cycleStartDate} → ${res.nextCycleDate}
      </div>
    `;

    // Also update the dashboard card
    const dashCard = document.getElementById('card-safe-to-spend');
    const dashDesc = document.getElementById('card-safe-to-spend-desc');
    if (dashCard) {
      dashCard.textContent = `₹${res.safeToSpend.toFixed(2)}`;
    }
    if (dashDesc) {
      dashDesc.textContent = `${res.daysRemaining} days left (Carryover: ${res.carryover >= 0 ? '+' : ''}₹${res.carryover.toFixed(0)})`;
    }
  } catch (err) {
    console.warn('Failed to load cycle summary:', err.message);
  }
};

// ── ML Accuracy Report ────────────────────────────────────────────────────────
const renderMLReport = async () => {
  runEvalBtn.disabled = true;
  runEvalBtn.textContent = 'Evaluating...';
  mlReportContent.innerHTML = `<div style="text-align:center; color:var(--text-secondary); padding:1rem;">Running evaluation on hold-out test set...</div>`;

  try {
    const res = await api.users.mlAccuracy();
    const r = res.report;

    const correctBadge = (isCorrect) =>
      isCorrect
        ? `<span style="color:#10b981; font-weight:700;">✓</span>`
        : `<span style="color:#f43f5e; font-weight:700;">✗</span>`;

    const rows = r.results.map(item => `
      <tr>
        <td style="font-size:0.82rem; color:var(--text-secondary);">${item.text}</td>
        <td><span class="badge badge-${item.expected.toLowerCase().replace(/[^a-z]/g,'')}">${item.expected}</span></td>
        <td><span class="badge badge-${item.predicted.toLowerCase().replace(/[^a-z]/g,'')}">${item.predicted}</span></td>
        <td style="text-align:center;">${correctBadge(item.correct)}</td>
      </tr>
    `).join('');

    const accuracyColor = r.accuracy >= 80 ? '#10b981' : r.accuracy >= 60 ? '#f59e0b' : '#f43f5e';

    mlReportContent.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:1rem; margin-bottom:1.5rem;">
        <div style="background:rgba(255,255,255,0.05); padding:1rem; border-radius:10px; text-align:center;">
          <div style="font-size:2rem; font-weight:800; color:${accuracyColor};">${r.accuracy}%</div>
          <div style="color:var(--text-secondary); font-size:0.8rem;">Accuracy</div>
        </div>
        <div style="background:rgba(255,255,255,0.05); padding:1rem; border-radius:10px; text-align:center;">
          <div style="font-size:1.5rem; font-weight:700;">${r.correct}/${r.total}</div>
          <div style="color:var(--text-secondary); font-size:0.8rem;">Correct / Total</div>
        </div>
        <div style="background:rgba(255,255,255,0.05); padding:1rem; border-radius:10px; text-align:center;">
          <div style="font-size:1.5rem; font-weight:700;">${r.seedSize}</div>
          <div style="color:var(--text-secondary); font-size:0.8rem;">Seed Samples</div>
        </div>
        <div style="background:rgba(255,255,255,0.05); padding:1rem; border-radius:10px; text-align:center;">
          <div style="font-size:1.5rem; font-weight:700;">${r.vocabSize}</div>
          <div style="color:var(--text-secondary); font-size:0.8rem;">Vocab Size</div>
        </div>
      </div>
      <div class="transaction-table-wrapper">
        <table>
          <thead><tr><th>Test Input</th><th>Expected</th><th>Predicted</th><th>Result</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p style="font-size:0.78rem; color:var(--text-secondary); margin-top:0.75rem;">
        Evaluated on a held-out test set not in the training corpus. Model trained on ${r.seedSize} seed samples + ${r.correctionCount} user corrections. Vocab: ${r.vocabSize} unique tokens.
      </p>
    `;
  } catch (err) {
    mlReportContent.innerHTML = `<div style="color:#f43f5e; padding:1rem;">Evaluation failed: ${err.message}</div>`;
  } finally {
    runEvalBtn.disabled = false;
    runEvalBtn.textContent = 'Run Evaluation';
  }
};

// ── Init bindings ─────────────────────────────────────────────────────────────
export const initSettings = () => {
  allowanceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = document.getElementById('settings-allowance-amount').value;
    const day = document.getElementById('settings-allowance-day').value;
    const sources = document.getElementById('settings-allowance-sources').value;
    const threshold = document.getElementById('settings-conditional-threshold').value;
    const fixedEst = document.getElementById('settings-fixed-estimate').value;
    const goal = document.getElementById('settings-savings-goal').value;

    try {
      await api.users.saveSettings({
        allowance_amount: amount,
        allowance_day: day,
        allowance_sources: sources,
        conditional_threshold: threshold,
        fixed_expenses_estimate: fixedEst,
        savings_goal: goal
      });
      allowanceStatus.textContent = '✓ Settings saved successfully!';
      allowanceStatus.classList.remove('hidden');
      setTimeout(() => allowanceStatus.classList.add('hidden'), 3000);
      await loadCycleSummary();
    } catch (err) {
      allowanceStatus.textContent = `Error: ${err.message}`;
      allowanceStatus.style.color = '#f43f5e';
      allowanceStatus.classList.remove('hidden');
    }
  });

  runEvalBtn.addEventListener('click', renderMLReport);
};

export { loadSettings, loadCycleSummary };
