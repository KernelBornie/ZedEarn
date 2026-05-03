/**
 * paymentService.js
 *
 * Unified payment service for ZedEarn.
 *
 * Dynamically selects the correct provider based on the payment method and
 * normalizes all responses into the internal PaymentResult format.
 *
 * Supported methods:
 *   airtel_money   → airtelMoney.service.js
 *   mtn_money      → mtnMoney.service.js
 *   zamtel_kwacha  → zamtelMoney.service.js
 *   bank_transfer  → bankTransfer.service.js
 *
 * PaymentResult shape:
 *   {
 *     success:     boolean,
 *     reference:   string,   // internal ZedEarn reference
 *     providerRef: string|null, // provider-side transaction ID
 *     status:      'success'|'pending'|'failed',
 *     message:     string,
 *     raw:         object,   // raw provider response (for audit logging)
 *   }
 */

'use strict';

const logger = require('../../utils/logger');
const airtelMoney = require('./airtelMoney.service');
const mtnMoney = require('./mtnMoney.service');
const zamtelMoney = require('./zamtelMoney.service');
const bankTransfer = require('./bankTransfer.service');

/**
 * Map internal payment method names → service modules.
 */
const PROVIDERS = {
  airtel_money: airtelMoney,
  mtn_money: mtnMoney,
  zamtel_kwacha: zamtelMoney,
  bank_transfer: bankTransfer,
};

/**
 * Resolve the provider service for a given method.
 * Throws if the method is unsupported.
 *
 * @param {string} method - e.g. 'airtel_money'
 * @returns {object} provider service module
 */
function _getProvider(method) {
  const provider = PROVIDERS[method];
  if (!provider) {
    throw new Error(`Unsupported payment method: "${method}"`);
  }
  return provider;
}

/**
 * Build deposit parameters from a transaction record and optional extras.
 * Handles both mobile-money (phone-based) and bank-transfer (account-based) flows.
 *
 * @param {string} method
 * @param {object} transaction - Mongoose Transaction doc
 * @param {object} [extras]    - Additional fields (e.g. { phone, accountNumber, accountName, bankCode })
 * @returns {object}
 */
function _buildDepositParams(method, transaction, extras = {}) {
  const base = {
    amount: transaction.netAmount || transaction.amount,
    reference: transaction.reference,
    description: transaction.description || 'ZedEarn Deposit',
  };

  if (method === 'bank_transfer') {
    return {
      ...base,
      accountNumber: extras.accountNumber || transaction.meta?.accountNumber || '',
      accountName: extras.accountName || transaction.meta?.accountName || '',
      bankCode: extras.bankCode || transaction.meta?.bankCode || '',
      branchCode: extras.branchCode || transaction.meta?.branchCode || '',
    };
  }

  return {
    ...base,
    phone: extras.phone || transaction.meta?.phone || '',
  };
}

/**
 * Build withdrawal parameters from a transaction record.
 *
 * @param {string} method
 * @param {object} transaction
 * @param {object} [extras]
 * @returns {object}
 */
function _buildWithdrawalParams(method, transaction, extras = {}) {
  const base = {
    amount: transaction.netAmount || transaction.amount,
    reference: transaction.reference,
    description: transaction.description || 'ZedEarn Payout',
  };

  if (method === 'bank_transfer') {
    return {
      ...base,
      accountNumber: extras.accountNumber || transaction.meta?.accountNumber || '',
      accountName: extras.accountName || transaction.meta?.accountName || '',
      bankCode: extras.bankCode || transaction.meta?.bankCode || '',
      branchCode: extras.branchCode || transaction.meta?.branchCode || '',
    };
  }

  return {
    ...base,
    phone: extras.phone || transaction.meta?.phone || '',
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Initiate a deposit via the appropriate provider.
 *
 * @param {string} method       - Payment method key (e.g. 'airtel_money')
 * @param {object} transaction  - Mongoose Transaction document
 * @param {object} [extras]     - Additional parameters
 * @returns {Promise<PaymentResult>}
 */
async function initiateDeposit(method, transaction, extras = {}) {
  logger.info('[PaymentService] initiateDeposit', {
    method,
    reference: transaction.reference,
    amount: transaction.amount,
  });

  const provider = _getProvider(method);
  const params = _buildDepositParams(method, transaction, extras);
  const result = await provider.initiateDeposit(params);

  logger.info('[PaymentService] initiateDeposit result', {
    method,
    reference: transaction.reference,
    success: result.success,
    status: result.status,
    providerRef: result.providerRef,
  });

  return result;
}

/**
 * Initiate a withdrawal via the appropriate provider.
 *
 * @param {string} method
 * @param {object} transaction
 * @param {object} [extras]
 * @returns {Promise<PaymentResult>}
 */
async function initiateWithdrawal(method, transaction, extras = {}) {
  logger.info('[PaymentService] initiateWithdrawal', {
    method,
    reference: transaction.reference,
    amount: transaction.amount,
  });

  const provider = _getProvider(method);
  const params = _buildWithdrawalParams(method, transaction, extras);
  const result = await provider.initiateWithdrawal(params);

  logger.info('[PaymentService] initiateWithdrawal result', {
    method,
    reference: transaction.reference,
    success: result.success,
    status: result.status,
    providerRef: result.providerRef,
  });

  return result;
}

/**
 * Verify a transaction via the appropriate provider.
 *
 * @param {string} method
 * @param {string} reference       - Internal ZedEarn reference
 * @param {string} [providerRef]   - Provider-side reference (required for MTN)
 * @returns {Promise<PaymentResult>}
 */
async function verifyTransaction(method, reference, providerRef) {
  logger.info('[PaymentService] verifyTransaction', { method, reference, providerRef });

  const provider = _getProvider(method);

  // MTN MoMo verifyTransaction also accepts providerRef as second argument
  const result =
    method === 'mtn_money'
      ? await provider.verifyTransaction(reference, providerRef)
      : await provider.verifyTransaction(reference);

  logger.info('[PaymentService] verifyTransaction result', {
    method,
    reference,
    success: result.success,
    status: result.status,
  });

  return result;
}

/**
 * List all supported payment methods.
 * @returns {string[]}
 */
function getSupportedMethods() {
  return Object.keys(PROVIDERS);
}

module.exports = {
  initiateDeposit,
  initiateWithdrawal,
  verifyTransaction,
  getSupportedMethods,
};
