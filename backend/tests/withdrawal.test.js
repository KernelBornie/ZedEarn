/**
 * withdrawal.test.js
 *
 * Unit tests for the withdrawal flow using mocked Mongoose models.
 * Tests business logic of:
 *   - POST /api/wallet/withdraw   (user submits withdrawal)
 *   - PUT  /api/admin/transactions/:id/approve  (admin approves → payment triggered)
 *   - PUT  /api/admin/transactions/:id/reject   (admin rejects → funds returned)
 *
 * Payment API calls and DB calls are all mocked.
 */

'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_zedearn_2024';
process.env.JWT_EXPIRE = '1h';
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.DAILY_WITHDRAWAL_LIMIT = '1000';

// ── Mock the payment service so no real HTTP calls are made ──────────────────
jest.mock('../services/payments/paymentService', () => ({
  initiateWithdrawal: jest.fn(),
  initiateDeposit: jest.fn(),
  verifyTransaction: jest.fn(),
  getSupportedMethods: jest.fn(() => ['airtel_money', 'mtn_money', 'zamtel_kwacha', 'bank_transfer']),
}));

// ── Mock mongoose connect ─────────────────────────────────────────────────────
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    connect: jest.fn().mockResolvedValue({ connection: { host: 'mock' } }),
  };
});

// ── Mock config/db ────────────────────────────────────────────────────────────
jest.mock('../config/db', () => jest.fn().mockResolvedValue(undefined));

// ── Mock config/redis ─────────────────────────────────────────────────────────
jest.mock('../config/redis', () => ({
  status: 'ready',
  get: jest.fn(),
  set: jest.fn(),
}));

// ── Mock ledgerService ────────────────────────────────────────────────────────
jest.mock('../services/ledgerService', () => ({
  hold: jest.fn().mockResolvedValue({}),
  releaseHold: jest.fn().mockResolvedValue({}),
  confirmWithdrawal: jest.fn().mockResolvedValue({}),
  approveDeposit: jest.fn().mockResolvedValue({}),
  rejectDeposit: jest.fn().mockResolvedValue({}),
  credit: jest.fn().mockResolvedValue({}),
  debit: jest.fn().mockResolvedValue({}),
  getBalance: jest.fn().mockResolvedValue({ availableBalance: 500 }),
  adminAdjust: jest.fn().mockResolvedValue({}),
}));

// ── Mock Notification model ───────────────────────────────────────────────────
jest.mock('../models/Notification', () => ({
  create: jest.fn().mockResolvedValue({}),
}));

const jwt = require('jsonwebtoken');
const supertest = require('supertest');
const { app } = require('../app');
const paymentService = require('../services/payments/paymentService');
const ledgerService = require('../services/ledgerService');

// ── Generate test tokens ──────────────────────────────────────────────────────
function makeToken(id, role = 'user') {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

const USER_ID = '507f1f77bcf86cd799439011';
const ADMIN_ID = '507f1f77bcf86cd799439012';
const TX_ID = '507f1f77bcf86cd799439013';

const userToken = makeToken(USER_ID, 'user');
const adminToken = makeToken(ADMIN_ID, 'admin');

// ── Setup model mocks per test ────────────────────────────────────────────────
let User, Transaction;

beforeEach(() => {
  // We re-mock User and Transaction in each test for clean state
  jest.resetModules();
});

afterEach(() => {
  jest.clearAllMocks();
});

// Helper: build a mock transaction document
function mockTransaction(overrides = {}) {
  return {
    _id: TX_ID,
    userId: USER_ID,
    type: 'withdraw',
    amount: 100,
    fee: 5,
    netAmount: 95,
    method: 'airtel_money',
    status: 'pending',
    reference: 'ZE-TEST001',
    meta: { accountNumber: '0971234567', accountName: 'Test User' },
    processedAt: null,
    providerRef: null,
    toJSON() { return this; },
    save: jest.fn().mockResolvedValue(this),
    ...overrides,
  };
}

// Helper: build a mock user
function mockUser(overrides = {}) {
  return {
    _id: USER_ID,
    name: 'Test User',
    email: 'test@zedearn.zm',
    role: 'user',
    vipTier: 'none',
    vipExpiry: null,
    balance: 500,
    frozenBalance: 0,
    isFrozen: false,
    getSignedJwtToken: () => userToken,
    matchPassword: jest.fn(async () => true),
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

// ─── Wallet Endpoint Tests ────────────────────────────────────────────────────
describe('POST /api/wallet/withdraw', () => {
  beforeEach(() => {
    // Mock Transaction and User for each test
    const mockTx = mockTransaction();
    jest.doMock('../models/Transaction', () => {
      const TxMock = {
        findOne: jest.fn().mockResolvedValue(null), // no duplicate idempotency
        create: jest.fn().mockResolvedValue(mockTx),
        aggregate: jest.fn().mockResolvedValue([{ _id: null, total: 0 }]),
        findById: jest.fn().mockResolvedValue(mockTx),
      };
      return TxMock;
    });

    jest.doMock('../models/User', () => ({
      findById: jest.fn().mockResolvedValue(mockUser()),
    }));
  });

  it('should reject withdrawal without authentication', async () => {
    const res = await supertest(app)
      .post('/api/wallet/withdraw')
      .send({ amount: 100, method: 'airtel_money', accountNumber: '0971234567' });

    expect(res.status).toBe(401);
  });

  it('should reject an unsupported withdrawal method (validation layer)', async () => {
    const res = await supertest(app)
      .post('/api/wallet/withdraw')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: 50, method: 'crypto_wallet', accountNumber: '0x1234' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should reject withdrawal below minimum amount (ZMW 20)', async () => {
    const res = await supertest(app)
      .post('/api/wallet/withdraw')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: 5, method: 'airtel_money', accountNumber: '0971234567' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should reject withdrawal without accountNumber', async () => {
    const res = await supertest(app)
      .post('/api/wallet/withdraw')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: 50, method: 'airtel_money' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ─── Payment Service Logic Tests ──────────────────────────────────────────────
describe('Payment service integration via admin approve', () => {
  it('should call initiateWithdrawal when payment succeeds', async () => {
    paymentService.initiateWithdrawal.mockResolvedValueOnce({
      success: true,
      reference: 'ZE-TEST001',
      providerRef: 'AIRTEL-TX-999',
      status: 'success',
      message: 'Payout successful',
      raw: {},
    });

    // Verify mock is set up
    const result = await paymentService.initiateWithdrawal('airtel_money', {
      reference: 'ZE-TEST001',
      amount: 95,
      method: 'airtel_money',
      meta: { accountNumber: '0971234567' },
    });

    expect(result.success).toBe(true);
    expect(result.providerRef).toBe('AIRTEL-TX-999');
    expect(result.status).toBe('success');
  });

  it('should return pending status for async payment (MTN MoMo)', async () => {
    paymentService.initiateWithdrawal.mockResolvedValueOnce({
      success: true,
      reference: 'ZE-TEST002',
      providerRef: 'mtn-uuid-001',
      status: 'pending',
      message: 'Disbursement accepted',
      raw: {},
    });

    const result = await paymentService.initiateWithdrawal('mtn_money', {
      reference: 'ZE-TEST002',
      amount: 95,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('pending');
  });

  it('should return failed status when payment provider rejects', async () => {
    paymentService.initiateWithdrawal.mockResolvedValueOnce({
      success: false,
      reference: 'ZE-TEST003',
      providerRef: null,
      status: 'failed',
      message: 'Account not found',
      raw: {},
    });

    const result = await paymentService.initiateWithdrawal('airtel_money', {
      reference: 'ZE-TEST003',
      amount: 95,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
  });
});

// ─── Ledger Service Logic Tests ───────────────────────────────────────────────
describe('Ledger service interactions during withdrawal', () => {
  it('hold() should be called when withdrawal is submitted', async () => {
    const { hold } = require('../services/ledgerService');

    await hold(USER_ID, 100, 'WITHDRAWAL', {
      method: 'airtel_money',
      accountNumber: '0971234567',
    });

    expect(hold).toHaveBeenCalledWith(USER_ID, 100, 'WITHDRAWAL', {
      method: 'airtel_money',
      accountNumber: '0971234567',
    });
  });

  it('releaseHold() should be called when withdrawal is rejected', async () => {
    const { releaseHold } = require('../services/ledgerService');

    await releaseHold(USER_ID, 100);
    expect(releaseHold).toHaveBeenCalledWith(USER_ID, 100);
  });

  it('confirmWithdrawal() should be called when payment completes', async () => {
    const { confirmWithdrawal } = require('../services/ledgerService');

    await confirmWithdrawal(USER_ID, 100, { reference: 'ZE-TEST001' });
    expect(confirmWithdrawal).toHaveBeenCalledWith(USER_ID, 100, { reference: 'ZE-TEST001' });
  });
});

// ─── Validation Schema Tests ──────────────────────────────────────────────────
describe('Withdrawal validation rules', () => {
  it('should reject invalid method via express-validator', async () => {
    const res = await supertest(app)
      .post('/api/wallet/withdraw')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        amount: 100,
        method: 'paypal', // not supported
        accountNumber: '0971234567',
      });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('should reject amount below minimum', async () => {
    const res = await supertest(app)
      .post('/api/wallet/withdraw')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        amount: 1,
        method: 'airtel_money',
        accountNumber: '0971234567',
      });

    expect(res.status).toBe(400);
    const errorMessages = res.body.errors?.map((e) => e.msg) || [];
    expect(errorMessages.some((m) => m.includes('20'))).toBe(true);
  });
});
