import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import InterviewCard from '../components/InterviewCard';
import { getHistory, deleteInterview } from '../api/interview';

export default function History() {
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getHistory()
      .then((items) => !cancelled && setInterviews(items))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDelete(id) {
    setDeletingId(id);
    try {
      await deleteInterview(id);
      setInterviews((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="page-shell">
      <Navbar />
      <main className="page-main">
        <div className="container">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <h1 style={{ fontSize: 30 }}>Interview history</h1>
            <p style={{ marginTop: 8 }}>Every session you've completed, with scores and reports.</p>
          </motion.div>

          <div style={{ marginTop: 32 }}>
            {loading && <Skeleton />}
            {!loading && error && <p className="error-text">{error}</p>}
            {!loading && !error && interviews.length === 0 && (
              <div className="card" style={{ padding: 44, textAlign: 'center' }}>
                <p>No interviews yet.</p>
                <Link to="/interview/start" className="btn btn-primary" style={{ marginTop: 20, display: 'inline-flex' }}>
                  Start your first interview
                </Link>
              </div>
            )}
            {!loading && !error && interviews.length > 0 && (
              <div className="history-grid">
                {interviews.map((item) => (
                  <InterviewCard key={item.id} item={item} onDelete={handleDelete} deleting={deletingId === item.id} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <style>{`
        .history-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 18px;
        }
        @media (max-width: 900px) {
          .history-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 600px) {
          .history-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="history-grid">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="card" style={{ height: 160, opacity: 0.5 }} />
      ))}
      <style>{`
        .history-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        @media (max-width: 900px) { .history-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 600px) { .history-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
