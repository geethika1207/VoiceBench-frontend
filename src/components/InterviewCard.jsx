import { Link } from 'react-router-dom';
import DifficultyBadge from './DifficultyBadge';
import { formatDate } from '../utils/format';

export default function InterviewCard({ item, onDelete, deleting }) {
  return (
    <div className="interview-card card">
      <div className="interview-card-top">
        <div>
          <h3 style={{ fontSize: 16, marginBottom: 4 }}>{item.title}</h3>
          <p style={{ fontSize: 13 }}>{formatDate(item.date)}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="interview-card-score">{typeof item.score === 'number' ? Math.round(item.score) : '—'}</div>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>score</span>
        </div>
      </div>

      <div className="interview-card-mid">
        <DifficultyBadge value={item.difficulty} />
        {item.topic && <span className="badge badge-violet">{item.topic}</span>}
      </div>

      <div className="interview-card-actions">
        <Link to={`/history/${item.id}`} className="btn btn-ghost" style={{ flex: 1 }}>
          View report
        </Link>
        <button
          className="btn btn-danger"
          onClick={() => onDelete(item.id)}
          disabled={deleting}
          aria-label="Delete interview"
        >
          {deleting ? '…' : 'Delete'}
        </button>
      </div>

      <style>{`
        .interview-card {
          padding: 22px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          transition: transform 0.25s var(--ease-out), border-color 0.25s var(--ease-out), box-shadow 0.25s var(--ease-out);
        }
        .interview-card:hover {
          transform: translateY(-4px);
          border-color: var(--border-strong);
          box-shadow: var(--shadow-soft);
        }
        .interview-card-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .interview-card-score {
          font-family: var(--font-mono);
          font-size: 22px;
          font-weight: 600;
          background: var(--gradient-primary);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .interview-card-mid {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .interview-card-actions {
          display: flex;
          gap: 10px;
        }
      `}</style>
    </div>
  );
}
