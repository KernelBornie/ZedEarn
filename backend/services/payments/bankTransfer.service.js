/**
 * bankTransfer.service.js
 *
 * Bank transfer service for ZedEarn Zambia.
 *
 * Zambian bank integrations are typically done through a payment aggregator
 * (e.g. Cellulant, Peach Payments, DPO Group, or direct RTGS/EFT via Zanaco/Stanbic).
 * This service targets the DPO Group / Cellulant API pattern commonly used in Zambia.
 *
 * Required environment variables:
 *   BANK_API_KEY             - API key from payment aggregator
 *   BANK_API_SECRET          - API secret
 *   BANK_BASE_URL            - Aggregator base URL
 *   BANK_COMPANY_TOKEN       - Company/merchant token
 *   BANK_SERVICE_TYPE        - Service type code (e.g. '3854' for Zambia EFT)
 *   BANK_CURRENCY            - Currency (default: ZMW)
 *
 * Each public method returns a normalized PaymentResult:
 *   { success, reference, providerRef, status, message, raw }
 */

'use strict';

const axios = require('axios');
const crypto = require('crypto');
const logger = require('../../utils/logger');

const BASE_URL = process.env.BANK_BASE_URL || 'https://api.paymentgateway.zm/v2';
const CURRENCY = process.env.BANK_CURRENCY || 'ZMW';

/**
 * Generate request signature for the aggregator.
 */
function _sign(data) {
  const secret = process.env.BANK_API_SECRET;
  if (!secret) throw new Error('BANK_API_SECRET must be set');
  return crypto
    .createHmac('sha256', secret)
    .update(typeof data === 'string' ? data : JSON.stringify(data))
    .digest('hex');
}

/**
 * Build authorized Axios client.
 */
function _client() {
  const apiKey = process.env.BANK_API_KEY;
  const companyToken = process.env.BANK_COMPANY_TOKEN;

  if (!apiKey || !companyToken) {
    throw new Error('BANK_API_KEY and BANK_COMPANY_TOKEN must be set');
  }

  return axios.create({
    baseURL: BASE_URL,
    headers: {
      'X-Api-Key': apiKey,
      'X-Company-Token': companyToken,
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
      logger.warn(`[BankTransfer] Attempt ${attempt} failed, retrying…`, { error: err.message });
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
  throw lastErr;
}

/**
 * Normalize aggregator response → internal PaymentResult.
 */
function _normalize(raw, reference) {
  // Common aggregator response: { ResultCode: '000', TransCode: '...', ResultExplanation: '...' }
  const success =
    raw?.ResultCode === '000' ||
    raw?.status === 'SUCCESS' ||
    raw?.responseCode === '200';

  return {
    success,
    reference,
    providerRef:
      raw?.TransCode || raw?.transactionId || raw?.providerRef || null,
    status: success ? 'success' : raw?.status === 'PENDING' ? 'pending' : 'failed',
    message:
      raw?.ResultExplanation ||
      raw?.responseDescription ||
      raw?.message ||
      (success ? 'Transfer initiated' : 'Transfer failed'),
    raw,
  };
}

// ─── Public Methods ─────────────────────────────────────────────────────────

/**
 * Initiate a deposit via bank transfer.
 * For bank deposits this typically generates a payment reference/link that
 * the customer uses to complete a bank transfer.
 *
 * @param {object} params
 * @param {string} params.accountNumber  - Customer bank account or reference
 * @param {string} params.accountName    - Customer name
 * @param {string} params.bankCode       - Bank code (e.g. ZANACO = '01')
 * @param {number} params.amount
 * @param {string} params.reference
 * @param {string} [params.description]
 * @returns {Promise<PaymentResult>}
 */
async function initiateDeposit({
  accountNumber,
  accountName,
  bankCode,
  amount,
  reference,
  description = 'ZedEarn Bank Deposit',
}) {
  logger.info('[BankTransfer] initiateDeposit', { accountNumber, amount, reference });

  return _withRetry(async () => {
    const payload = {
      CompanyToken: process.env.BANK_COMPANY_TOKEN,
      ServiceType: process.env.BANK_SERVICE_TYPE || '3854',
      TransactionRef: reference,
      Amount: String(amount),
      Currency: CURRENCY,
      CustomerName: accountName,
      CustomerAccount: accountNumber,
      BankCode: bankCode || '',
      Narration: description,
      Direction: 'INBOUND',
    };
    const signature = _sign(payload);

    let raw;
    try {
      const client = _client();
      const resp = await client.post('/payment/initiate', { ...payload, Signature: signature });
      raw = resp.data;
    } catch (err) {
      raw = err.response?.data || { status: 'FAILED', message: err.message };
      logger.error('[BankTransfer] initiateDeposit error', { error: err.message, reference });
    }

    logger.info('[BankTransfer] initiateDeposit response', { reference, raw });
    return _normalize(raw, reference);
  });
}

/**
 * Initiate a withdrawal via bank transfer (EFT/RTGS disbursement).
 *
 * @param {object} params
 * @param {string} params.accountNumber  - Beneficiary account number
 * @param {string} params.accountName    - Beneficiary name
 * @param {string} params.bankCode       - Beneficiary bank code
 * @param {string} params.branchCode     - Branch code (optional)
 * @param {number} params.amount
 * @param {string} params.reference
 * @param {string} [params.description]
 * @returns {Promise<PaymentResult>}
 */
async function initiateWithdrawal({
  accountNumber,
  accountName,
  bankCode,
  branchCode,
  amount,
  reference,
  description = 'ZedEarn Bank Payout',
}) {
  logger.info('[BankTransfer] initiateWithdrawal', { accountNumber, amount, reference });

  return _withRetry(async () => {
    const payload = {
      CompanyToken: process.env.BANK_COMPANY_TOKEN,
      ServiceType: process.env.BANK_SERVICE_TYPE || '3854',
      TransactionRef: reference,
      Amount: String(amount),
      Currency: CURRENCY,
      BeneficiaryName: accountName,
      BeneficiaryAccount: accountNumber,
      BankCode: bankCode || '',
      BranchCode: branchCode || '',
      Narration: description,
      Direction: 'OUTBOUND',
    };
    const signature = _sign(payload);

    let raw;
    try {
      const client = _client();
      const resp = await client.post('/payment/initiate', { ...payload, Signature: signature });
      raw = resp.data;
    } catch (err) {
      raw = err.response?.data || { status: 'FAILED', message: err.message };
      logger.error('[BankTransfer] initiateWithdrawal error', { error: err.message, reference });
    }

    logger.info('[BankTransfer] initiateWithdrawal response', { reference, raw });
    return _normalize(raw, reference);
  });
}

/**
 * Verify the status of a bank transfer.
 *
 * @param {string} reference
 * @returns {Promise<PaymentResult>}
 */
async function verifyTransaction(reference) {
  logger.info('[BankTransfer] verifyTransaction', { reference });

  return _withRetry(async () => {
    let raw;
    try {
      const client = _client();
      const resp = await client.get(`/payment/status/${reference}`);
      raw = resp.data;
    } catch (err) {
      raw = err.response?.data || { status: 'FAILED', message: err.message };
      logger.error('[BankTransfer] verifyTransaction error', { error: err.message, reference });
    }

    logger.info('[BankTransfer] verifyTransaction response', { reference, raw });
    return _normalize(raw, reference);
  });
}

module.exports = { initiateDeposit, initiateWithdrawal, verifyTransaction };
