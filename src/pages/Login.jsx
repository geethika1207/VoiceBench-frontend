import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, loading, error, setError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const ok = await login(email, password);
    if (ok) {
      const dest = location.state?.from?.pathname || '/dashboard';
      navigate(dest, { replace: true });
    }
  }

  return (
    <div className="page-shell">
      <Navbar />
      <main className="page-main auth-main">
        <motion.div
          className="card auth-card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 style={{ fontSize: 26 }}>Welcome back</h1>
          <p style={{ marginTop: 8, fontSize: 14 }}>Log in to continue practicing.</p>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && <p className="error-text">{error}</p>}

            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Logging in…' : 'Log in'}
            </button>
          </form>

          <p style={{ marginTop: 20, fontSize: 14, textAlign: 'center' }}>
            Don&apos;t have an account? <Link to="/register" style={{ color: 'var(--accent-teal)' }}>Register</Link>
          </p>
        </motion.div>
      </main>

      <style>{`
        .auth-main {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .auth-card {
          width: 100%;
          max-width: 400px;
          padding: 36px;
        }
        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
          margin-top: 26px;
        }
      `}</style>
    </div>
  );
}
