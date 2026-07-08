import { api } from './api.js';
import { setOfflineBannerVisible } from './notifications.js';

const chatHistoryDiv = document.getElementById('coach-chat-history');
const messageForm = document.getElementById('coach-message-form');
const inputField = document.getElementById('coach-msg-input');

let conversationHistory = [];

const appendMessage = (sender, text) => {
  const isUser = sender === 'user';
  
  const msgWrapper = document.createElement('div');
  msgWrapper.className = `chat-message ${isUser ? 'user' : 'coach'}`;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = isUser ? 'ME' : 'AI';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  
  // Format basic markdown style (bolding **text** and newlines)
  const formattedHtml = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\* (.*?)(?:\n|$)/g, '<li>$1</li>')
    // wrap sequences of <li> in <ul>
    .split('\n')
    .map(line => line.trim().startsWith('<li>') ? line : `<p>${line}</p>`)
    .join('');

  bubble.innerHTML = formattedHtml;

  msgWrapper.appendChild(avatar);
  msgWrapper.appendChild(bubble);
  
  chatHistoryDiv.appendChild(msgWrapper);
  chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight;
};

const showTypingIndicator = () => {
  const wrapper = document.createElement('div');
  wrapper.className = 'chat-message coach';
  wrapper.id = 'typing-indicator-wrapper';

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = 'AI';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;

  bubble.appendChild(indicator);
  wrapper.appendChild(avatar);
  wrapper.appendChild(bubble);

  chatHistoryDiv.appendChild(wrapper);
  chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight;
};

const hideTypingIndicator = () => {
  const indicator = document.getElementById('typing-indicator-wrapper');
  if (indicator) {
    indicator.remove();
  }
};

export const initCoach = () => {
  // Bind global helper for suggestions chips
  window.sendCoachSuggestion = (text) => {
    inputField.value = text;
    messageForm.dispatchEvent(new Event('submit'));
  };

  // Keyboard shortcut: submit on Enter (unless shift is pressed)
  inputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      messageForm.dispatchEvent(new Event('submit'));
    }
  });

  messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = inputField.value.trim();
    if (!text) return;

    inputField.value = '';
    appendMessage('user', text);
    showTypingIndicator();

    try {
      const response = await api.ai.coach(text, conversationHistory);
      
      hideTypingIndicator();
      appendMessage('coach', response.text);

      setOfflineBannerVisible(response.fallbackActive);

      // Save to local dialogue log (keep latest 10 messages)
      conversationHistory.push({ sender: 'user', text });
      conversationHistory.push({ sender: 'coach', text: response.text });
      if (conversationHistory.length > 10) {
        conversationHistory.shift();
        conversationHistory.shift();
      }
    } catch (err) {
      hideTypingIndicator();
      appendMessage('coach', `Sorry, I'm experiencing troubles replying right now: ${err.message}`);
    }
  });
};
