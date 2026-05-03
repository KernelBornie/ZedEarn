/**
 * airtelMoney.service.js
 *
 * Airtel Money Zambia payment service.
 *
 * API Reference: Airtel Africa Open API (https://developers.airtel.africa/)
 *
 * Required environment variables:
 *   AIRTEL_CLIENT_ID       - OAuth2 client ID
 *   AIRTEL_CLIENT_SECRET   - OAuth2 client secret
 *   AIRTEL_BASE_URL        - API base URL (default: https://openapi.airtel.africa)
 *   AIRTEL_COUNTRY         - Country code (default: ZM)
 *   AIRTEL_CURRENCY        - Currency code (default: ZMW)
 *
 * Each public method returns a normalized PaymentResult:
 *   { success, reference, providerRef, status, message, raw }
 */

'use strict';

const axios = require('axios');
const logger = require('../../utils/logger');

const BASE_URL = process.env.AIRTEL_BASE_URL || 'https://openapi.airtel.africa';
const COUNTRY = process.env.AIRTEL_COUNTRY || 'ZM';
const CURRENCY = process.env.AIRTEL_CURRENCY || 'ZMW';

// In-memory token cache
let _tokenCache = { token: null, expiresAt: 0 };

/**
 * Obtain (and cache) a valid OAuth2 access token.
 * @returns {Promise<string>}
 */
async function _getAccessToken() {
  const now = Date.now();
  if (_tokenCache.token && now < _tokenCache.expiresAt - 30_000) {
    return _tokenCache.token;
  }

  const clientId = process.env.AIRTEL_CLIENT_ID;
  const clientSecret = process.env.AIRTEL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('AIRTEL_CLIENT_ID and AIRTEL_CLIENT_SECRET must be set');
  }

  const resp = await axios.post(
    `${BASE_URL}/auth/oauth2/token`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10_000 }
  );

  const { access_token, expires_in } = resp.data;
  _tokenCache = { token: access_token, expiresAt: now + (expires_in || 3600) * 1000 };
  return _tokenCache.token;
}

/**
 * Build authorized Axios instance.
 */
async function _client() {
  const token = await _getAccessToken();
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Country': COUNTRY,
      'X-Currency': CURRENCY,
      Accept: '*/*',
    },
    timeout: 30_000,
  });
}

/**
 * Retry wrapper — retries up to maxAttempts times on transient errors.
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
      logger.warn(`[AirtelMoney] Attempt ${attempt} failed, retrying in ${delayMs}ms…`, {
        error: err.message,
      });
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
  throw lastErr;
}

/**
 * Normalize Airtel API response → internal PaymentResult.
 */
function _normalize(raw, internalReference) {
  const status = raw?.status?.success === true ? 'success' : 'failed';
  return {
    success: status === 'success',
    reference: internalReference,
    providerRef: raw?.data?.transaction?.id || raw?.data?.transaction?.airtel_money_id || null,
    status,
    message: raw?.status?.message || (status === 'success' ? 'Transaction initiated' : 'Transaction failed'),
    raw,
  };
}

// ─── Public Methods ─────────────────────────────────────────────────────────

/**
 * Initiate a deposit (collection) from a subscriber's Airtel Money wallet.
 *
 * @param {object} params
 * @param {string} params.phone          - Subscriber phone (Zambian format, e.g. 097XXXXXXX)
 * @param {number} params.amount         - Amount in ZMW
 * @param {string} params.reference      - Internal transaction reference
 * @param {string} [params.description]  - Optional description
 * @returns {Promise<PaymentResult>}
 */
async function initiateDeposit({ phone, amount, reference, description = 'ZedEarn Deposit' }) {
  logger.info('[AirtelMoney] initiateDeposit', { phone, amount, reference });

  return _withRetry(async () => {
    const client = await _client();
    const payload = {
      reference,
      subscriber: { country: COUNTRY, currency: CURRENCY, msisdn: phone },
      transaction: {
        amount: String(amount),
        country: COUNTRY,
        currency: CURRENCY,
        id: reference,
      },
    };

    let raw;
    try {
      const resp = await client.post('/merchant/v1/payments/', payload);
      raw = resp.data;
    } catch (err) {
      raw = err.response?.data || { status: { success: false, message: err.message } };
      logger.error('[AirtelMoney] initiateDeposit error', { error: err.message, reference });
    }

    logger.info('[AirtelMoney] initiateDeposit response', { reference, raw });
    return _normalize(raw, reference);
  });
}

/**
 * Initiate a withdrawal (disbursement) to a subscriber's Airtel Money wallet.
 *
 * @param {object} params
 * @param {string} params.phone          - Recipient phone
 * @param {number} params.amount         - Amount in ZMW
 * @param {string} params.reference      - Internal transaction reference
 * @param {string} [params.description]  - Optional narration
 * @returns {Promise<PaymentResult>}
 */
async function initiateWithdrawal({ phone, amount, reference, description = 'ZedEarn Payout' }) {
  logger.info('[AirtelMoney] initiateWithdrawal', { phone, amount, reference });

  return _withRetry(async () => {
    const client = await _client();
    const payload = {
      payee: { msisdn: phone },
      reference,
      pin: process.env.AIRTEL_ENCPIN || '',
      transaction: {
        amount: String(amount),
        id: reference,
        type: 'B2C',
      },
    };

    let raw;
    try {
      const resp = await client.post('/standard/v1/disbursements/', payload);
      raw = resp.data;
    } catch (err) {
      raw = err.response?.data || { status: { success: false, message: err.message } };
      logger.error('[AirtelMoney] initiateWithdrawal error', { error: err.message, reference });
    }

    logger.info('[AirtelMoney] initiateWithdrawal response', { reference, raw });
    return _normalize(raw, reference);
  });
}

/**
 * Verify the status of a transaction using the internal reference.
 *
 * @param {string} reference - Internal transaction reference
 * @returns {Promise<PaymentResult>}
 */
async function verifyTransaction(reference) {
  logger.info('[AirtelMoney] verifyTransaction', { reference });

  return _withRetry(async () => {
    const client = await _client();

    let raw;
    try {
      const resp = await client.get(`/standard/v1/payments/${reference}`);
      raw = resp.data;
    } catch (err) {
      raw = err.response?.data || { status: { success: false, message: err.message } };
      logger.error('[AirtelMoney] verifyTransaction error', { error: err.message, reference });
    }

    logger.info('[AirtelMoney] verifyTransaction response', { reference, raw });
    return _normalize(raw, reference);
  });
}

module.exports = { initiateDeposit, initiateWithdrawal, verifyTransaction };
