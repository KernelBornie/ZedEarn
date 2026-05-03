/**
 * ledgerService.js
 *
 * Production-grade double-entry ledger engine for ZedEarn.
 *
 * Design rules:
 *  - Every financial mutation creates a WalletLedger entry FIRST.
 *  - User balance fields and WalletSnapshot are updated atomically in the same
 *    MongoDB session / operation.
 *  - No balance mutation may happen outside this service.
 *  - POSTED ledger entries are immutable; reversals create counter-entries.
 */

const mongoose = require('mongoose');
const WalletLedger = require('../models/WalletLedger');
const WalletSnapshot = require('../models/WalletSnapshot');
const User = require('../models/User');

// Categories that contribute to lifetimeEarnings
const EARNING_CATEGORIES = ['TASK', 'REFERRAL', 'DEPOSIT', 'ADMIN', 'MARKETPLACE'];

// ─── Internal helper: sync WalletSnapshot from User fields ────────────────────
const _syncSnapshot = async (userId, session) => {
  const opts = session ? { session } : {};
  const user = await User.findById(userId).session(session || null).lean();
  if (!user) throw new Error(`User ${userId} not found during snapshot sync`);

  await WalletSnapshot.findOneAndUpdate(
    { userId },
    {
      userId,
      availableBalance: user.balance,
      pendingBalance: user.pendingBalance,
      frozenBalance: user.frozenBalance,
      lifetimeEarnings: user.lifetimeEarnings,
      updatedAt: new Date(),
    },
    { upsert: true, new: true, ...opts }
  );
};

// ─── Internal helper: create a ledger entry (array-style for session support) ──
const _createEntry = async (data, session) => {
  const opts = session ? { session } : {};
  const [entry] = await WalletLedger.create([data], opts);
  return entry;
};

// ─── CREDIT ───────────────────────────────────────────────────────────────────
/**
 * Credit a user's available balance.
 * Also increments lifetimeEarnings for earning categories.
 * For TASK category, also increments rewardBalance (sub-total).
 *
 * @param {ObjectId|string} userId
 * @param {number} amount  - must be positive
 * @param {string} category - LEDGER_CATEGORIES value
 * @param {object} meta
 * @param {ClientSession} [session]
 * @returns {WalletLedger}
 */
const credit = async (userId, amount, category, meta = {}, session) => {
  if (!amount || amount <= 0) throw new Error('Credit amount must be positive');

  const opts = session ? { session } : {};
  const earningCategories = EARNING_CATEGORIES;
  const incLifetime = earningCategories.includes(category);

  const balanceInc = {
    balance: amount,
    ...(incLifetime ? { lifetimeEarnings: amount } : {}),
    ...(category === 'TASK' ? { rewardBalance: amount } : {}),
  };

  const ledgerEntry = await _createEntry(
    { userId, type: 'CREDIT', category, amount, status: 'POSTED', meta },
    session
  );

  await User.findByIdAndUpdate(userId, { $inc: balanceInc }, opts);
  await _syncSnapshot(userId, session);
  return ledgerEntry;
};

// ─── DEBIT ────────────────────────────────────────────────────────────────────
/**
 * Debit a user's available balance.
 * Validates that sufficient balance exists before proceeding.
 *
 * @param {ObjectId|string} userId
 * @param {number} amount
 * @param {string} category
 * @param {object} meta
 * @param {ClientSession} [session]
 * @returns {WalletLedger}
 */
const debit = async (userId, amount, category, meta = {}, session) => {
  if (!amount || amount <= 0) throw new Error('Debit amount must be positive');

  const opts = session ? { session } : {};
  const user = await User.findById(userId).session(session || null);
  if (!user) throw new Error(`User ${userId} not found`);
  if (user.balance < amount) {
    throw new Error(
      `Insufficient balance. Available: ZMW ${user.balance.toFixed(2)}, Required: ZMW ${amount.toFixed(2)}`
    );
  }

  const ledgerEntry = await _createEntry(
    { userId, type: 'DEBIT', category, amount, status: 'POSTED', meta },
    session
  );

  await User.findByIdAndUpdate(userId, { $inc: { balance: -amount } }, opts);
  await _syncSnapshot(userId, session);
  return ledgerEntry;
};

// ─── HOLD (for withdrawal requests) ──────────────────────────────────────────
/**
 * Move funds from available balance to frozen balance.
 * Used when a withdrawal is requested but not yet processed.
 *
 * @param {ObjectId|string} userId
 * @param {number} amount
 * @param {string} category
 * @param {object} meta
 * @param {ClientSession} [session]
 * @returns {WalletLedger}
 */
const hold = async (userId, amount, category, meta = {}, session) => {
  if (!amount || amount <= 0) throw new Error('Hold amount must be positive');

  const opts = session ? { session } : {};
  const user = await User.findById(userId).session(session || null);
  if (!user) throw new Error(`User ${userId} not found`);
  if (user.balance < amount) {
    throw new Error(
      `Insufficient balance for hold. Available: ZMW ${user.balance.toFixed(2)}, Required: ZMW ${amount.toFixed(2)}`
    );
  }

  const ledgerEntry = await _createEntry(
    {
      userId,
      type: 'DEBIT',
      category,
      amount,
      status: 'POSTED',
      meta: { ...meta, holdType: 'frozen' },
    },
    session
  );

  await User.findByIdAndUpdate(
    userId,
    { $inc: { balance: -amount, frozenBalance: amount } },
    opts
  );
  await _syncSnapshot(userId, session);
  return ledgerEntry;
};

// ─── RELEASE HOLD (withdrawal rejected → funds returned) ─────────────────────
/**
 * Move funds from frozen balance back to available balance.
 * Used when a withdrawal request is rejected.
 *
 * @param {ObjectId|string} userId
 * @param {number} amount
 * @param {ClientSession} [session]
 * @returns {WalletLedger}
 */
const releaseHold = async (userId, amount, session) => {
  if (!amount || amount <= 0) throw new Error('Release amount must be positive');

  const opts = session ? { session } : {};

  const ledgerEntry = await _createEntry(
    {
      userId,
      type: 'CREDIT',
      category: 'SYSTEM',
      amount,
      status: 'POSTED',
      meta: { holdType: 'hold_released' },
    },
    session
  );

  await User.findByIdAndUpdate(
    userId,
    { $inc: { balance: amount, frozenBalance: -amount } },
    opts
  );
  await _syncSnapshot(userId, session);
  return ledgerEntry;
};

// ─── CONFIRM WITHDRAWAL (withdrawal approved → remove from frozen) ─────────────
/**
 * Finalize an approved withdrawal by removing the amount from frozenBalance.
 * The funds have left the system.
 *
 * @param {ObjectId|string} userId
 * @param {number} amount
 * @param {object} meta
 * @param {ClientSession} [session]
 */
const confirmWithdrawal = async (userId, amount, meta = {}, session) => {
  const opts = session ? { session } : {};

  await _createEntry(
    {
      userId,
      type: 'DEBIT',
      category: 'WITHDRAWAL',
      amount,
      status: 'POSTED',
      meta: { ...meta, withdrawalConfirmed: true },
    },
    session
  );

  await User.findByIdAndUpdate(userId, { $inc: { frozenBalance: -amount } }, opts);
  await _syncSnapshot(userId, session);
};

// ─── CREDIT PENDING (deposit initiated) ──────────────────────────────────────
/**
 * Record a deposit initiation by incrementing pendingBalance.
 * A PENDING ledger entry is created; it will be POSTED on approval.
 *
 * @param {ObjectId|string} userId
 * @param {number} amount
 * @param {object} meta
 * @param {ClientSession} [session]
 * @returns {WalletLedger}
 */
const creditPending = async (userId, amount, meta = {}, session) => {
  const opts = session ? { session } : {};

  const ledgerEntry = await _createEntry(
    {
      userId,
      type: 'CREDIT',
      category: 'DEPOSIT',
      amount,
      status: 'PENDING',
      meta,
    },
    session
  );

  await User.findByIdAndUpdate(userId, { $inc: { pendingBalance: amount } }, opts);
  await _syncSnapshot(userId, session);
  return ledgerEntry;
};

// ─── APPROVE DEPOSIT ──────────────────────────────────────────────────────────
/**
 * Approve a pending deposit: move funds from pendingBalance to availableBalance.
 * Marks the original PENDING ledger entry as POSTED and creates a credit entry.
 *
 * @param {ObjectId|string} userId
 * @param {number} depositAmount  - original pending amount
 * @param {number} netAmount      - amount credited after fees
 * @param {object} meta
 * @param {ClientSession} [session]
 */
const approveDeposit = async (userId, depositAmount, netAmount, meta = {}, session) => {
  const opts = session ? { session } : {};

  // Mark the earliest matching PENDING deposit entry as POSTED
  const pendingEntry = await WalletLedger.findOne({
    userId,
    category: 'DEPOSIT',
    status: 'PENDING',
    amount: depositAmount,
  })
    .sort({ createdAt: 1 })
    .session(session || null);

  if (pendingEntry) {
    await WalletLedger.findByIdAndUpdate(
      pendingEntry._id,
      { status: 'POSTED', 'meta.approvedAt': new Date() },
      opts
    );
  }

  // Credit the net amount to available balance
  await _createEntry(
    {
      userId,
      type: 'CREDIT',
      category: 'DEPOSIT',
      amount: netAmount,
      status: 'POSTED',
      meta: {
        ...meta,
        depositAmount,
        approvalType: 'deposit_approved',
      },
    },
    session
  );

  await User.findByIdAndUpdate(
    userId,
    { $inc: { balance: netAmount, pendingBalance: -depositAmount, lifetimeEarnings: netAmount } },
    opts
  );
  await _syncSnapshot(userId, session);
};

// ─── REJECT DEPOSIT ───────────────────────────────────────────────────────────
/**
 * Reject a pending deposit: remove the amount from pendingBalance.
 * Marks the PENDING ledger entry as REVERSED.
 *
 * @param {ObjectId|string} userId
 * @param {number} amount
 * @param {object} meta
 * @param {ClientSession} [session]
 */
const rejectDeposit = async (userId, amount, meta = {}, session) => {
  const opts = session ? { session } : {};

  const pendingEntry = await WalletLedger.findOne({
    userId,
    category: 'DEPOSIT',
    status: 'PENDING',
    amount,
  })
    .sort({ createdAt: 1 })
    .session(session || null);

  if (pendingEntry) {
    await WalletLedger.findByIdAndUpdate(
      pendingEntry._id,
      {
        status: 'REVERSED',
        meta: { ...pendingEntry.meta, ...meta, rejectedAt: new Date() },
      },
      opts
    );
  } else {
    // No pending entry found (e.g. recharge without ledger entry) — create a record
    await _createEntry(
      {
        userId,
        type: 'DEBIT',
        category: 'DEPOSIT',
        amount,
        status: 'POSTED',
        meta: { ...meta, reason: 'deposit_rejected' },
      },
      session
    );
  }

  await User.findByIdAndUpdate(userId, { $inc: { pendingBalance: -amount } }, opts);
  await _syncSnapshot(userId, session);
};

// ─── CREDIT MARKETPLACE SALE (seller receives net + commission sub-total) ─────
/**
 * Credit a seller for a marketplace sale.
 * Adds netAmount to main balance and commission to commissionBalance (sub-total).
 *
 * @param {ObjectId|string} sellerId
 * @param {number} netAmount     - amount added to spendable balance
 * @param {number} commission    - commission sub-total (tracked separately)
 * @param {object} meta
 * @param {ClientSession} [session]
 * @returns {WalletLedger}
 */
const creditMarketplaceSale = async (sellerId, netAmount, commission, meta = {}, session) => {
  const opts = session ? { session } : {};

  const ledgerEntry = await _createEntry(
    {
      userId: sellerId,
      type: 'CREDIT',
      category: 'MARKETPLACE',
      amount: netAmount,
      status: 'POSTED',
      meta: { ...meta, commission, sellerNet: netAmount },
    },
    session
  );

  await User.findByIdAndUpdate(
    sellerId,
    {
      $inc: {
        balance: netAmount,
        commissionBalance: commission,
        lifetimeEarnings: netAmount,
      },
    },
    opts
  );
  await _syncSnapshot(sellerId, session);
  return ledgerEntry;
};

// ─── ADMIN ADJUST ─────────────────────────────────────────────────────────────
/**
 * Admin balance adjustment.
 * Supports balanceType: 'balance' | 'rewardBalance' | 'commissionBalance'.
 * Preserves existing sub-balance semantics.
 *
 * @param {ObjectId|string} userId
 * @param {number} adjustAmount  - positive = credit, negative = debit
 * @param {string} balanceType
 * @param {string} reason
 * @param {ObjectId|string} adminId
 * @param {ClientSession} [session]
 */
const adminAdjust = async (userId, adjustAmount, balanceType, reason, adminId, session) => {
  const opts = session ? { session } : {};
  const abs = Math.abs(adjustAmount);
  const isCredit = adjustAmount > 0;

  await _createEntry(
    {
      userId,
      type: isCredit ? 'CREDIT' : 'DEBIT',
      category: 'ADMIN',
      amount: abs,
      status: 'POSTED',
      meta: { balanceType, reason, adjustedBy: adminId },
    },
    session
  );

  await User.findByIdAndUpdate(
    userId,
    {
      $inc: {
        [balanceType]: adjustAmount,
        ...(isCredit ? { lifetimeEarnings: adjustAmount } : {}),
      },
    },
    opts
  );
  await _syncSnapshot(userId, session);
};

// ─── REVERSE LEDGER ───────────────────────────────────────────────────────────
/**
 * Reverse a POSTED ledger entry.
 * Creates a counter-entry and undoes the balance impact.
 *
 * @param {string} reference  - WalletLedger reference to reverse
 * @param {string} reason
 * @param {ClientSession} [session]
 */
const reverseLedger = async (reference, reason, session) => {
  const opts = session ? { session } : {};

  const entry = await WalletLedger.findOne({ reference }).session(session || null);
  if (!entry) throw new Error(`Ledger entry not found: ${reference}`);
  if (entry.status === 'REVERSED') throw new Error('Entry is already reversed');
  if (entry.status !== 'POSTED') {
    throw new Error('Only POSTED entries can be reversed');
  }

  // Mark original as REVERSED
  await WalletLedger.findByIdAndUpdate(
    entry._id,
    {
      status: 'REVERSED',
      'meta.reversalReason': reason,
      'meta.reversedAt': new Date(),
    },
    opts
  );

  // Create counter-entry
  const counterType = entry.type === 'CREDIT' ? 'DEBIT' : 'CREDIT';
  await _createEntry(
    {
      userId: entry.userId,
      type: counterType,
      category: 'SYSTEM',
      amount: entry.amount,
      status: 'POSTED',
      meta: {
        originalReference: entry.reference,
        reason,
        reversalOf: entry._id,
      },
    },
    session
  );

  // Undo balance impact
  const userId = entry.userId;
  const entryMeta = entry.meta || {};

  if (entry.type === 'CREDIT') {
    // Was a credit → now debit
    const decFields = { balance: -entry.amount };
    if (EARNING_CATEGORIES.includes(entry.category)) {
      decFields.lifetimeEarnings = -entry.amount;
    }
    if (entry.category === 'TASK') decFields.rewardBalance = -entry.amount;
    if (entry.category === 'MARKETPLACE' && entryMeta.commission) {
      decFields.commissionBalance = -entryMeta.commission;
    }
    if (entryMeta.holdType === 'hold_released') {
      // Was a releaseHold credit → undo: debit balance, credit frozen
      await User.findByIdAndUpdate(
        userId,
        { $inc: { balance: -entry.amount, frozenBalance: entry.amount } },
        opts
      );
    } else {
      await User.findByIdAndUpdate(userId, { $inc: decFields }, opts);
    }
  } else {
    // Was a debit → now credit
    if (entryMeta.holdType === 'frozen') {
      // Was a hold → undo: credit balance, debit frozen
      await User.findByIdAndUpdate(
        userId,
        { $inc: { balance: entry.amount, frozenBalance: -entry.amount } },
        opts
      );
    } else if (entry.category === 'WITHDRAWAL' && entryMeta.withdrawalConfirmed) {
      // Was a confirmWithdrawal → undo: credit frozen
      await User.findByIdAndUpdate(
        userId,
        { $inc: { frozenBalance: entry.amount } },
        opts
      );
    } else {
      await User.findByIdAndUpdate(userId, { $inc: { balance: entry.amount } }, opts);
    }
  }

  await _syncSnapshot(userId, session);
};

// ─── GET BALANCE ──────────────────────────────────────────────────────────────
/**
 * Return the user's balance from WalletSnapshot (cache), falling back to
 * User model fields if the snapshot doesn't exist yet.
 *
 * @param {ObjectId|string} userId
 * @returns {{ availableBalance, pendingBalance, frozenBalance, lifetimeEarnings }}
 */
const getBalance = async (userId) => {
  const snapshot = await WalletSnapshot.findOne({ userId }).lean();
  if (snapshot) {
    return {
      availableBalance: snapshot.availableBalance,
      pendingBalance: snapshot.pendingBalance,
      frozenBalance: snapshot.frozenBalance,
      lifetimeEarnings: snapshot.lifetimeEarnings,
    };
  }

  // Fallback: read from User model and seed the snapshot
  const user = await User.findById(userId).lean();
  if (!user) throw new Error(`User ${userId} not found`);

  // Seed snapshot asynchronously (fire-and-forget to not block the caller)
  _syncSnapshot(userId, null).catch((e) =>
    console.error('[LedgerService] Snapshot seed error:', e)
  );

  return {
    availableBalance: user.balance,
    pendingBalance: user.pendingBalance,
    frozenBalance: user.frozenBalance,
    lifetimeEarnings: user.lifetimeEarnings,
  };
};

module.exports = {
  credit,
  debit,
  hold,
  releaseHold,
  confirmWithdrawal,
  creditPending,
  approveDeposit,
  rejectDeposit,
  creditMarketplaceSale,
  adminAdjust,
  reverseLedger,
  getBalance,
};
