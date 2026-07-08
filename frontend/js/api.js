// Client-side API fetch wrappers

const request = async (url, options = {}) => {
  const defaultHeaders = {
    'Content-Type': 'application/json'
  };

  const config = {
    ...options,
    headers: options.body instanceof FormData ? options.headers : { ...defaultHeaders, ...options.headers }
  };

  const response = await fetch(url, config);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Something went wrong.');
  }

  return data;
};

export const api = {
  // Auth API
  auth: {
    register: (email, password) => request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),
    login: (email, password) => request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),
    logout: () => request('/api/auth/logout', { method: 'POST' }),
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
  }
};
