export function formatTimer(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function difficultyLabel(value) {
  if (!value) return 'Beginner'; // backend defaults new interviews to "Beginner" server-side
  return String(value).charAt(0).toUpperCase() + String(value).slice(1).toLowerCase();
}
