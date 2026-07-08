import { api } from './api.js';

const bellBtn = document.getElementById('notification-bell');
const dropdown = document.getElementById('notifications-dropdown');
const listContainer = document.getElementById('notifications-list');
const badge = document.getElementById('bell-badge-indicator');
const clearAllBtn = document.getElementById('btn-clear-notifications');
const offlineBanner = document.getElementById('offline-banner');

let hasFallbackWarningBeenShown = false;

export const setOfflineBannerVisible = (visible) => {
  if (visible) {
    offlineBanner.classList.remove('hidden');
    hasFallbackWarningBeenShown = true;
  } else if (!hasFallbackWarningBeenShown) {
    // only hide if we haven't locked it on from an active fallback response
    offlineBanner.classList.add('hidden');
  }
};

export const fetchNotifications = async () => {
  try {
    const data = await api.notifications.list();
    const notifications = data.notifications || [];

    // Calculate unread count
    const unreadCount = notifications.filter(n => n.is_read === 0).length;
    if (unreadCount > 0) {
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }

    if (notifications.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align:center; color:var(--text-secondary); font-size:0.9rem; padding:1.5rem;">
          No notifications found.
        </div>
      `;
      return;
    }

    listContainer.innerHTML = '';
    notifications.forEach((item) => {
      const isUnread = item.is_read === 0;
      const card = document.createElement('div');
      
      card.style.background = isUnread ? 'rgba(157, 78, 221, 0.08)' : 'rgba(255, 255, 255, 0.01)';
      card.style.border = '1px solid rgba(255, 255, 255, 0.04)';
      card.style.padding = '0.75rem';
      card.style.borderRadius = '10px';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '0.25rem';
      card.style.position = 'relative';

      // Mark single notification read handler
      const titleSpan = document.createElement('span');
      titleSpan.style.fontWeight = '600';
      titleSpan.style.fontSize = '0.85rem';
      titleSpan.style.color = isUnread ? 'var(--text-primary)' : 'var(--text-secondary)';
      titleSpan.textContent = item.title;

      const msgSpan = document.createElement('span');
      msgSpan.style.fontSize = '0.8rem';
      msgSpan.style.color = 'var(--text-secondary)';
      msgSpan.textContent = item.message;

      card.appendChild(titleSpan);
      card.appendChild(msgSpan);

      // Action row for reading/deleting
      const actionsDiv = document.createElement('div');
      actionsDiv.style.display = 'flex';
      actionsDiv.style.justifyContent = 'space-between';
      actionsDiv.style.alignItems = 'center';
      actionsDiv.style.marginTop = '0.4rem';

      const timeSpan = document.createElement('span');
      timeSpan.style.fontSize = '0.7rem';
      timeSpan.style.color = 'var(--text-secondary)';
      timeSpan.textContent = new Date(item.created_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      actionsDiv.appendChild(timeSpan);

      const buttonsWrapper = document.createElement('div');
      buttonsWrapper.style.display = 'flex';
      buttonsWrapper.style.gap = '0.5rem';

      if (isUnread) {
        const readBtn = document.createElement('button');
        readBtn.style.background = 'transparent';
        readBtn.style.border = 'none';
        readBtn.style.color = 'var(--accent-cyan-light)';
        readBtn.style.fontSize = '0.75rem';
        readBtn.style.cursor = 'pointer';
        readBtn.textContent = 'Read';
        readBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await api.notifications.markRead(item.id);
          fetchNotifications();
        });
        buttonsWrapper.appendChild(readBtn);
      }

      const delBtn = document.createElement('button');
      delBtn.style.background = 'transparent';
      delBtn.style.border = 'none';
      delBtn.style.color = 'var(--accent-pink-light)';
      delBtn.style.fontSize = '0.75rem';
      delBtn.style.cursor = 'pointer';
      delBtn.textContent = 'Dismiss';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await api.notifications.delete(item.id);
        fetchNotifications();
      });
      buttonsWrapper.appendChild(delBtn);

      actionsDiv.appendChild(buttonsWrapper);
      card.appendChild(actionsDiv);

      listContainer.appendChild(card);
    });
  } catch (err) {
    console.error('Failed to load notifications:', err);
  }
};

export const initNotifications = () => {
  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
    if (!dropdown.classList.contains('hidden')) {
      fetchNotifications();
    }
  });

  // Hide dropdown on clicking anywhere else
  document.addEventListener('click', () => {
    dropdown.classList.add('hidden');
  });

  dropdown.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  clearAllBtn.addEventListener('click', async () => {
    try {
      await api.notifications.readAll();
      fetchNotifications();
    } catch (err) {
      console.error('Failed to clear notifications:', err);
    }
  });

  // Fetch initial notifications list
  fetchNotifications();
};
