process.env.DB_PATH = './test.sqlite';
process.env.NODE_ENV = 'test';

import request from 'supertest';
import fs from 'fs';
import app from '../backend/app.js';
import { initDb, dbRun } from '../backend/config/db.js';

describe('Auth Integration Tests', () => {
  beforeAll(async () => {
    if (fs.existsSync('./test.sqlite')) {
      try {
        fs.unlinkSync('./test.sqlite');
      } catch (err) {}
    }
    await initDb();
  });

  afterAll(async () => {
    if (fs.existsSync('./test.sqlite')) {
      try {
        fs.unlinkSync('./test.sqlite');
      } catch (err) {}
    }
  });

  beforeEach(async () => {
    await dbRun('DELETE FROM users');
  });

  it('should register a new user successfully', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@student.edu',
        password: 'password123'
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toEqual('test@student.edu');
    expect(res.header['set-cookie']).toBeDefined();
  });

  it('should reject registration with invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'invalidemail',
        password: 'password123'
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.success).toBe(false);
  });

  it('should reject login with incorrect credentials', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@student.edu',
        password: 'password123'
      });

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@student.edu',
        password: 'wrongpassword'
      });

    expect(res.statusCode).toEqual(401);
    expect(res.body.success).toBe(false);
  });

  it('should log in successfully with correct credentials', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@student.edu',
        password: 'password123'
      });

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@student.edu',
        password: 'password123'
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.header['set-cookie']).toBeDefined();
  });
});
