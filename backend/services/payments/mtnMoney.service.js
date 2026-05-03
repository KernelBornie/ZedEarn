/**
 * mtnMoney.service.js
 *
 * MTN Mobile Money Zambia payment service.
 *
 * API Reference: MTN MoMo API (https://momodeveloper.mtn.com/)
 *
 * Required environment variables:
 *   MTN_SUBSCRIPTION_KEY    - Ocp-Apim-Subscription-Key from MTN developer portal
 *   MTN_API_USER            - UUID of API user (provisioned via /v1_0/apiuser)
 *   MTN_API_KEY             - API key for the user
 *   MTN_BASE_URL            - API base URL (default: https://sandbox.momodeveloper.mtn.com)
 *   MTN_CURRENCY            - Currency code (default: ZMW)
 *   MTN_ENVIRONMENT         - 'sandbox' or 'production'
 *
 * Each public method returns a normalized PaymentResult:
 *   { success, reference, providerRef, status, message, raw }
 */

'use strict';

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const logger = require('../../utils/logger');

const BASE_URL = process.env.MTN_BASE_URL || 'https://sandbox.momodeveloper.mtn.com';
const CURRENCY = process.env.MTN_CURRENCY || 'ZMW';
const ENVIRONMENT = process.env.MTN_ENVIRONMENT || 'sandbox';

// In-memory token caches — one per product scope
const _tokenCache = {};

/**
 * Obtain a product-scoped OAuth2 access token.
 * MTN MoMo has separate tokens for 'collection' and 'disbursement'.
 *
 * @param {'collection'|'disbursement'} product
 * @returns {Promise<string>}
 */
async function _getAccessToken(product) {
  const now = Date.now();
  if (_tokenCache[product]?.token && now < _tokenCache[product].expiresAt - 30_000) {
    return _tokenCache[product].token;
  }

  const apiUser = process.env.MTN_API_USER;
  const apiKey = process.env.MTN_API_KEY;
  const subscriptionKey = process.env.MTN_SUBSCRIPTION_KEY;

  if (!apiUser || !apiKey || !subscriptionKey) {
    throw new Error('MTN_API_USER, MTN_API_KEY, and MTN_SUBSCRIPTION_KEY must be set');
  }

  const credentials = Buffer.from(`${apiUser}:${apiKey}`).toString('base64');

  const resp = await axios.post(
    `${BASE_URL}/${product}/token/`,
    {},
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        'X-Target-Environment': ENVIRONMENT,
      },
      timeout: 10_000,
    }
  );

  const { access_token, expires_in } = resp.data;
  _tokenCache[product] = {
    token: access_token,
    expiresAt: now + (expires_in || 3600) * 1000,
  };
  return _tokenCache[product].token;
}

/**
 * Build authorized Axios instance for a given product scope.
 */
async function _client(product) {
  const token = await _getAccessToken(product);
  const subscriptionKey = process.env.MTN_SUBSCRIPTION_KEY;

  return axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
      'Ocp-Apim-Subscription-Key': subscriptionKey,
      'X-Target-Environment': ENVIRONMENT,
      'Content-Type': 'application/json',
    },
    timeout: 30_000,
  });
}

/**
 * Retry wrapper — retries on transient failures.
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
      logger.warn(`[MTNMoney] Attempt ${attempt} failed, retrying in ${delayMs * attempt}ms…`, {
        error: err.message,
      });
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
  throw lastErr;
}

/**
 * Normalize an MTN MoMo response + polled status → internal PaymentResult.
 */
function _normalize(statusData, reference) {
  // MTN MoMo statuses: SUCCESSFUL, FAILED, PENDING
  const mtnStatus = statusData?.status || 'UNKNOWN';
  const success = mtnStatus === 'SUCCESSFUL';

  return {
    success,
    reference,
    providerRef: statusData?.financialTransactionId || null,
    status: success ? 'success' : mtnStatus === 'PENDING' ? 'pending' : 'failed',
    message: statusData?.reason || (success ? 'Transaction successful' : `Transaction ${mtnStatus.toLowerCase()}`),
    raw: statusData,
  };
}

// ─── Public Methods ─────────────────────────────────────────────────────────

/**
 * Initiate a deposit (collection request) from a subscriber.
 *
 * @param {object} params
 * @param {string} params.phone          - Subscriber MSISDN
 * @param {number} params.amount         - Amount in ZMW
 * @param {string} params.reference      - Internal transaction reference (used as externalId)
 * @param {string} [params.description]
 * @returns {Promise<PaymentResult>}
 */
async function initiateDeposit({ phone, amount, reference, description = 'ZedEarn Deposit' }) {
  logger.info('[MTNMoney] initiateDeposit', { phone, amount, reference });

  return _withRetry(async () => {
    const client = await _client('collection');
    const xReferenceId = uuidv4(); // MTN requires a UUID per request

    const payload = {
      amount: String(amount),
      currency: CURRENCY,
      externalId: reference,
      payer: { partyIdType: 'MSISDN', partyId: phone },
      payerMessage: description,
      payeeNote: description,
    };

    let initRaw;
    try {
      await client.post('/collection/v1_0/requesttopay', payload, {
        headers: { 'X-Reference-Id': xReferenceId },
      });
      // MTN returns 202 with empty body on success
      initRaw = { status: 'PENDING' };
    } catch (err) {
      logger.error('[MTNMoney] initiateDeposit error', { error: err.message, reference });
      return {
        success: false,
        reference,
        providerRef: null,
        status: 'failed',
        message: err.response?.data?.message || err.message,
        raw: err.response?.data || {},
      };
    }

    logger.info('[MTNMoney] initiateDeposit initiated', { reference, xReferenceId });
    return {
      success: true, // 202 = accepted; use verifyTransaction to confirm
      reference,
      providerRef: xReferenceId,
      status: 'pending',
      message: 'Payment request accepted',
      raw: { ...initRaw, xReferenceId },
    };
  });
}

/**
 * Initiate a withdrawal (disbursement) to a subscriber.
 *
 * @param {object} params
 * @param {string} params.phone
 * @param {number} params.amount
 * @param {string} params.reference
 * @param {string} [params.description]
 * @returns {Promise<PaymentResult>}
 */
async function initiateWithdrawal({ phone, amount, reference, description = 'ZedEarn Payout' }) {
  logger.info('[MTNMoney] initiateWithdrawal', { phone, amount, reference });

  return _withRetry(async () => {
    const client = await _client('disbursement');
    const xReferenceId = uuidv4();

    const payload = {
      amount: String(amount),
      currency: CURRENCY,
      externalId: reference,
      payee: { partyIdType: 'MSISDN', partyId: phone },
      payerMessage: description,
      payeeNote: description,
    };

    try {
      await client.post('/disbursement/v1_0/transfer', payload, {
        headers: { 'X-Reference-Id': xReferenceId },
      });
    } catch (err) {
      logger.error('[MTNMoney] initiateWithdrawal error', { error: err.message, reference });
      return {
        success: false,
        reference,
        providerRef: null,
        status: 'failed',
        message: err.response?.data?.message || err.message,
        raw: err.response?.data || {},
      };
    }

    logger.info('[MTNMoney] initiateWithdrawal initiated', { reference, xReferenceId });
    return {
      success: true,
      reference,
      providerRef: xReferenceId,
      status: 'pending',
      message: 'Disbursement accepted',
      raw: { xReferenceId },
    };
  });
}

/**
 * Verify the status of a transaction.
 * Uses the providerRef (xReferenceId) stored during initiation.
 *
 * @param {string} reference        - Internal reference (passed through in result)
 * @param {string} [providerRef]    - MTN xReferenceId (UUID from initiation response)
 * @param {'collection'|'disbursement'} [product]
 * @returns {Promise<PaymentResult>}
 */
async function verifyTransaction(reference, providerRef, product = 'collection') {
  logger.info('[MTNMoney] verifyTransaction', { reference, providerRef, product });

  if (!providerRef) {
    return {
      success: false,
      reference,
      providerRef: null,
      status: 'failed',
      message: 'providerRef (xReferenceId) required for verification',
      raw: {},
    };
  }

  return _withRetry(async () => {
    const client = await _client(product);
    const path =
      product === 'collection'
        ? `/collection/v1_0/requesttopay/${providerRef}`
        : `/disbursement/v1_0/transfer/${providerRef}`;

    let raw;
    try {
      const resp = await client.get(path);
      raw = resp.data;
    } catch (err) {
      raw = err.response?.data || { status: 'UNKNOWN' };
      logger.error('[MTNMoney] verifyTransaction error', { error: err.message, reference });
    }

    logger.info('[MTNMoney] verifyTransaction response', { reference, raw });
    return _normalize(raw, reference);
  });
}

module.exports = { initiateDeposit, initiateWithdrawal, verifyTransaction };
