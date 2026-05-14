import { useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const VIP_PERKS = {
  none:     { tasks: 20, multiplier: '1×', support: 'Community', fee: '5%' },
  silver:   { tasks: 25, multiplier: '1.1×', support: 'Standard', fee: '4%' },
  gold:     { tasks: 50, multiplier: '1.25×', support: 'Priority', fee: '3%' },
  platinum: { tasks: 100, multiplier: '1.5×', support: 'Priority', fee: '2%' },
  diamond:  { tasks: '∞', multiplier: '2×', support: 'Dedicated', fee: '2%' },
};

export default function Profile() {
  const { user, logout } = useAuth();
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const passwordPolicy = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

  if (!user) return null;

  const tier = user.vipTier || 'none';
  const perks = VIP_PERKS[tier] || VIP_PERKS.none;

  const handlePasswordChange = (e) => {
    setPasswordForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordError('All password fields are required.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (!passwordPolicy.test(passwordForm.newPassword)) {
      setPasswordError('Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.');
      return;
    }
    if (passwordForm.currentPassword === passwordForm.newPassword) {
      setPasswordError('New password must be different from the current password.');
      return;
    }

    setPasswordLoading(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordSuccess('Password updated successfully. Please sign in again.');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => logout(), 1200);
    } catch (err) {
      const apiErrors = err.response?.data?.errors;
      if (apiErrors?.length) {
        setPasswordError(apiErrors.map((error) => error.msg).join(', '));
      } else {
        setPasswordError(err.response?.data?.message || 'Failed to update password.');
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="page-content">
      <h1 className="page-title">My Profile</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
        {/* Account Info */}
        <div className="card">
          <h2 style={{ fontWeight: 700, marginBottom: 16 }}>Account Info</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              ['Name', user.name],
              ['Email', user.email || '—'],
              ['Phone', user.phone || '—'],
              ['Role', user.role],
              ['KYC Status', user.kycStatus],
              ['Member Since', new Date(user.createdAt || Date.now()).toLocaleDateString()],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                <span style={{ color: '#6b7280', fontSize: '0.88rem' }}>{label}</span>
                <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Earn Stats */}
        <div className="card">
          <h2 style={{ fontWeight: 700, marginBottom: 16 }}>Earning Stats</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              ['Level', user.level],
              ['XP Points', user.xpPoints?.toLocaleString()],
              ['Streak', `${user.streakCount || 0} days`],
              ['Balance', `ZMW ${user.balance?.toFixed(2)}`],
              ['Lifetime Earnings', `ZMW ${user.lifetimeEarnings?.toFixed(2)}`],
              ['Referral Code', user.referralCode],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                <span style={{ color: '#6b7280', fontSize: '0.88rem' }}>{label}</span>
                <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* VIP Status */}
        <div className="card">
          <h2 style={{ fontWeight: 700, marginBottom: 12 }}>VIP Status</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span className={`badge badge-${tier}`} style={{ fontSize: '1rem', padding: '6px 18px' }}>
              {tier === 'none' ? 'Free Tier' : `${tier.charAt(0).toUpperCase() + tier.slice(1)} VIP`}
            </span>
            {user.vipExpiry && (
              <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                Expires: {new Date(user.vipExpiry).toLocaleDateString()}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['Daily Tasks', perks.tasks],
              ['Reward Multiplier', perks.multiplier],
              ['Withdrawal Fee', perks.fee],
              ['Support Level', perks.support],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                <span style={{ color: '#6b7280', fontSize: '0.88rem' }}>{label}</span>
                <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 28 }}>
        <div className="card" style={{ maxWidth: 520 }}>
          <h2 style={{ fontWeight: 700, marginBottom: 16 }}>Change Password</h2>
          <form onSubmit={handlePasswordSubmit}>
            <div className="form-group">
              <label>Current Password</label>
              <input
                type="password"
                name="currentPassword"
                value={passwordForm.currentPassword}
                onChange={handlePasswordChange}
                required
              />
            </div>
            <div className="form-group">
              <label>New Password</label>
              <input
                type="password"
                name="newPassword"
                value={passwordForm.newPassword}
                onChange={handlePasswordChange}
                required
              />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                name="confirmPassword"
                value={passwordForm.confirmPassword}
                onChange={handlePasswordChange}
                required
              />
            </div>
            {passwordError && <p className="error-msg">{passwordError}</p>}
            {passwordSuccess && <p className="success-msg">{passwordSuccess}</p>}
            <button type="submit" className="btn-primary" disabled={passwordLoading}>
              {passwordLoading ? <span className="spinner" /> : 'Change Password'}
            </button>
          </form>
        </div>
        <div style={{ marginTop: 16 }}>
          <button className="btn-danger" onClick={logout}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
