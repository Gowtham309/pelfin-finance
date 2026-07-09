import { api } from './api.js';
import { loadDashboard } from './dashboard.js';
import { initExpenses, loadExpenses } from './expenses.js';
import { initBudgets, loadBudgets } from './budgets.js';
import { initGoals, loadGoals } from './goals.js';
import { initCoach, refreshCoach } from './coach.js';
import { initNotifications } from './notifications.js';
import { initSettings, loadSettings } from './settings.js';

// DOM Shell elements
const authView = document.getElementById('auth-view');
const appView = document.getElementById('app-view');
const displayEmail = document.getElementById('user-display-email');
const logoutBtn = document.getElementById('btn-logout-action');
const viewTitle = document.getElementById('view-title');

// Auth Form elements
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginTab = document.getElementById('tab-login');
const regTab = document.getElementById('tab-register');
const authError = document.getElementById('auth-error-msg');
const authSuccess = document.getElementById('auth-success-msg');

let hasInitialized = false;

// SPA Router
const handleRoute = () => {
  const hash = window.location.hash || '#dashboard';
  
  // Hide all panels
  document.querySelectorAll('.spa-panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
  document.querySelectorAll('.mobile-nav-item').forEach(a => a.classList.remove('active'));

  // Route mapping matching targets
  const target = hash.substring(1);
  const targetPanel = document.getElementById(`panel-${target}`);
  const navLi = document.querySelector(`.nav-links li[data-target="${target}"]`);
  const mobileNavA = document.querySelector(`.mobile-nav-item[data-target="${target}"]`);

  if (targetPanel) {
    targetPanel.classList.remove('hidden');
    viewTitle.textContent = target.charAt(0).toUpperCase() + target.slice(1).replace('-', ' ');
    if (navLi) navLi.classList.add('active');
    if (mobileNavA) mobileNavA.classList.add('active');

    // Run panel-specific data reloads
    if (target === 'dashboard') loadDashboard();
    if (target === 'expenses') loadExpenses();
    if (target === 'budgets') loadBudgets();
    if (target === 'goals') loadGoals();
    if (target === 'coach') refreshCoach();
    if (target === 'settings') loadSettings();
  }
};

const showAuthScreen = () => {
  authView.classList.remove('hidden');
  appView.classList.add('hidden');
};

const showAppScreen = (user) => {
  authView.classList.add('hidden');
  appView.classList.remove('hidden');
  displayEmail.textContent = user.email;

  if (!hasInitialized) {
    // Run initialization bindings once
    initNotifications();
    initExpenses();
    initBudgets();
    initGoals();
    initCoach();
    initSettings();
    hasInitialized = true;
  }

  // Setup router bindings
  window.addEventListener('hashchange', handleRoute);
  
  // Navigate to default or current view
  if (!window.location.hash) {
    window.location.hash = '#dashboard';
  } else {
    handleRoute();
  }
};

// Check active session
const checkSession = async () => {
  try {
    const data = await api.auth.me();
    if (data.authenticated) {
      showAppScreen(data.user);
    } else {
      showAuthScreen();
    }
  } catch (err) {
    showAuthScreen();
  }
};

// Toggle Auth Tabs
const clearAlerts = () => {
  authError.classList.add('hidden');
  authSuccess.classList.add('hidden');
};

loginTab.addEventListener('click', () => {
  loginTab.classList.add('active');
  regTab.classList.remove('active');
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
  clearAlerts();
});

regTab.addEventListener('click', () => {
  regTab.classList.add('active');
  loginTab.classList.remove('active');
  registerForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
  clearAlerts();
});

// Auth form submissions
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlerts();
  const email = document.getElementById('login-email').value;
  const pass = document.getElementById('login-password').value;

  try {
    const res = await api.auth.login(email, pass);
    if (res.success) {
      showAppScreen(res.user);
    }
  } catch (err) {
    authError.textContent = err.message || 'Login failed.';
    authError.classList.remove('hidden');
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlerts();
  const email = document.getElementById('register-email').value;
  const pass = document.getElementById('register-password').value;

  try {
    const res = await api.auth.register(email, pass);
    if (res.success) {
      authSuccess.textContent = 'Account created successfully! Logging you in...';
      authSuccess.classList.remove('hidden');
      setTimeout(() => {
        showAppScreen(res.user);
      }, 1500);
    }
  } catch (err) {
    authError.textContent = err.message || 'Registration failed.';
    authError.classList.remove('hidden');
  }
});

// Logout action
logoutBtn.addEventListener('click', async () => {
  try {
    await api.auth.logout();
    window.location.hash = '';
    window.removeEventListener('hashchange', handleRoute);
    hasInitialized = false;
    showAuthScreen();
  } catch (err) {
    alert('Logout failed.');
  }
});

// Boot application
checkSession();

// Register PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.log('Service Worker registered successfully.'))
      .catch(err => console.warn('Service Worker registration failed:', err));
  });
}
