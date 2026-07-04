import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <Link to="/" className="navbar-brand">
          <span className="navbar-mark" />
          Voicebench
        </Link>

        {isAuthenticated ? (
          <nav className="navbar-links">
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/history">History</Link>
            <button
              className="btn btn-ghost"
              onClick={() => {
                logout();
                navigate('/');
              }}
            >
              Log out
            </button>
          </nav>
        ) : (
          <nav className="navbar-links">
            <Link to="/login">Log in</Link>
            <Link to="/register" className="btn btn-primary">
              Get started
            </Link>
          </nav>
        )}
      </div>

      <style>{`
        .navbar {
          padding: 20px 0;
          position: sticky;
          top: 0;
          z-index: 40;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          background: rgba(8, 8, 11, 0.6);
          border-bottom: 1px solid var(--border);
        }
        .navbar-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .navbar-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          font-family: var(--font-display);
          font-weight: 600;
          font-size: 18px;
        }
        .navbar-mark {
          width: 22px;
          height: 22px;
          border-radius: 7px;
          background: var(--gradient-primary);
          display: inline-block;
        }
        .navbar-links {
          display: flex;
          align-items: center;
          gap: 24px;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-secondary);
        }
        .navbar-links a:hover {
          color: var(--text-primary);
        }
      `}</style>
    </header>
  );
}
