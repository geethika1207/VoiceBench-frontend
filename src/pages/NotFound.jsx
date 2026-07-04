import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';

export default function NotFound() {
  return (
    <div className="page-shell">
      <Navbar />
      <main className="page-main" style={{ display: 'flex', justifyContent: 'center', textAlign: 'center' }}>
        <div>
          <h1 style={{ fontSize: 60 }}>404</h1>
          <p style={{ marginTop: 12 }}>This page doesn't exist.</p>
          <Link to="/" className="btn btn-primary" style={{ marginTop: 24, display: 'inline-flex' }}>
            Back home
          </Link>
        </div>
      </main>
    </div>
  );
}
