import { motion } from 'framer-motion';

/**
 * The signature visual element of the product: a set of concentric rings
 * that pulse to the live volume level while the AI speaks or the user talks.
 * status: 'idle' | 'speaking' | 'listening' | 'thinking'
 * level: 0..1 live volume, used to scale the rings while listening.
 * onClick: optional — when provided and status === 'listening', the whole
 *   avatar becomes a clickable button (manual "finish answering"), with no
 *   text label; the mic icon itself is the affordance.
 */
export default function VoiceAvatar({ status = 'idle', level = 0, onClick = null }) {
  const isActive = status === 'speaking' || status === 'listening';
  const isClickable = status === 'listening' && typeof onClick === 'function';
  const color = status === 'listening' ? 'var(--accent-teal)' : 'var(--accent-violet)';
  const scale = 1 + Math.min(level, 1) * 0.35;

  const content = (
    <div className="voice-avatar" aria-hidden={!isClickable}>
      <motion.div
        className="voice-avatar-ring ring-3"
        style={{ borderColor: color }}
        animate={isActive ? { scale: [1, 1.15, 1], opacity: [0.15, 0.3, 0.15] } : { scale: 1, opacity: 0.1 }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="voice-avatar-ring ring-2"
        style={{ borderColor: color }}
        animate={isActive ? { scale: [1, 1.1, 1], opacity: [0.25, 0.45, 0.25] } : { scale: 1, opacity: 0.15 }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.15 }}
      />
      <motion.div
        className="voice-avatar-core"
        animate={{ scale: status === 'listening' ? scale : isActive ? [1, 1.06, 1] : 1 }}
        transition={
          status === 'listening'
            ? { duration: 0.12, ease: 'easeOut' }
            : { duration: 1.4, repeat: isActive ? Infinity : 0, ease: 'easeInOut' }
        }
      >
        <svg viewBox="0 0 120 120" width="100%" height="100%">
          <defs>
            <linearGradient id="avatarGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7c5cfc" />
              <stop offset="100%" stopColor="#3fd8c9" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="58" fill="url(#avatarGrad)" />
          <g>
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.rect
                key={i}
                x={38 + i * 10}
                y="45"
                width="5"
                height="30"
                rx="2.5"
                fill="rgba(8,8,11,0.85)"
                animate={
                  isActive
                    ? { height: [12, 30, 16, 26, 12], y: [54, 45, 52, 47, 54] }
                    : { height: 12, y: 54 }
                }
                transition={{
                  duration: 1.1,
                  repeat: isActive ? Infinity : 0,
                  ease: 'easeInOut',
                  delay: i * 0.12,
                }}
              />
            ))}
          </g>
        </svg>
      </motion.div>

      <style>{`
        .voice-avatar-clickable {
          cursor: pointer;
          background: none;
          border: none;
          padding: 0;
          transition: transform 0.15s ease-out;
        }
        .voice-avatar-clickable:hover .voice-avatar-core {
          filter: brightness(1.08);
        }
        .voice-avatar-clickable:active {
          transform: scale(0.97);
        }
      `}</style>
    </div>
  );

  if (isClickable) {
    return (
      <button
        type="button"
        className="voice-avatar-clickable"
        onClick={onClick}
        aria-label="Finish answering"
        title="Tap when you're done answering"
      >
        {content}
      </button>
    );
  }

  return content;
}