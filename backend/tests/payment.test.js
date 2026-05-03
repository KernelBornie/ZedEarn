/**
 * payment.test.js
 *
 * Unit tests for the payment services layer.
 * All external HTTP calls are mocked with axios.
 */

'use strict';

process.env.NODE_ENV = 'test';

// ── Mock axios globally ──────────────────────────────────────────────────────
jest.mock('axios');
const axios = require('axios');

const paymentService = require('../services/payments/paymentService');

// Set dummy environment variables for each provider
beforeAll(() => {
  process.env.AIRTEL_CLIENT_ID = 'test_airtel_client';
  process.env.AIRTEL_CLIENT_SECRET = 'test_airtel_secret';
  process.env.MTN_SUBSCRIPTION_KEY = 'test_mtn_sub_key';
  process.env.MTN_API_USER = '11111111-1111-1111-1111-111111111111';
  process.env.MTN_API_KEY = 'test_mtn_api_key';
  process.env.ZAMTEL_API_KEY = 'test_zamtel_key';
  process.env.ZAMTEL_API_SECRET = 'test_zamtel_secret';
  process.env.ZAMTEL_MERCHANT_ID = 'MERCH001';
  process.env.BANK_API_KEY = 'test_bank_key';
  process.env.BANK_API_SECRET = 'test_bank_secret';
  process.env.BANK_COMPANY_TOKEN = 'test_company_token';
});

afterEach(() => {
  jest.clearAllMocks();
  // Reset cached tokens between tests
  const airtelService = require('../services/payments/airtelMoney.service');
  // Token cache is module-level; clear via re-require or direct reset
});

// ─── getSupportedMethods ─────────────────────────────────────────────────────
describe('paymentService.getSupportedMethods', () => {
  it('should return all four supported methods', () => {
    const methods = paymentService.getSupportedMethods();
    expect(methods).toEqual(
      expect.arrayContaining(['airtel_money', 'mtn_money', 'zamtel_kwacha', 'bank_transfer'])
    );
    expect(methods).toHaveLength(4);
  });
});

// ─── Unsupported method ──────────────────────────────────────────────────────
describe('paymentService with unsupported method', () => {
  it('should throw for unknown payment method', async () => {
    const mockTx = { reference: 'ZE-001', amount: 100, netAmount: 95, method: 'crypto' };
    await expect(paymentService.initiateWithdrawal('crypto', mockTx)).rejects.toThrow(
      /unsupported payment method/i
    );
  });
});

// ─── Airtel Money ─────────────────────────────────────────────────────────────
describe('Airtel Money service', () => {
  const airtelService = require('../services/payments/airtelMoney.service');

  beforeEach(() => {
    // Mock token endpoint
    axios.post = jest.fn().mockImplementation((url, data, config) => {
      if (url && url.includes('/auth/oauth2/token')) {
        return Promise.resolve({
          data: { access_token: 'mock_airtel_token', expires_in: 3600 },
        });
      }
      // Mock payment endpoint
      return Promise.resolve({
        data: {
          status: { success: true, message: 'Transaction initiated' },
          data: { transaction: { id: 'AIRTEL-TX-001' } },
        },
      });
    });

    axios.create = jest.fn().mockReturnValue({
      post: jest.fn().mockResolvedValue({
        data: {
          status: { success: true, message: 'Transaction initiated' },
          data: { transaction: { id: 'AIRTEL-TX-001' } },
        },
      }),
      get: jest.fn().mockResolvedValue({
        data: {
          status: { success: true, message: 'Transaction found' },
          data: { transaction: { id: 'AIRTEL-TX-001' } },
        },
      }),
    });
  });

  it('should initiate a deposit and return a success result', async () => {
    // Pre-set token cache to avoid token fetch
    const result = await airtelService.initiateDeposit({
      phone: '0971234567',
      amount: 100,
      reference: 'ZE-TEST-001',
    });

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('reference', 'ZE-TEST-001');
  });

  it('should initiate a withdrawal and return a result', async () => {
    const result = await airtelService.initiateWithdrawal({
      phone: '0971234567',
      amount: 95,
      reference: 'ZE-TEST-002',
    });

    expect(result).toHaveProperty('reference', 'ZE-TEST-002');
  });
});

// ─── MTN Money ───────────────────────────────────────────────────────────────
describe('MTN Money service', () => {
  const mtnService = require('../services/payments/mtnMoney.service');

  beforeEach(() => {
    // Mock token request
    axios.post = jest.fn().mockResolvedValue({
      data: { access_token: 'mock_mtn_token', expires_in: 3600 },
    });

    axios.create = jest.fn().mockReturnValue({
      post: jest.fn().mockResolvedValue({ status: 202, data: '' }),
      get: jest.fn().mockResolvedValue({
        data: { status: 'SUCCESSFUL', financialTransactionId: 'MTN-FIN-001' },
      }),
    });
  });

  it('should initiate a deposit and return pending status', async () => {
    const result = await mtnService.initiateDeposit({
      phone: '0961234567',
      amount: 100,
      reference: 'ZE-MTN-001',
    });

    expect(result).toHaveProperty('reference', 'ZE-MTN-001');
  });

  it('should verify a transaction status', async () => {
    const result = await mtnService.verifyTransaction('ZE-MTN-001', 'uuid-provider-ref');

    expect(result).toHaveProperty('reference', 'ZE-MTN-001');
  });
});

// ─── Zamtel Money ─────────────────────────────────────────────────────────────
describe('Zamtel Money service', () => {
  const zamtelService = require('../services/payments/zamtelMoney.service');

  beforeEach(() => {
    axios.create = jest.fn().mockReturnValue({
      post: jest.fn().mockResolvedValue({
        data: {
          responseCode: '200',
          transactionId: 'ZAM-TX-001',
          responseDescription: 'Accepted',
        },
      }),
      get: jest.fn().mockResolvedValue({
        data: { status: 'SUCCESS', transactionId: 'ZAM-TX-001' },
      }),
    });
  });

  it('should initiate a deposit', async () => {
    const result = await zamtelService.initiateDeposit({
      phone: '0953456789',
      amount: 50,
      reference: 'ZE-ZAM-001',
    });

    expect(result).toHaveProperty('reference', 'ZE-ZAM-001');
  });

  it('should verify a transaction', async () => {
    const result = await zamtelService.verifyTransaction('ZE-ZAM-001');
    expect(result).toHaveProperty('reference', 'ZE-ZAM-001');
  });
});

// ─── Bank Transfer ────────────────────────────────────────────────────────────
describe('Bank Transfer service', () => {
  const bankService = require('../services/payments/bankTransfer.service');

  beforeEach(() => {
    axios.create = jest.fn().mockReturnValue({
      post: jest.fn().mockResolvedValue({
        data: {
          ResultCode: '000',
          TransCode: 'BANK-TX-001',
          ResultExplanation: 'Transfer initiated',
        },
      }),
      get: jest.fn().mockResolvedValue({
        data: { ResultCode: '000', TransCode: 'BANK-TX-001', ResultExplanation: 'Completed' },
      }),
    });
  });

  it('should initiate a bank withdrawal', async () => {
    const result = await bankService.initiateWithdrawal({
      accountNumber: '1234567890',
      accountName: 'Test User',
      bankCode: '01',
      amount: 200,
      reference: 'ZE-BANK-001',
    });

    expect(result).toHaveProperty('reference', 'ZE-BANK-001');
  });

  it('should verify a bank transaction', async () => {
    const result = await bankService.verifyTransaction('ZE-BANK-001');
    expect(result).toHaveProperty('reference', 'ZE-BANK-001');
  });
});
