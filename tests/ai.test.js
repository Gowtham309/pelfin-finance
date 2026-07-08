process.env.DB_PATH = './test.sqlite';
process.env.NODE_ENV = 'test';

import request from 'supertest';
import fs from 'fs';
import app from '../backend/app.js';
import { initDb, dbRun } from '../backend/config/db.js';
import { parseNLInput, generateCoachResponse, getSpendingForecast } from '../backend/services/ai.service.js';

describe('AI & Fallback Engine Tests', () => {
  let agent;
  let userId;

  beforeAll(async () => {
    if (fs.existsSync('./test.sqlite')) {
      try {
        fs.unlinkSync('./test.sqlite');
      } catch (err) {}
    }
    await initDb();

    agent = request.agent(app);
    const regRes = await agent
      .post('/api/auth/register')
      .send({
        email: 'test-ai@student.edu',
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

  describe('Heuristic NL Parser Fallback', () => {
    it('should parse simple transactions containing amounts and merchants offline', async () => {
      const text = 'I spent $12.50 on pizza at Starbucks yesterday';
      const parsed = await parseNLInput(text);

      expect(parsed.amount).toEqual(12.50);
      expect(parsed.category).toEqual('Food');
      expect(parsed.merchant).toEqual('Starbucks');
      expect(parsed.fallbackActive).toBe(true); // runs fallback in tests since key is missing
      
      const yesterday = new Date(Date.now() - 86400000).toISOString().substring(0, 10);
      expect(parsed.date).toEqual(yesterday);
    });

    it('should fall back to Miscellaneous category if keywords are unknown', async () => {
      const text = 'Spent 45 on something else';
      const parsed = await parseNLInput(text);

      expect(parsed.amount).toEqual(45.00);
      expect(parsed.category).toEqual('Miscellaneous');
      expect(parsed.merchant).toEqual('Merchant');
    });
  });

  describe('Heuristic AI Coach Fallback', () => {
    it('should return budget tips when message mentions budgeting', async () => {
      const res = await generateCoachResponse(userId, 'Can you help me setup a budget?');
      expect(res.text).toContain('50/30/20 Rule');
      expect(res.fallbackActive).toBe(true);
    });

    it('should return savings advice when message mentions saving goals', async () => {
      const res = await generateCoachResponse(userId, 'I want to save money');
      expect(res.text.toLowerCase()).toContain('emergency fund');
      expect(res.fallbackActive).toBe(true);
    });
  });

  describe('Forecasting Fallback', () => {
    it('should compile running category averages for forecasting output', async () => {
      // Seed some past month transactions
      // To bypass current month, set date to last month
      const lastMonthDate = new Date();
      lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
      const lastMonthStr = lastMonthDate.toISOString().substring(0, 10);

      await dbRun(
        `INSERT INTO expenses (id, user_id, amount, category, merchant, date) 
         VALUES ('e-1', ?, 50.00, 'Food', 'Store', ?), ('e-2', ?, 20.00, 'Transport', 'Uber', ?)`,
        [userId, lastMonthStr, userId, lastMonthStr]
      );

      const forecast = await getSpendingForecast(userId);
      expect(forecast.predictedTotal).toBeGreaterThan(0);
      
      const foodPred = forecast.categoryPredictions.find(p => p.category === 'Food');
      expect(foodPred.amount).toBeCloseTo(52.50, 1); // 50 * 1.05 = 52.50
    });
  });
});
