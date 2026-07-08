process.env.DB_PATH = './test.sqlite';
process.env.NODE_ENV = 'test';

import request from 'supertest';
import fs from 'fs';
import app from '../backend/app.js';
import { initDb, dbRun } from '../backend/config/db.js';

describe('Budget Allocator Integration Tests', () => {
  let agent;

  beforeAll(async () => {
    if (fs.existsSync('./test.sqlite')) {
      try {
        fs.unlinkSync('./test.sqlite');
      } catch (err) {}
    }
    await initDb();

    agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({
        email: 'test-budget@student.edu',
        password: 'password123'
      });
  });

  afterAll(async () => {
    if (fs.existsSync('./test.sqlite')) {
      try {
        fs.unlinkSync('./test.sqlite');
      } catch (err) {}
    }
  });

  beforeEach(async () => {
    await dbRun('DELETE FROM budgets');
    await dbRun('DELETE FROM expenses');
    await dbRun('DELETE FROM notifications');
  });

  it('should upsert a category budget and fetch status allocations', async () => {
    // 1. Create/Upsert Food Budget
    const resUpsert = await agent
      .post('/api/budgets')
      .send({
        category: 'Food',
        limit_amount: 150.00,
        month: '2026-07'
      });

    expect(resUpsert.statusCode).toEqual(200);
    expect(resUpsert.body.success).toBe(true);
    expect(resUpsert.body.budget.limit_amount).toEqual(150.00);

    // 2. Fetch Budget Status
    const resStatus = await agent.get('/api/budgets/status?month=2026-07');
    expect(resStatus.statusCode).toEqual(200);
    expect(resStatus.body.status.length).toEqual(1);
    expect(resStatus.body.status[0].category).toEqual('Food');
    expect(resStatus.body.status[0].spent).toEqual(0);
    expect(resStatus.body.status[0].percent).toEqual(0);
  });

  it('should trigger warnings when expenses cross 80% and 100% thresholds', async () => {
    // Set a Food budget of $100 for current test month
    await agent
      .post('/api/budgets')
      .send({
        category: 'Food',
        limit_amount: 100.00,
        month: '2026-07'
      });

    // 1. Add Food expense of $85 (85% - crosses 80% threshold)
    await agent
      .post('/api/expenses')
      .send({
        amount: 85.00,
        category: 'Food',
        merchant: 'Starbucks',
        date: '2026-07-08'
      });

    // Query notifications
    const resAlerts80 = await agent.get('/api/notifications');
    expect(resAlerts80.statusCode).toEqual(200);
    expect(resAlerts80.body.notifications.length).toEqual(1);
    expect(resAlerts80.body.notifications[0].type).toEqual('budget_warning');
    expect(resAlerts80.body.notifications[0].title).toContain('Budget Warning');

    // 2. Add another Food expense of $20 ($105 spent total - crosses 100% threshold)
    await agent
      .post('/api/expenses')
      .send({
        amount: 20.00,
        category: 'Food',
        merchant: 'McDonalds',
        date: '2026-07-09'
      });

    const resAlerts100 = await agent.get('/api/notifications');
    // Should have both the warning and exceeded notification
    expect(resAlerts100.body.notifications.length).toEqual(2);
    const hasExceededAlert = resAlerts100.body.notifications.some(n => n.title.includes('Exceeded'));
    expect(hasExceededAlert).toBe(true);
  });
});
