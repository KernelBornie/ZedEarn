import { useState, useEffect } from 'react';
import api from '../api/axios';

const TX_LABELS = {
  deposit: 'Deposit',
  withdraw: 'Withdrawal',
  task_reward: 'Task Reward',
  referral_bonus: 'Referral Bonus',
  cashback: 'Cashback',
  vip_purchase: 'VIP Purchase',
  marketplace_sale: 'Marketplace Sale',
  adjustment: 'Adjustment',
  transfer: 'Transfer',
};

export default function Wallet() {
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rechargeForm, setRechargeForm] = useState({ amount: '', method: 'airtel_money', phone: '' });
  const [withdrawForm, setWithdrawForm] = useState({ amount: '', method: 'airtel_money', accountNumber: '', accountName: '' });
  const [rechargeMsg, setRechargeMsg] = useState(null);
  const [withdrawMsg, setWithdrawMsg] = useState(null);
  const [submitting, setSubmitting] = useState({ recharge: false, withdraw: false });
  const [activeTab, setActiveTab] = useState('overview');

  const loadWallet = () =>
    Promise.all([api.get('/api/wallet'), api.get('/api/wallet/transactions?limit=20')])
      .then(([wRes, tRes]) => {
        setWallet(wRes.data.wallet);
        setTransactions(tRes.data.transactions);
        return wRes.data.wallet;
      });

  useEffect(() => {
    loadWallet()
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleRefresh = (event) => {
      if (event.detail?.source === 'wallet') return;
      loadWallet().catch(console.error);
    };
    window.addEventListener('wallet:refresh', handleRefresh);
    return () => window.removeEventListener('wallet:refresh', handleRefresh);
  }, []);

  const handleRecharge = async (e) => {
    e.preventDefault();
    setRechargeMsg(null);
    setSubmitting((p) => ({ ...p, recharge: true }));
    try {
      const res = await api.post('/api/wallet/recharge', rechargeForm);
      setRechargeMsg({ type: 'success', text: res.data.instructions });
      const updatedWallet = await loadWallet().catch(() => null);
      window.dispatchEvent(new CustomEvent('wallet:refresh', { detail: { source: 'wallet', wallet: updatedWallet } }));
    } catch (err) {
      const errs = err.response?.data?.errors;
      setRechargeMsg({ type: 'error', text: errs ? errs.map((e) => e.msg).join(', ') : err.response?.data?.message || 'Failed' });
    } finally {
      setSubmitting((p) => ({ ...p, recharge: false }));
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    setWithdrawMsg(null);
    setSubmitting((p) => ({ ...p, withdraw: true }));
    try {
      const res = await api.post('/api/wallet/withdraw', withdrawForm);
      setWithdrawMsg({ type: 'success', text: `Withdrawal submitted! Ref: ${res.data.reference}. Net: ZMW ${res.data.netAmount?.toFixed(2)}` });
      const updatedWallet = await loadWallet().catch(() => null);
      window.dispatchEvent(new CustomEvent('wallet:refresh', { detail: { source: 'wallet', wallet: updatedWallet } }));
    } catch (err) {
      const errs = err.response?.data?.errors;
      setWithdrawMsg({ type: 'error', text: errs ? errs.map((e) => e.msg).join(', ') : err.response?.data?.message || 'Failed' });
    } finally {
      setSubmitting((p) => ({ ...p, withdraw: false }));
    }
  };

  const METHODS = [
    { value: 'airtel_money', label: 'Airtel Money' },
    { value: 'mtn_money', label: 'MTN Money' },
    { value: 'zamtel_kwacha', label: 'Zamtel Kwacha' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'card', label: 'Card (recharge only)' },
  ];

  if (loading) return <div className="page-content"><div className="spinner" /></div>;

  return (
    <div className="page-content">
      <h1 className="page-title">Wallet</h1>

      {/* Balance Overview */}
      {wallet && (
        <div className="wallet-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <p className="label">Available Balance</p>
            <p className="value" style={{ color: '#6c63ff' }}>ZMW {wallet.balance?.toFixed(2)}</p>
          </div>
          <div className="stat-card">
            <p className="label">Reward Balance</p>
            <p className="value" style={{ color: '#22c55e' }}>ZMW {wallet.rewardBalance?.toFixed(2)}</p>
          </div>
          <div className="stat-card">
            <p className="label">Commission</p>
            <p className="value">ZMW {wallet.commissionBalance?.toFixed(2)}</p>
          </div>
          <div className="stat-card">
            <p className="label">Lifetime Earnings</p>
            <p className="value">ZMW {wallet.lifetimeEarnings?.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['overview', 'recharge', 'withdraw'].map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? 'btn-primary' : 'btn-outline'}
            style={{ padding: '8px 18px', textTransform: 'capitalize' }}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="card">
          <h2 style={{ fontWeight: 700, marginBottom: 16 }}>Recent Transactions</h2>
          {transactions.length === 0 ? (
            <p style={{ color: '#6b7280' }}>No transactions yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Description</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx._id}>
                      <td>
                        <span className={`tx-type tx-${tx.type}`}>
                          {TX_LABELS[tx.type] || tx.type}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {tx.type === 'withdraw' ? '-' : '+'}ZMW {tx.amount?.toFixed(2)}
                      </td>
                      <td>
                        <span className={`tx-type tx-${tx.status}`}>{tx.status}</span>
                      </td>
                      <td style={{ color: '#6b7280', fontSize: '0.88rem' }}>{tx.description}</td>
                      <td style={{ color: '#6b7280', fontSize: '0.82rem' }}>
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'recharge' && (
        <div className="card" style={{ maxWidth: 480 }}>
          <h2 style={{ fontWeight: 700, marginBottom: 16 }}>Recharge Wallet</h2>
          <form onSubmit={handleRecharge}>
            <div className="form-group">
              <label>Amount (ZMW) – min ZMW 10</label>
              <input
                type="number"
                min="10"
                step="0.01"
                placeholder="50.00"
                value={rechargeForm.amount}
                onChange={(e) => setRechargeForm({ ...rechargeForm, amount: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Payment Method</label>
              <select
                value={rechargeForm.method}
                onChange={(e) => setRechargeForm({ ...rechargeForm, method: e.target.value })}
              >
                {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Your Phone Number</label>
              <input
                type="tel"
                placeholder="0971234567"
                value={rechargeForm.phone}
                onChange={(e) => setRechargeForm({ ...rechargeForm, phone: e.target.value })}
              />
            </div>
            {rechargeMsg && (
              <p className={rechargeMsg.type === 'success' ? 'success-msg' : 'error-msg'} style={{ marginBottom: 10 }}>
                {rechargeMsg.text}
              </p>
            )}
            <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={submitting.recharge}>
              {submitting.recharge ? <span className="spinner" /> : 'Initiate Recharge'}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'withdraw' && (
        <div className="card" style={{ maxWidth: 480 }}>
          <h2 style={{ fontWeight: 700, marginBottom: 16 }}>Withdraw Funds</h2>
          <p style={{ color: '#6b7280', fontSize: '0.88rem', marginBottom: 14 }}>
            Min withdrawal: ZMW 20. Fee: 5% (2% for VIP members).
          </p>
          <form onSubmit={handleWithdraw}>
            <div className="form-group">
              <label>Amount (ZMW) – min ZMW 20</label>
              <input
                type="number"
                min="20"
                step="0.01"
                placeholder="100.00"
                value={withdrawForm.amount}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Withdrawal Method</label>
              <select
                value={withdrawForm.method}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, method: e.target.value })}
              >
                {METHODS.filter((m) => m.value !== 'card').map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Account Number / Phone</label>
              <input
                type="text"
                placeholder="0971234567"
                value={withdrawForm.accountNumber}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, accountNumber: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Account Name (optional)</label>
              <input
                type="text"
                placeholder="Chanda Mutale"
                value={withdrawForm.accountName}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, accountName: e.target.value })}
              />
            </div>
            {withdrawMsg && (
              <p className={withdrawMsg.type === 'success' ? 'success-msg' : 'error-msg'} style={{ marginBottom: 10 }}>
                {withdrawMsg.text}
              </p>
            )}
            <button type="submit" className="btn-danger" style={{ width: '100%' }} disabled={submitting.withdraw}>
              {submitting.withdraw ? <span className="spinner" /> : 'Request Withdrawal'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
