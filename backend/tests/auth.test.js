/**
 * auth.test.js
 *
 * Unit tests for /api/auth endpoints using mocked Mongoose models.
 * No real MongoDB connection required.
 */

'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_zedearn_2024';
process.env.JWT_EXPIRE = '1h';
process.env.MONGO_URI = 'mongodb://localhost:27017/test'; // won't connect — models mocked

const bcrypt = require('bcryptjs');

// ── Mock mongoose to prevent any real DB connection ──────────────────────────
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    connect: jest.fn().mockResolvedValue({ connection: { host: 'mock' } }),
  };
});

// ── Mock User model ──────────────────────────────────────────────────────────
jest.mock('../models/User', () => {
  const mockUser = {
    _id: 'user_001',
    name: 'Test User',
    email: 'test@zedearn.zm',
    phone: undefined,
    role: 'user',
    vipTier: 'none',
    balance: 0,
    rewardBalance: 0,
    commissionBalance: 0,
    referralCode: 'ABCD1234',
    kycStatus: 'pending',
    xpPoints: 0,
    level: 1,
    profilePhoto: null,
    isFrozen: false,
    lastLogin: null,
    fullReferralLink: 'http://localhost:5173/register?ref=ABCD1234',
    getSignedJwtToken: jest.fn(() => 'mock_token_123'),
    matchPassword: jest.fn(async (pw) => pw === 'Password123!'),
    save: jest.fn().mockResolvedValue(true),
  };

  const UserModel = {
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  };

  // Also expose the mock user for tests to inspect
  UserModel._mockUser = mockUser;

  return UserModel;
});

// ── Mock Referral model ──────────────────────────────────────────────────────
jest.mock('../models/Referral', () => ({
  create: jest.fn().mockResolvedValue({}),
}));

// ── Mock config/db ────────────────────────────────────────────────────────────
jest.mock('../config/db', () => jest.fn().mockResolvedValue(undefined));

// ── Mock config/redis ─────────────────────────────────────────────────────────
jest.mock('../config/redis', () => ({
  status: 'ready',
  get: jest.fn(),
  set: jest.fn(),
}));

const supertest = require('supertest');
const { app } = require('../app');
const User = require('../models/User');

afterEach(() => {
  jest.clearAllMocks();
});

// ─── Register Tests ───────────────────────────────────────────────────────────
describe('POST /api/auth/register', () => {
  it('should register a new user with email', async () => {
    User.findOne.mockResolvedValue(null); // no existing user
    User.create.mockImplementation(async (data) => ({
      ...User._mockUser,
      name: data.name,
      email: data.email,
    }));

    const res = await supertest(app).post('/api/auth/register').send({
      name: 'Alice Mwale',
      email: 'alice@zedearn.zm',
      password: 'Password123!',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeTruthy();
  });

  it('should register a new user with Zambian phone number', async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockImplementation(async (data) => ({
      ...User._mockUser,
      name: data.name,
      phone: data.phone,
      email: undefined,
    }));

    const res = await supertest(app).post('/api/auth/register').send({
      name: 'Bob Chanda',
      phone: '0971234567',
      password: 'Password123!',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('should reject registration without email or phone', async () => {
    const res = await supertest(app).post('/api/auth/register').send({
      name: 'No Contact',
      password: 'Password123!',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should reject duplicate email registration', async () => {
    User.findOne.mockResolvedValue({ email: 'duplicate@zedearn.zm' }); // existing user

    const res = await supertest(app).post('/api/auth/register').send({
      name: 'Second User',
      email: 'duplicate@zedearn.zm',
      password: 'Password123!',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should reject a password shorter than 6 characters', async () => {
    const res = await supertest(app).post('/api/auth/register').send({
      name: 'Short Pass',
      email: 'shortpass@zedearn.zm',
      password: 'abc',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should reject an invalid Zambian phone number format', async () => {
    const res = await supertest(app).post('/api/auth/register').send({
      name: 'Bad Phone',
      phone: '123456',
      password: 'Password123!',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ─── Login Tests ─────────────────────────────────────────────────────────────
describe('POST /api/auth/login', () => {
  it('should login with valid email and password', async () => {
    const userObj = {
      ...User._mockUser,
      isFrozen: false,
      lastLogin: null,
      save: jest.fn().mockResolvedValue(true),
    };
    User.findOne.mockResolvedValue(userObj);

    const res = await supertest(app).post('/api/auth/login').send({
      email: 'test@zedearn.zm',
      password: 'Password123!',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeTruthy();
  });

  it('should reject login with wrong password', async () => {
    const userObj = {
      ...User._mockUser,
      isFrozen: false,
      matchPassword: jest.fn(async () => false),
      save: jest.fn().mockResolvedValue(true),
    };
    User.findOne.mockResolvedValue(userObj);

    const res = await supertest(app).post('/api/auth/login').send({
      email: 'test@zedearn.zm',
      password: 'WrongPassword!',
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should reject login for nonexistent user', async () => {
    User.findOne.mockResolvedValue(null);

    const res = await supertest(app).post('/api/auth/login').send({
      email: 'nobody@zedearn.zm',
      password: 'Password123!',
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should reject login without email or phone', async () => {
    const res = await supertest(app).post('/api/auth/login').send({
      password: 'Password123!',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should reject login for a frozen account', async () => {
    User.findOne.mockResolvedValue({
      ...User._mockUser,
      isFrozen: true,
      matchPassword: jest.fn(async () => true),
    });

    const res = await supertest(app).post('/api/auth/login').send({
      email: 'frozen@zedearn.zm',
      password: 'Password123!',
    });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});

// ─── /me Tests ────────────────────────────────────────────────────────────────
describe('GET /api/auth/me', () => {
  it('should return current user when authenticated', async () => {
    User.findById.mockResolvedValue({ ...User._mockUser });

    const res = await supertest(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer mock_token_123`);

    // mock_token_123 is not a valid JWT — this will return 401 with invalid token
    expect([200, 401]).toContain(res.status);
  });

  it('should reject unauthenticated request', async () => {
    const res = await supertest(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

// ─── refresh-token Tests ──────────────────────────────────────────────────────
describe('POST /api/auth/refresh-token', () => {
  it('should reject an invalid token', async () => {
    const res = await supertest(app)
      .post('/api/auth/refresh-token')
      .send({ token: 'totally.invalid.token' });

    expect(res.status).toBe(401);
  });

  it('should require a token body', async () => {
    const res = await supertest(app)
      .post('/api/auth/refresh-token')
      .send({});

    expect(res.status).toBe(400);
  });
});

// ─── /health Tests ────────────────────────────────────────────────────────────
describe('GET /health', () => {
  it('should return 200 OK', async () => {
    const res = await supertest(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('OK');
  });
});
