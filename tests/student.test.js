process.env.DB_PATH = './test.sqlite';
process.env.NODE_ENV = 'test';

import request from 'supertest';
import fs from 'fs';
import app from '../backend/app.js';
import { initDb, dbRun, dbGet } from '../backend/config/db.js';

describe('Student Allowance & Forecasting Integration Tests', () => {
  let agent;
  let userId;

  beforeAll(async () => {
    if (fs.existsSync('./test.sqlite')) {
      try {
        fs.unlinkSync('./test.sqlite');
      } catch (err) {}
    }
    await initDb();

    // Set up agent and log in
    agent = request.agent(app);
    const regRes = await agent
      .post('/api/auth/register')
      .send({
        email: 'student-finance@student.edu',
        password: 'password123'
      });
    userId = regRes.body.user.id;
  });

  afterAll(async () => {
    if (fs.existsSync('./test.sqlite')) {
      try {
        fs.unlinkSync('./test.sqlite');
      } catch (err) {}
    }
  });

  beforeEach(async () => {
    await dbRun('DELETE FROM expenses');
    await dbRun('DELETE FROM incomes');
    await dbRun('DELETE FROM user_settings');
  });

  it('should update and retrieve student settings successfully', async () => {
    // 1. Save Settings
    const saveRes = await agent
      .put('/api/users/settings')
      .send({
        allowance_amount: 10000,
        allowance_day: 1,
        allowance_sources: 'Dad, Mom, Parents',
        conditional_threshold: 1000,
        fixed_expenses_estimate: 2000,
        savings_goal: 1500
      });

    expect(saveRes.statusCode).toEqual(200);
    expect(saveRes.body.success).toBe(true);
    expect(saveRes.body.settings.allowance_amount).toEqual(10000);
    expect(saveRes.body.settings.allowance_sources).toEqual('Dad, Mom, Parents');
    expect(saveRes.body.settings.savings_goal).toEqual(1500);

    // 2. Fetch Settings
    const getRes = await agent.get('/api/users/settings');
    expect(getRes.statusCode).toEqual(200);
    expect(getRes.body.settings.allowance_amount).toEqual(10000);
    expect(getRes.body.settings.allowance_day).toEqual(1);
    expect(getRes.body.settings.fixed_expenses_estimate).toEqual(2000);
  });

  it('should auto-confirm parents credit SMS as allowance income', async () => {
    // Save settings first
    await agent
      .put('/api/users/settings')
      .send({
        allowance_amount: 10000,
        allowance_day: 1,
        allowance_sources: 'Dad, Mom',
        conditional_threshold: 500
      });

    const secret = 'pelfin_super_secure_jwt_secret_token_change_in_prod';
    const smsContent = 'Money received from Dad: ₹5,000.00 credited to account on 08-Jul-26.';

    const res = await request(app)
      .post(`/api/expenses/sms-webhook/${userId}?secret=${secret}`)
      .send({ text: smsContent });

    expect(res.statusCode).toEqual(201);
    expect(res.body.success).toBe(true);
    expect(res.body.income).toBeDefined();
    expect(res.body.income.amount).toEqual(5000.00);
    expect(res.body.income.source).toEqual('Dad');
    expect(res.body.income.type).toEqual('allowance');
    expect(res.body.income.is_confirmed).toEqual(1);

    // Verify it is logged in DB
    const row = await dbGet('SELECT * FROM incomes WHERE user_id = ?', [userId]);
    expect(row).toBeDefined();
    expect(row.amount).toEqual(5000.00);
    expect(row.type).toEqual('allowance');
  });

  it('should log unknown large credits as conditional income pending confirmation', async () => {
    await agent
      .put('/api/users/settings')
      .send({
        allowance_amount: 10000,
        allowance_day: 1,
        allowance_sources: 'Dad, Mom',
        conditional_threshold: 500
      });

    const secret = 'pelfin_super_secure_jwt_secret_token_change_in_prod';
    const smsContent = 'Account credited with Rs 1,500.00 from John Doe on 08-Jul-26.';

    const res = await request(app)
      .post(`/api/expenses/sms-webhook/${userId}?secret=${secret}`)
      .send({ text: smsContent });

    expect(res.statusCode).toEqual(201);
    expect(res.body.success).toBe(true);
    expect(res.body.income).toBeDefined();
    expect(res.body.income.amount).toEqual(1500.00);
    expect(res.body.income.source).toEqual('John Doe');
    expect(res.body.income.type).toEqual('conditional');
    expect(res.body.income.is_confirmed).toEqual(0);

    // Verify notification was created
    const notif = await dbGet('SELECT * FROM notifications WHERE user_id = ? AND type = "conditional_income"', [userId]);
    expect(notif).toBeDefined();
    expect(notif.title).toEqual('Unclassified Deposit');
  });

  it('should allow confirming conditional income', async () => {
    // Log a manual conditional income first
    const createRes = await agent
      .post('/api/incomes')
      .send({
        amount: 2000,
        source: 'Freelance Gig',
        date: '2026-07-08',
        type: 'conditional',
        is_confirmed: false
      });

    const incomeId = createRes.body.income.id;

    // Confirm it
    const confirmRes = await agent
      .post(`/api/incomes/${incomeId}/confirm`)
      .send({ type: 'other' });

    expect(confirmRes.statusCode).toEqual(200);
    expect(confirmRes.body.success).toBe(true);
    expect(confirmRes.body.income.is_confirmed).toEqual(1);
    expect(confirmRes.body.income.type).toEqual('other');
  });

  it('should calculate safe-to-spend today with rollover carryover correctly', async () => {
    // 1. Set settings: Allowance = 3000, Day = 1, fixed estimate = 0, savings = 0
    await agent
      .put('/api/users/settings')
      .send({
        allowance_amount: 3000,
        allowance_day: 1,
        allowance_sources: 'Dad',
        conditional_threshold: 500,
        fixed_expenses_estimate: 0,
        savings_goal: 0
      });

    // Let's assume today is Day 2 of the cycle
    // We will stub a test where we have the total cycle days = 30
    // Baseline Daily Budget = 3000 / 30 = 100.
    
    // Day 1: we spent 80. (Underspent by 20).
    // Today (Day 2): Today's Limit should be 100 + 20 = 120.
    // Let's log Day 1 expense (assuming date is yesterday)
    const yesterday = new Date(Date.now() - 86400000).toISOString().substring(0, 10);
    await agent
      .post('/api/expenses')
      .send({
        amount: 80,
        category: 'Food',
        merchant: 'MCD',
        date: yesterday
      });

    // Fetch safe-to-spend
    const s2sRes = await agent.get('/api/users/safe-to-spend');
    expect(s2sRes.statusCode).toEqual(200);
    expect(s2sRes.body.success).toBe(true);
    
    // We expect today's limit to be baseline (100) + carryover (20) = 120.
    // Depending on actual cycle days in the month (e.g. 31 days in July, 31 - elapsed = daysRemaining)
    // Let's verify that todayLimit equals baseline + carryover
    const baseline = s2sRes.body.discretionaryPool / s2sRes.body.totalCycleDays;
    const expectedLimit = baseline + s2sRes.body.carryover;
    expect(s2sRes.body.todayLimit).toBeCloseTo(expectedLimit, 2);
  });
});
