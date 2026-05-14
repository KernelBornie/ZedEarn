import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

export default function Dashboard() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadDashboard = () =>
    Promise.all([
      api.get('/api/wallet'),
      api.get('/api/notifications?limit=5'),
    ])
      .then(([wRes, nRes]) => {
        setWallet(wRes.data.wallet);
        setNotifications(nRes.data.notifications || []);
      });

  useEffect(() => {
    loadDashboard()
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleRefresh = () => {
      loadDashboard().catch(console.error);
    };
    window.addEventListener('wallet:refresh', handleRefresh);
    return () => window.removeEventListener('wallet:refresh', handleRefresh);
  }, []);

  const vipBadge = (tier) => <span className={`badge badge-${tier}`}>{tier === 'none' ? 'Free' : tier}</span>;

  if (loading) return <div className="page-content"><div className="spinner" /></div>;

  return (
    <div className="page-content">
      <h1 className="page-title">Dashboard</h1>

      {/* User greeting */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ fontSize: '1.1rem', fontWeight: 700 }}>👋 Welcome back, {user?.name}!</p>
            <p style={{ color: '#6b7280', fontSize: '0.88rem', marginTop: 4 }}>
              Level {user?.level} · {user?.xpPoints?.toLocaleString()} XP · {vipBadge(user?.vipTier || 'none')}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '0.82rem', color: '#6b7280' }}>Referral Code</p>
            <p style={{ fontWeight: 800, fontSize: '1.1rem', color: '#6c63ff', letterSpacing: 2 }}>
              {user?.referralCode}
            </p>
          </div>
        </div>
      </div>

      {/* Wallet Stats */}
      {wallet && (
        <div className="stats-grid">
          <div className="stat-card">
            <p className="label">Total Balance</p>
            <p className="value" style={{ color: '#6c63ff' }}>ZMW {wallet.balance?.toFixed(2)}</p>
            <p className="sub">Available to use</p>
          </div>
          <div className="stat-card">
            <p className="label">Reward Balance</p>
            <p className="value" style={{ color: '#22c55e' }}>ZMW {wallet.rewardBalance?.toFixed(2)}</p>
            <p className="sub">From task earnings</p>
          </div>
          <div className="stat-card">
            <p className="label">Lifetime Earnings</p>
            <p className="value">ZMW {wallet.lifetimeEarnings?.toFixed(2)}</p>
            <p className="sub">Total earned ever</p>
          </div>
          <div className="stat-card">
            <p className="label">Commission</p>
            <p className="value">ZMW {wallet.commissionBalance?.toFixed(2)}</p>
            <p className="sub">Referral commissions</p>
          </div>
        </div>
      )}

      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="card">
          <h2 style={{ fontWeight: 700, marginBottom: 14 }}>Recent Notifications</h2>
          {notifications.map((n) => (
            <div
              key={n._id}
              style={{
                padding: '10px 0',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
              }}
            >
              <span style={{ fontSize: '1.2rem' }}>
                {n.type === 'reward' ? '🏆' : n.type === 'success' ? '✅' : n.type === 'warning' ? '⚠️' : '🔔'}
              </span>
              <div>
                <p style={{ fontWeight: 600, fontSize: '0.92rem' }}>{n.title}</p>
                <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>{n.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
