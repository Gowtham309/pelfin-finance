-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Expenses Table
CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    merchant TEXT NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    is_recurring INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date);

-- Budgets Table
CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    category TEXT NOT NULL, -- 'Overall' or specific category
    limit_amount REAL NOT NULL,
    month TEXT NOT NULL, -- Format: YYYY-MM
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, category, month)
);

-- Savings Goals Table
CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    target_amount REAL NOT NULL,
    current_amount REAL DEFAULT 0,
    target_date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL, -- 'budget_warning', 'goal_milestone', 'system'
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

-- ML Training Data Table (Naive Bayes user corrections)
CREATE TABLE IF NOT EXISTS ml_training_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    category TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User Settings Table (allowance-cycle budgeting)
CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    allowance_amount REAL DEFAULT 0,
    allowance_day INTEGER DEFAULT 1, -- Day of month the allowance arrives (1-31)
    allowance_sources TEXT, -- Comma-separated sources of allowance
    conditional_threshold REAL DEFAULT 500, -- Threshold above which unknown credits require confirmation
    fixed_expenses_estimate REAL DEFAULT 0, -- Estimated fixed expenses
    savings_goal REAL DEFAULT 0, -- Monthly savings goal
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Incomes Table
CREATE TABLE IF NOT EXISTS incomes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount REAL NOT NULL,
    source TEXT NOT NULL, -- E.g. Mom, Dad, Part-time job, Refund
    description TEXT,
    date TEXT NOT NULL, -- YYYY-MM-DD
    type TEXT NOT NULL, -- 'allowance', 'conditional', 'confirmed', 'other'
    is_confirmed INTEGER DEFAULT 1, -- 0 for pending, 1 for auto-approved or user-confirmed
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_incomes_user_date ON incomes(user_id, date);
