import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/dashboard', label: '🏠 Dashboard' },
  { to: '/tasks',     label: '✅ Tasks' },
  { to: '/wallet',    label: '💰 Wallet' },
  { to: '/profile',   label: '👤 Profile' },
];

export default function Sidebar() {
  const { logout } = useAuth();
  return (
    <nav className="sidebar">
      <div className="logo">ZedEarn</div>
      {NAV.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => (isActive ? 'active' : '')}
        >
          {label}
        </NavLink>
      ))}
      <button className="logout-btn" onClick={logout}>Sign Out</button>
    </nav>
  );
}
