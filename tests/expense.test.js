process.env.DB_PATH = './test.sqlite';
process.env.NODE_ENV = 'test';

import request from 'supertest';
import fs from 'fs';
import app from '../backend/app.js';
import { initDb, dbRun } from '../backend/config/db.js';

describe('Expenses API Integration Tests', () => {
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
        email: 'test-expense@student.edu',
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
  });

  it('should create a manual expense and return the transaction details', async () => {
    const res = await agent
      .post('/api/expenses')
      .send({
        amount: 15.50,
        category: 'Food',
        merchant: 'Starbucks',
        description: 'Mocha latte',
        date: '2026-07-08'
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.success).toBe(true);
    expect(res.body.expense.amount).toEqual(15.50);
    expect(res.body.expense.merchant).toEqual('Starbucks');
  });

  it('should retrieve a list of expenses with filters', async () => {
    // Insert two expenses
    await agent.post('/api/expenses').send({ amount: 10, category: 'Food', merchant: 'MCD', date: '2026-07-08' });
    await agent.post('/api/expenses').send({ amount: 20, category: 'Transport', merchant: 'Uber', date: '2026-07-08' });

    const res = await agent.get('/api/expenses?category=Food');

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.expenses.length).toEqual(1);
    expect(res.body.expenses[0].category).toEqual('Food');
    expect(res.body.expenses[0].amount).toEqual(10);
  });

  it('should update an existing expense', async () => {
    const createRes = await agent.post('/api/expenses').send({
      amount: 10,
      category: 'Food',
      merchant: 'MCD',
      date: '2026-07-08'
    });

    const expenseId = createRes.body.expense.id;

    const res = await agent
      .put(`/api/expenses/${expenseId}`)
      .send({
        amount: 12.50,
        merchant: 'McDonalds'
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.expense.amount).toEqual(12.50);
    expect(res.body.expense.merchant).toEqual('McDonalds');
  });

  it('should delete an expense', async () => {
    const createRes = await agent.post('/api/expenses').send({
      amount: 10,
      category: 'Food',
      merchant: 'MCD',
      date: '2026-07-08'
    });

    const expenseId = createRes.body.expense.id;

    const deleteRes = await agent.delete(`/api/expenses/${expenseId}`);
    expect(deleteRes.statusCode).toEqual(200);

    const listRes = await agent.get('/api/expenses');
    expect(listRes.body.expenses.length).toEqual(0);
  });

  it('should import banking transactions via CSV text format', async () => {
    const csvContent = `Date,Amount,Merchant,Category,Description\n2026-07-08,-8.50,Burger King,Food,lunch\n2026-07-08,-15.00,Uber,Transport,ride`;

    const res = await agent
      .post('/api/expenses/import-csv')
      .send({ csvText: csvContent });

    expect(res.statusCode).toEqual(201);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toEqual(2);
    expect(res.body.expenses[0].merchant).toEqual('Burger King');
    expect(res.body.expenses[1].merchant).toEqual('Uber');
  });

  it('should auto-log incoming SMS via webhook with valid secret', async () => {
    const secret = 'pelfin_super_secure_jwt_secret_token_change_in_prod';
    const smsContent = 'Dear SBI User, A/c *4321 debited by Rs.150.00 on 08-Jul-26 at Starbucks.';

    const res = await request(app)
      .post(`/api/expenses/sms-webhook/${userId}?secret=${secret}`)
      .send({ text: smsContent });

    expect(res.statusCode).toEqual(201);
    expect(res.body.success).toBe(true);
    expect(res.body.expense.amount).toEqual(150.00);
    expect(res.body.expense.merchant).toEqual('Starbucks');
    expect(res.body.expense.category).toEqual('Food');
  });

  it('should reject SMS webhook auto-logging with invalid secret', async () => {
    const smsContent = 'Sent Rs 250.00 to Haldirams on 08/07/2026.';
    const res = await request(app)
      .post(`/api/expenses/sms-webhook/${userId}?secret=wrongsecret`)
      .send({ text: smsContent });

    expect(res.statusCode).toEqual(401);
    expect(res.body.success).toBe(false);
  });
});
