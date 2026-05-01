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

  if (!user) return null;

  const tier = user.vipTier || 'none';
  const perks = VIP_PERKS[tier] || VIP_PERKS.none;

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
        <button className="btn-danger" onClick={logout}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
