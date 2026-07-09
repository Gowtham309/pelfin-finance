import { api } from './api.js';
import { setOfflineBannerVisible } from './notifications.js';
import { fetchGoalNames } from './goals.js';

const chatHistoryDiv = document.getElementById('coach-chat-history');
const messageForm    = document.getElementById('coach-message-form');
const inputField     = document.getElementById('coach-msg-input');
const chipsContainer = document.getElementById('coach-chips-container');

let conversationHistory = [];

// ── Markdown renderer (richer than before) ─────────────────────────────────
const renderMarkdown = (text) => {
  return text
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Headers (### and ##)
    .replace(/^### (.+)$/gm, '<h4 style="margin:0.5rem 0 0.25rem; font-size:0.95rem; color:var(--accent-cyan-light)">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="margin:0.6rem 0 0.3rem; font-size:1rem; color:var(--accent-purple-light)">$1</h3>')
    // Dividers
    .replace(/^---$/gm, '<hr style="border:none; border-top:var(--glass-border); margin:0.75rem 0;">')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid var(--accent-cyan); padding-left:0.75rem; color:var(--text-secondary); margin:0.25rem 0;">$1</blockquote>')
    // Bullet lists  – convert `- item` or `• item` lines
    .replace(/^[•\-] (.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> blocks in <ul>
    .replace(/(<li>.*<\/li>\n?)+/gs, match => `<ul style="margin:0.4rem 0 0.4rem 1.25rem;">${match}</ul>`)
    // Newlines → paragraphs (skip if already a block-level element)
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (/^<(h[234]|ul|li|hr|blockquote)/.test(trimmed)) return trimmed;
      return `<p style="margin:0.25rem 0;">${trimmed}</p>`;
    })
    .join('');
};

// ── Append a chat bubble ──────────────────────────────────────────────────
const appendMessage = (sender, text) => {
  const isUser = sender === 'user';

  const msgWrapper = document.createElement('div');
  msgWrapper.className = `chat-message ${isUser ? 'user' : 'coach'}`;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = isUser ? 'ME' : 'AI';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.innerHTML = isUser
    ? `<p style="margin:0">${text.replace(/</g, '&lt;')}</p>`
    : renderMarkdown(text);

  msgWrapper.appendChild(avatar);
  msgWrapper.appendChild(bubble);
  chatHistoryDiv.appendChild(msgWrapper);
  chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight;
};

// ── Typing indicator ──────────────────────────────────────────────────────
const showTypingIndicator = () => {
  const wrapper = document.createElement('div');
  wrapper.className = 'chat-message coach';
  wrapper.id = 'typing-indicator-wrapper';
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = 'AI';
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.innerHTML = `
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>`;
  wrapper.appendChild(avatar);
  wrapper.appendChild(bubble);
  chatHistoryDiv.appendChild(wrapper);
  chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight;
};

const hideTypingIndicator = () => {
  document.getElementById('typing-indicator-wrapper')?.remove();
};

// ── Send a message ─────────────────────────────────────────────────────────
const sendMessage = async (text) => {
  if (!text) return;
  inputField.value = '';
  appendMessage('user', text);
  showTypingIndicator();

  try {
    const response = await api.ai.coach(text, conversationHistory);
    hideTypingIndicator();
    appendMessage('coach', response.text);
    setOfflineBannerVisible(response.fallbackActive);

    conversationHistory.push({ sender: 'user', text });
    conversationHistory.push({ sender: 'coach', text: response.text });
    if (conversationHistory.length > 14) {
      conversationHistory.splice(0, 2);
    }
  } catch (err) {
    hideTypingIndicator();
    appendMessage('coach', `Sorry, I'm having trouble replying right now: ${err.message}`);
  }
};

// ── Dynamic suggestion chips (goal-aware) ─────────────────────────────────
const DEFAULT_CHIPS = [
  { label: 'Set up a student budget', msg: 'How do I set up a realistic monthly budget as a student with a fixed allowance?' },
  { label: 'Cut food spending', msg: 'Give me 5 practical tips to reduce my food and dining out expenses as a student.' },
  { label: 'Manage credit / debt', msg: 'How should I manage credit card interest and avoid debt as a student?' },
];

const buildChips = async () => {
  if (!chipsContainer) return;
  chipsContainer.innerHTML = '';

  const goalChips = [];
  try {
    const activeGoals = await fetchGoalNames(); // from goals.js
    activeGoals.slice(0, 2).forEach(goal => {
      const remaining = (goal.target_amount - goal.current_amount).toFixed(0);
      goalChips.push({
        label: `🎯 ${goal.name} goal`,
        msg: `I'm saving for "${goal.name}". I need ₹${remaining} more to reach ₹${goal.target_amount}. What's the best strategy to save this as a student?`
      });
    });
  } catch (_) {}

  const allChips = [...goalChips, ...DEFAULT_CHIPS].slice(0, 5);

  allChips.forEach(chip => {
    const btn = document.createElement('button');
    btn.className = 'suggestion-chip';
    btn.textContent = chip.label;
    btn.addEventListener('click', () => sendMessage(chip.msg));
    chipsContainer.appendChild(btn);
  });
};

// ── Live mini-goals sidebar ───────────────────────────────────────────────
const buildGoalsSidebar = async () => {
  const sidebar = document.getElementById('coach-goals-sidebar');
  if (!sidebar) return;

  try {
    const activeGoals = await fetchGoalNames();
    if (activeGoals.length === 0) {
      sidebar.innerHTML = `<div class="coach-sidebar-title">🎯 Your Goals</div>
        <div style="font-size:0.8rem; color:var(--text-secondary); text-align:center; padding:0.75rem 0;">No active goals yet.<br>Set one in the Goals tab!</div>`;
      return;
    }

    const items = activeGoals.slice(0, 4).map(g => {
      const pct = Math.min(100, (g.current_amount / g.target_amount) * 100).toFixed(0);
      const remaining = (g.target_amount - g.current_amount).toFixed(0);
      return `
        <div class="coach-goal-item">
          <div class="coach-goal-name">${g.name}</div>
          <div class="coach-goal-bar-track">
            <div class="coach-goal-bar-fill" style="width:${pct}%"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:0.73rem; color:var(--text-secondary); margin-top:0.2rem;">
            <span>${pct}%</span>
            <span>₹${remaining} left</span>
          </div>
        </div>`;
    }).join('');

    sidebar.innerHTML = `
      <div class="coach-sidebar-title">🎯 Your Goals</div>
      ${items}
      <a href="#goals" style="font-size:0.75rem; color:var(--accent-cyan-light); text-decoration:none; text-align:center; display:block; margin-top:0.5rem;">Manage goals →</a>
    `;
  } catch (_) {
    sidebar.innerHTML = '';
  }
};

// ── Init ──────────────────────────────────────────────────────────────────
export const initCoach = () => {
  // Global helper for legacy onclick in HTML (kept for compatibility)
  window.sendCoachSuggestion = (text) => sendMessage(text);

  // Keyboard: Enter to send (Shift+Enter = newline)
  inputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = inputField.value.trim();
      if (text) sendMessage(text);
    }
  });

  // Form submit
  messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = inputField.value.trim();
    if (text) sendMessage(text);
  });

  // Build chips + sidebar on init
  buildChips();
  buildGoalsSidebar();
};

// ── Refresh coach UI when navigated to (called from app.js) ───────────────
export const refreshCoach = () => {
  buildChips();
  buildGoalsSidebar();
};
