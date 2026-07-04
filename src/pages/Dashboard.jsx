import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import InterviewCard from '../components/InterviewCard';
import { getHistory, deleteInterview } from '../api/interview';

export default function Dashboard() {
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getHistory()
      .then((items) => {
        if (!cancelled) setInterviews(items);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
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

  const recent = interviews.slice(0, 3);

  return (
    <div className="page-shell">
      <Navbar />
      <main className="page-main">
        <div className="container">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <h1 style={{ fontSize: 32 }}>Welcome back</h1>
            <p style={{ marginTop: 8, fontSize: 15 }}>
              Ready for another round? Start a fresh interview or review your progress.
            </p>
          </motion.div>

          <div className="dashboard-actions">
            <Link to="/interview/start" className="btn btn-primary">
              Start new interview
            </Link>
            <Link to="/history" className="btn btn-ghost">
              View full history
            </Link>
          </div>

          <section style={{ marginTop: 48 }}>
            <h2 style={{ fontSize: 19, marginBottom: 18 }}>Recent interviews</h2>

            {loading && <SkeletonRow />}
            {!loading && error && <p className="error-text">{error}</p>}
            {!loading && !error && recent.length === 0 && (
              <div className="card empty-state">
                <p>No interviews yet. Start your first one above.</p>
              </div>
            )}
            {!loading && !error && recent.length > 0 && (
              <div className="dashboard-grid">
                {recent.map((item) => (
                  <InterviewCard
                    key={item.id}
                    item={item}
                    onDelete={handleDelete}
                    deleting={deletingId === item.id}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <style>{`
        .dashboard-actions {
          display: flex;
          gap: 14px;
          margin-top: 28px;
          flex-wrap: wrap;
        }
        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 18px;
        }
        .empty-state {
          padding: 40px;
          text-align: center;
        }
        @media (max-width: 900px) {
          .dashboard-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 600px) {
          .dashboard-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="dashboard-grid">
      {[0, 1, 2].map((i) => (
        <div key={i} className="card skeleton-card" />
      ))}
      <style>{`
        .skeleton-card {
          height: 160px;
          background: linear-gradient(90deg, var(--surface) 0%, var(--bg-elevated) 50%, var(--surface) 100%);
          background-size: 200% 100%;
          animation: shimmer 1.4s ease-in-out infinite;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
