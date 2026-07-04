import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import ScoreRing from '../components/ScoreRing';
import DifficultyBadge from '../components/DifficultyBadge';

export default function Report() {
  const location = useLocation();
  const navigate = useNavigate();
  const report = location?.state?.report;

  if (!report) {
    return (
      <div className="page-shell">
        <Navbar />
        <main className="page-main" style={{ display: 'flex', justifyContent: 'center' }}>
          <div className="card" style={{ padding: 40, maxWidth: 440, textAlign: 'center' }}>
            <h2 style={{ fontSize: 22 }}>No report to show</h2>
            <p style={{ marginTop: 12 }}>
              Reports appear right after you finish an interview. Check your history for past results.
            </p>
            <button className="btn btn-primary" style={{ marginTop: 24 }} onClick={() => navigate('/history')}>
              Go to history
            </button>
          </div>
        </main>
      </div>
    );
  }

  return <ReportBody report={report} onDone={() => navigate('/dashboard')} />;
}

export function ReportBody({ report, onDone }) {
  return (
    <div className="page-shell">
      <Navbar />
      <main className="page-main">
        <div className="container">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <span className="badge badge-violet">Interview report</span>
            <h1 style={{ fontSize: 30, marginTop: 14 }}>Here's how it went</h1>
          </motion.div>

          <div className="report-summary-grid">
            <div className="card report-score-card">
              <ScoreRing score={report.score} />
              <span style={{ marginTop: 14, fontSize: 13, color: 'var(--text-secondary)' }}>Overall score</span>
            </div>

            <div className="card report-summary-card">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
                <DifficultyBadge value={report.difficulty} />
              </div>
              <p style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.7 }}>
                {report.summary || 'No summary was returned for this interview.'}
              </p>
            </div>
          </div>

          <div className="report-columns">
            <ListCard title="Positive highlights" items={report.positives} tone="teal" />
            <ListCard title="Suggestions for improvement" items={report.suggestions} tone="violet" />
          </div>

          {report.tags?.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <h3 style={{ fontSize: 16, marginBottom: 12 }}>Learning tags</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {report.tags.map((tag, i) => (
                  <span key={i} className="badge badge-violet">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {report.questions?.length > 0 && (
            <div style={{ marginTop: 44 }}>
              <h3 style={{ fontSize: 18, marginBottom: 18 }}>Question breakdown</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {report.questions.map((q) => (
                  <QuestionCard key={q.id} q={q} />
                ))}
              </div>
            </div>
          )}

          {onDone && (
            <button className="btn btn-primary" style={{ marginTop: 40 }} onClick={onDone}>
              Back to dashboard
            </button>
          )}
        </div>
      </main>

      <style>{`
        .report-summary-grid {
          display: grid;
          grid-template-columns: 220px 1fr;
          gap: 18px;
          margin-top: 32px;
        }
        .report-score-card {
          padding: 28px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .report-summary-card {
          padding: 28px;
        }
        .report-columns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
          margin-top: 18px;
        }
        @media (max-width: 760px) {
          .report-summary-grid, .report-columns {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

function ListCard({ title, items, tone }) {
  return (
    <div className="card" style={{ padding: 26 }}>
      <h3 style={{ fontSize: 16, marginBottom: 16 }}>{title}</h3>
      {(!items || items.length === 0) && <p style={{ fontSize: 14 }}>Nothing recorded here.</p>}
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items?.map((item, i) => (
          <li key={i} style={{ display: 'flex', gap: 10, fontSize: 14, color: 'var(--text-primary)' }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                marginTop: 7,
                flexShrink: 0,
                background: tone === 'teal' ? 'var(--accent-teal)' : 'var(--accent-violet)',
              }}
            />
            {typeof item === 'string' ? item : JSON.stringify(item)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuestionCard({ q }) {
  return (
    <details className="card question-card">
      <summary>
        <span>{q.question || 'Question'}</span>
        {typeof q.marks === 'number' && <span className="badge badge-teal">{q.marks} pts</span>}
      </summary>
      <div className="question-card-body">
        {q.answer && (
          <div>
            <span className="qc-label">Your answer</span>
            <p>{q.answer}</p>
          </div>
        )}
        {q.evaluation && (
          <div>
            <span className="qc-label">Evaluation</span>
            <p>{q.evaluation}</p>
          </div>
        )}
      </div>
      <style>{`
        .question-card {
          padding: 20px 24px;
        }
        .question-card summary {
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          font-weight: 600;
          font-size: 15px;
          color: var(--text-primary);
          list-style: none;
        }
        .question-card summary::-webkit-details-marker {
          display: none;
        }
        .question-card-body {
          margin-top: 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .qc-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-tertiary);
        }
        .question-card-body p {
          margin-top: 6px;
          font-size: 14px;
          color: var(--text-secondary);
        }
      `}</style>
    </details>
  );
}
