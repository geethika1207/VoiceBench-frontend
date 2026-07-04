export default function ScoreRing({ score, max = 100, size = 148 }) {
  const value = typeof score === 'number' ? score : 0;
  const pct = Math.max(0, Math.min(1, value / max));
  const radius = (size - 14) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7c5cfc" />
            <stop offset="100%" stopColor="#3fd8c9" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth="10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#scoreGrad)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 34, fontWeight: 600 }}>
          {typeof score === 'number' ? Math.round(score) : '—'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>
          / {max}
        </span>
      </div>
    </div>
  );
}
