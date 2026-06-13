import React, { useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

/**
 * Top navigation bar containing links to Dashboard, displaying logged user, and Logout triggers.
 */
export default function Navbar() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogoutClick = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav style={{
      background: 'rgba(15, 15, 35, 0.6)',
      backdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      padding: '16px 0'
    }}>
      <div className="container d-flex justify-between align-center">
        <Link to="/" style={{ fontSize: '22px', fontWeight: '800', color: '#ffffff', letterSpacing: '0.5px' }}>
          Fair<span style={{ color: 'var(--primary-color)' }}>Share</span>
        </Link>

        {user && (
          <div className="d-flex align-center gap-20">
            <Link to="/" style={{ color: 'var(--text-color)', fontWeight: '500' }}>Dashboard</Link>
            <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              Hello, <strong style={{ color: '#ffffff' }}>{user.name}</strong>
            </span>
            <button onClick={handleLogoutClick} className="btn btn-secondary btn-sm">
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
