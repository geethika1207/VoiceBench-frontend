import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import { startInterview } from '../api/interview';

const SUGGESTIONS = ['Backend Developer', 'FastAPI', 'System Design', 'React', 'Machine Learning'];

export default function StartInterview() {
  const [concept, setConcept] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!concept.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await startInterview(concept.trim());
      if (!result?.interviewId) {
        throw new Error('The interview started but no interview ID was returned. Check the backend response shape.');
      }
      navigate(`/interview/${result.interviewId}`, { state: { firstQuestion: result } });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="page-shell">
      <Navbar />
      <main className="page-main start-main">
        <motion.div
          className="card start-card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <span className="badge badge-violet">New interview</span>
          <h1 style={{ fontSize: 28, marginTop: 16 }}>What do you want to be interviewed on?</h1>
          <p style={{ marginTop: 8, fontSize: 14 }}>
            Pick a topic and your AI interviewer will adapt questions to your level as you go.
          </p>

          <form onSubmit={handleSubmit} style={{ marginTop: 28 }}>
            <div className="field">
              <label htmlFor="concept">Interview topic</label>
              <input
                id="concept"
                required
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder="e.g. FastAPI, System Design, React…"
                autoFocus
              />
            </div>

            <div className="suggestion-row">
              {SUGGESTIONS.map((s) => (
                <button
                  type="button"
                  key={s}
                  className="suggestion-chip"
                  onClick={() => setConcept(s)}
                >
                  {s}
                </button>
              ))}
            </div>

            {error && <p className="error-text" style={{ marginTop: 16 }}>{error}</p>}

            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: 24 }}>
              {loading ? 'Preparing your interviewer…' : 'Start interview'}
            </button>
          </form>
        </motion.div>
      </main>

      <style>{`
        .start-main {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .start-card {
          width: 100%;
          max-width: 480px;
          padding: 40px;
        }
        .suggestion-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 14px;
        }
        .suggestion-chip {
          background: var(--surface-glass);
          border: 1px solid var(--border);
          color: var(--text-secondary);
          border-radius: var(--r-full);
          padding: 7px 14px;
          font-size: 13px;
          transition: border-color 0.2s var(--ease-out), color 0.2s var(--ease-out);
        }
        .suggestion-chip:hover {
          border-color: var(--accent-teal);
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}
