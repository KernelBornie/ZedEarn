/**
 * zamtelMoney.service.js
 *
 * Zamtel Kwacha (Zamtel Mobile Money) payment service.
 *
 * Zamtel does not publish a standard REST API; integrations are typically
 * done through a licensed aggregator/payment gateway (e.g. Kazang, Union54,
 * or a direct Zamtel integration partner). This service wraps the aggregator
 * HTTP API pattern commonly used in Zambia.
 *
 * Required environment variables:
 *   ZAMTEL_API_KEY         - API key from your aggregator
 *   ZAMTEL_API_SECRET      - API secret / signing key
 *   ZAMTEL_BASE_URL        - Aggregator base URL
 *   ZAMTEL_MERCHANT_ID     - Your merchant identifier
 *   ZAMTEL_CURRENCY        - Currency (default: ZMW)
 *
 * Each public method returns a normalized PaymentResult:
 *   { success, reference, providerRef, status, message, raw }
 */

'use strict';

const axios = require('axios');
const crypto = require('crypto');
const logger = require('../../utils/logger');

const BASE_URL = process.env.ZAMTEL_BASE_URL || 'https://api.zamtel.zm/mobile-money/v1';
const CURRENCY = process.env.ZAMTEL_CURRENCY || 'ZMW';

/**
 * Generate HMAC-SHA256 request signature.
 * Many Zambian aggregators use HMAC signing for request authentication.
 */
function _sign(payload) {
  const secret = process.env.ZAMTEL_API_SECRET;
  if (!secret) throw new Error('ZAMTEL_API_SECRET must be set');
  return crypto
    .createHmac('sha256', secret)
    .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
    .digest('hex');
}

/**
 * Build an authorized Axios instance.
 */
function _client() {
  const apiKey = process.env.ZAMTEL_API_KEY;
  const merchantId = process.env.ZAMTEL_MERCHANT_ID;

  if (!apiKey || !merchantId) {
    throw new Error('ZAMTEL_API_KEY and ZAMTEL_MERCHANT_ID must be set');
  }

  return axios.create({
    baseURL: BASE_URL,
    headers: {
      'X-Api-Key': apiKey,
      'X-Merchant-Id': merchantId,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    timeout: 30_000,
  });
}

/**
 * Retry wrapper.
 */
async function _withRetry(fn, maxAttempts = 3, delayMs = 1000) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isTransient =
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT' ||
        (err.response && err.response.status >= 500);
      if (!isTransient || attempt === maxAttempts) break;
      logger.warn(`[ZamtelMoney] Attempt ${attempt} failed, retrying…`, { error: err.message });
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
  throw lastErr;
}

/**
 * Normalize aggregator response → internal PaymentResult.
 * Adjust field names to match your specific aggregator's response format.
 */
function _normalize(raw, reference) {
  // Common response shapes: { responseCode: '200', transactionId: '...', status: 'SUCCESS'|'FAILED' }
  const success =
    raw?.responseCode === '200' ||
    raw?.status === 'SUCCESS' ||
    raw?.status === 'APPROVED';

  return {
    success,
    reference,
    providerRef: raw?.transactionId || raw?.providerTransactionId || null,
    status: success ? 'success' : raw?.status === 'PENDING' ? 'pending' : 'failed',
    message: raw?.responseDescription || raw?.message || (success ? 'OK' : 'Failed'),
    raw,
  };
}

// ─── Public Methods ─────────────────────────────────────────────────────────

/**
 * Initiate a deposit (pull funds from subscriber wallet).
 *
 * @param {object} params
 * @param {string} params.phone
 * @param {number} params.amount
 * @param {string} params.reference
 * @param {string} [params.description]
 * @returns {Promise<PaymentResult>}
 */
async function initiateDeposit({ phone, amount, reference, description = 'ZedEarn Deposit' }) {
  logger.info('[ZamtelMoney] initiateDeposit', { phone, amount, reference });

  return _withRetry(async () => {
    const payload = {
      transactionRef: reference,
      amount: String(amount),
      currency: CURRENCY,
      msisdn: phone,
      narration: description,
      type: 'DEBIT', // pull from customer
    };
    const signature = _sign(payload);

    let raw;
    try {
      const client = _client();
      const resp = await client.post('/transactions/initiate', {
        ...payload,
        signature,
      });
      raw = resp.data;
    } catch (err) {
      raw = err.response?.data || { status: 'FAILED', message: err.message };
      logger.error('[ZamtelMoney] initiateDeposit error', { error: err.message, reference });
    }

    logger.info('[ZamtelMoney] initiateDeposit response', { reference, raw });
    return _normalize(raw, reference);
  });
}

/**
 * Initiate a withdrawal (push funds to subscriber wallet).
 *
 * @param {object} params
 * @param {string} params.phone
 * @param {number} params.amount
 * @param {string} params.reference
 * @param {string} [params.description]
 * @returns {Promise<PaymentResult>}
 */
async function initiateWithdrawal({ phone, amount, reference, description = 'ZedEarn Payout' }) {
  logger.info('[ZamtelMoney] initiateWithdrawal', { phone, amount, reference });

  return _withRetry(async () => {
    const payload = {
      transactionRef: reference,
      amount: String(amount),
      currency: CURRENCY,
      msisdn: phone,
      narration: description,
      type: 'CREDIT', // push to customer
    };
    const signature = _sign(payload);

    let raw;
    try {
      const client = _client();
      const resp = await client.post('/transactions/initiate', {
        ...payload,
        signature,
      });
      raw = resp.data;
    } catch (err) {
      raw = err.response?.data || { status: 'FAILED', message: err.message };
      logger.error('[ZamtelMoney] initiateWithdrawal error', { error: err.message, reference });
    }

    logger.info('[ZamtelMoney] initiateWithdrawal response', { reference, raw });
    return _normalize(raw, reference);
  });
}

/**
 * Verify the status of a transaction.
 *
 * @param {string} reference - Internal reference
 * @returns {Promise<PaymentResult>}
 */
async function verifyTransaction(reference) {
  logger.info('[ZamtelMoney] verifyTransaction', { reference });

  return _withRetry(async () => {
    let raw;
    try {
      const client = _client();
      const resp = await client.get(`/transactions/${reference}/status`);
      raw = resp.data;
    } catch (err) {
      raw = err.response?.data || { status: 'FAILED', message: err.message };
      logger.error('[ZamtelMoney] verifyTransaction error', { error: err.message, reference });
    }

    logger.info('[ZamtelMoney] verifyTransaction response', { reference, raw });
    return _normalize(raw, reference);
  });
}

module.exports = { initiateDeposit, initiateWithdrawal, verifyTransaction };
