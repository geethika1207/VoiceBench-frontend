import { difficultyLabel } from '../utils/format';

const COLORS = {
  beginner: 'badge-teal',
  easy: 'badge-teal',
  intermediate: 'badge-warning',
  medium: 'badge-warning',
  advanced: 'badge-danger',
  hard: 'badge-danger',
};

export default function DifficultyBadge({ value }) {
  const key = String(value || '').toLowerCase();
  const cls = COLORS[key] || 'badge-violet';
  return <span className={`badge ${cls}`}>{difficultyLabel(value)}</span>;
}
