// Client-side API fetch wrappers

const request = async (url, options = {}) => {
  const token = localStorage.getItem('pelfin_token');
  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };

  const config = {
    ...options,
    headers: options.body instanceof FormData ? options.headers : { ...defaultHeaders, ...options.headers }
  };

  // If running in Capacitor (Android App), point to the production backend
  // Otherwise keep it relative for web
  const baseUrl = window.Capacitor?.isNativePlatform() ? 'https://pelfin-finance.onrender.com' : '';
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;

  const response = await fetch(fullUrl, config);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Something went wrong.');
  }

  return data;
};

export const api = {
  // Auth API
  auth: {
    login: async (email, password) => {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (res.token) localStorage.setItem('pelfin_token', res.token);
      return res;
    },
    register: async (email, password) => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (res.token) localStorage.setItem('pelfin_token', res.token);
      return res;
    },
    logout: async () => {
      localStorage.removeItem('pelfin_token');
      return request('/api/auth/logout', { method: 'POST' });
    },
    me: () => request('/api/auth/me')
  },

  // Expenses API
  expenses: {
    list: (filters = {}) => {
      const params = new URLSearchParams(filters).toString();
      return request(`/api/expenses?${params}`);
    },
    create: (expenseData) => request('/api/expenses', {
      method: 'POST',
      body: JSON.stringify(expenseData)
    }),
    update: (id, expenseData) => request(`/api/expenses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(expenseData)
    }),
    delete: (id) => request(`/api/expenses/${id}`, { method: 'DELETE' }),
    importCSV: (formData) => request('/api/expenses/import-csv', {
      method: 'POST',
      body: formData
    }),
    ocrReceipt: (formData) => request('/api/expenses/ocr', {
      method: 'POST',
      body: formData
    }),
    parseSMS: (text) => request('/api/expenses/parse-sms', {
      method: 'POST',
      body: JSON.stringify({ text })
    })
  },

  // Incomes API
  incomes: {
    list: (filters = {}) => {
      const params = new URLSearchParams(filters).toString();
      return request(`/api/incomes?${params}`);
    },
    create: (incomeData) => request('/api/incomes', {
      method: 'POST',
      body: JSON.stringify(incomeData)
    }),
    update: (id, incomeData) => request(`/api/incomes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(incomeData)
    }),
    delete: (id) => request(`/api/incomes/${id}`, { method: 'DELETE' }),
    confirm: (id, confirmData) => request(`/api/incomes/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify(confirmData)
    })
  },

  // Budgets API
  budgets: {
    list: (month) => request(`/api/budgets?month=${month || ''}`),
    upsert: (budgetData) => request('/api/budgets', {
      method: 'POST',
      body: JSON.stringify(budgetData)
    }),
    status: (month) => request(`/api/budgets/status?month=${month || ''}`)
  },

  // Savings Goals API
  goals: {
    list: () => request('/api/goals'),
    create: (goalData) => request('/api/goals', {
      method: 'POST',
      body: JSON.stringify(goalData)
    }),
    deposit: (id, amount) => request(`/api/goals/${id}/deposit`, {
      method: 'PATCH',
      body: JSON.stringify({ amount })
    }),
    delete: (id) => request(`/api/goals/${id}`, { method: 'DELETE' })
  },

  // AI API
  ai: {
    parseNL: (text) => request('/api/ai/parse-nl', {
      method: 'POST',
      body: JSON.stringify({ text })
    }),
    coach: (message, history = []) => request('/api/ai/coach', {
      method: 'POST',
      body: JSON.stringify({ message, history })
    }),
    forecast: () => request('/api/ai/forecast')
  },

  // Notifications API
  notifications: {
    list: () => request('/api/notifications'),
    readAll: () => request('/api/notifications/read-all', { method: 'POST' }),
    markRead: (id) => request(`/api/notifications/${id}/read`, { method: 'PATCH' }),
    delete: (id) => request(`/api/notifications/${id}`, { method: 'DELETE' })
  },

  // User Settings + ML API
  users: {
    getSettings: () => request('/api/users/settings'),
    saveSettings: (data) => request('/api/users/settings', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    getSafeToSpend: () => request('/api/users/safe-to-spend'),
    mlClassify: (text) => request('/api/users/ml/classify', {
      method: 'POST',
      body: JSON.stringify({ text })
    }),
    mlCorrect: (text, category) => request('/api/users/ml/correct', {
      method: 'POST',
      body: JSON.stringify({ text, category })
    }),
    mlAccuracy: () => request('/api/users/ml/accuracy')
  }
};
