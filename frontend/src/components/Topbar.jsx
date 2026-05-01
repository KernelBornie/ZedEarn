import { useAuth } from '../context/AuthContext';

export default function Topbar() {
  const { user } = useAuth();
  return (
    <header className="topbar">
      <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>
        Zambia's #1 Earning Platform
      </span>
      <div className="user-info">
        <span className={`badge badge-${user?.vipTier || 'none'}`}>
          {user?.vipTier === 'none' || !user?.vipTier ? 'Free' : user.vipTier}
        </span>
        <span>{user?.name}</span>
        <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>
          Lvl {user?.level} · {user?.xpPoints?.toLocaleString()} XP
        </span>
      </div>
    </header>
  );
}
