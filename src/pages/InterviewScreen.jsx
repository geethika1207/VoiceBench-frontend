import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import VoiceAvatar from '../components/VoiceAvatar';
import DifficultyBadge from '../components/DifficultyBadge';
import { useInterviewMachine, STATES } from '../hooks/useInterviewMachine';
import { formatTimer } from '../utils/format';
import { getSharedAudioElement } from '../utils/audioUnlock';

const WELCOME_LINES = [
  'Welcome to your AI Mock Interview.',
  'You can answer naturally.',
  'You may ask to increase or decrease difficulty at any time.',
  'Click "End Interview" to receive your complete interview report.',
];

export default function InterviewScreen() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const firstQuestion = location.state?.firstQuestion || null;
  const [topicLabel] = useState(() => firstQuestion?.title || firstQuestion?.topic || 'Live interview');
  const [elapsed, setElapsed] = useState(0);
  const [showIntro, setShowIntro] = useState(true);
  const [fatalError, setFatalError] = useState(null);

  const machine = useInterviewMachine({
    interviewId: id,
    firstQuestion,
    onFinished: (report) =>
      navigate('/report', { state: { report, interviewId: id } }),
    onFatal: (message) => setFatalError(message),
  });

  const {
    state,
    question,
    transcript,
    notice,
    level,
    notifyAiFinishedSpeaking,
    notifyAiAudioFailed,
    notifyRepeatFinished,
    endManually,
    finishAnswering,
  } = machine;

  const audioRef = useRef(null);
  if (!audioRef.current) {
    audioRef.current = getSharedAudioElement();
  }

  useEffect(() => {
    return () => {
      const el = audioRef.current;
      if (el) el.pause();
    };
  }, []);

  // ---- interview timer ----
  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowIntro(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  // ---- subtitle: ONLY the question itself is ever spoken/shown as spoken text. ----
  const spokenText = question?.question || '';
  const [subtitleText, setSubtitleText] = useState('');

  useEffect(() => {
    if (!spokenText) {
      setSubtitleText('');
      return;
    }
    setSubtitleText('');
    let i = 0;
    const speed = Math.max(18, Math.min(45, 2200 / spokenText.length));
    const t = setInterval(() => {
      i += 1;
      setSubtitleText(spokenText.slice(0, i));
      if (i >= spokenText.length) clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [spokenText]);

  // ---- wire onEnded/onError on the shared element imperatively ----
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const isRepeat = state === STATES.REPEAT_QUESTION;
    const onEnded = isRepeat ? notifyRepeatFinished : notifyAiFinishedSpeaking;
    const onError = isRepeat ? notifyRepeatFinished : notifyAiAudioFailed;

    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);
    return () => {
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
    };
  }, [state, notifyAiFinishedSpeaking, notifyAiAudioFailed, notifyRepeatFinished]);

  // ---- play question audio, only while AI_SPEAKING or REPEAT_QUESTION ----
  useEffect(() => {
    const isFirstPlay = state === STATES.AI_SPEAKING;
    const isRepeatPlay = state === STATES.REPEAT_QUESTION;
    if ((!isFirstPlay && !isRepeatPlay) || !question) return;

    const el = audioRef.current;
    if (!el) return;
    const src = question.audioUrl;
    const onDone = isFirstPlay ? notifyAiFinishedSpeaking : notifyRepeatFinished;

    let retryTimer = null;
    let cancelled = false;

    function attemptPlay(isRetry) {
      el.src = src;
      const playPromise = el.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          if (cancelled) return;
          if (!isRetry) {
            retryTimer = setTimeout(() => attemptPlay(true), 300);
          } else {
            onDone();
          }
        });
      }
    }

    if (src) {
      attemptPlay(false);
    } else {
      onDone();
    }

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, question]);

  if (!firstQuestion && !showIntro) {
    return (
      <CenteredMessage
        title="No active interview"
        body="This screen needs a freshly started interview to work from. Head back and start a new one."
        actionLabel="Start an interview"
        onAction={() => navigate('/interview/start')}
      />
    );
  }

  if (state === STATES.FATAL_ERROR) {
    return (
      <CenteredMessage
        title="Something went wrong"
        body={fatalError}
        actionLabel="Back to dashboard"
        onAction={() => navigate('/dashboard')}
      />
    );
  }

  if (state === STATES.SILENCE_ENDED) {
    return (
      <div className="page-shell" style={{ alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
        <div className="card" style={{ padding: 44, maxWidth: 480, textAlign: 'center' }}>
          <h2 style={{ fontSize: 22 }}>Interview ended</h2>
          <p style={{ marginTop: 14 }}>
            The interview has ended because there were no responses for three interview questions. Please start a
            new interview whenever you're ready.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 28, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => navigate('/interview/start')}>
              Start new interview
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/dashboard')}>
              Return to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isSpeakingPhase = state === STATES.AI_SPEAKING || state === STATES.REPEAT_QUESTION;
  const isListeningPhase = state === STATES.LISTENING || state === STATES.SILENCE_WARNING;
  const avatarStatus = isSpeakingPhase ? 'speaking' : isListeningPhase ? 'listening' : 'idle';

return (
  <div className="interview-screen">

    {showIntro && (
      <div className="intro-overlay">
        <div className="intro-highlight">
          <div className="welcome-bubble glass">
            {WELCOME_LINES.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>
      </div>
    )}

    <div className="interview-top container">
      <div className="interview-top-left">
        <span className="interview-topic">{topicLabel}</span>
        <DifficultyBadge value={question?.difficulty} />
      </div>
      <div className="interview-timer">{formatTimer(elapsed)}</div>
    </div>

      {/* Static, unspoken welcome message — shown once on page load, never sent to TTS. */}
      <div className="container">
        <motion.div
          className="welcome-bubble glass"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {WELCOME_LINES.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </motion.div>
      </div>

      <div className="interview-center">
        {!showIntro && question && (
          <VoiceAvatar
            status={avatarStatus}
            level={level}
            onClick={isListeningPhase ? finishAnswering : null}
          />
        )}
        {!showIntro && question && (
        <div className="status-line">
          {state === STATES.AI_SPEAKING && <span className="status-pill pill-violet">Speaking</span>}
          {state === STATES.REPEAT_QUESTION && <span className="status-pill pill-violet">Repeating the question…</span>}
          {state === STATES.LISTENING && <span className="status-pill pill-teal">🎤 Listening…</span>}
          {state === STATES.SILENCE_WARNING && <span className="status-pill pill-teal">🎤 Still listening…</span>}
          {state === STATES.PROCESSING_ANSWER && <span className="status-pill pill-violet">Preparing next question…</span>}
        </div>
        )}

        {!showIntro && question && (
        <AnimatePresence mode="wait">
          <motion.p
            key={spokenText}
            className="interview-question"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
          >
            {subtitleText}
          </motion.p>
        </AnimatePresence>
        )}

        <AnimatePresence>
          {notice && (
            <motion.p
              className="interview-notice"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {notice}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="interview-bottom container">
        <div className="transcript-box glass">
          <span className="transcript-label">Live transcript</span>
          <p className="transcript-text">{transcript || (isListeningPhase ? 'Listening for your answer…' : '—')}</p>
        </div>

        <button
          className="btn btn-danger end-btn"
          onClick={endManually}
          disabled={state === STATES.PROCESSING_ANSWER || state === STATES.INTERVIEW_ENDED || state === STATES.SILENCE_ENDED}
        >
          End interview
        </button>
      </div>

      <style>{`
        .interview-screen {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: var(--gradient-mesh), var(--bg);
        }
        .interview-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 28px 0 0;
        }
        .interview-top-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .interview-topic {
          font-family: var(--font-display);
          font-weight: 600;
          font-size: 15px;
          color: var(--text-primary);
        }
        .interview-timer {
          font-family: var(--font-mono);
          font-size: 15px;
          color: var(--text-secondary);
        }
        .welcome-bubble {
          margin-top: 20px;
          padding: 16px 20px;
          border-radius: var(--r-lg);
          max-width: 480px;
        }
        .welcome-bubble p {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.6;
        }
        .interview-center {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 40px 24px;
          gap: 22px;
        }
        .status-line {
          height: 26px;
        }
        .status-pill {
          font-family: var(--font-mono);
          font-size: 12px;
          padding: 5px 14px;
          border-radius: var(--r-full);
          letter-spacing: 0.03em;
        }
        .pill-violet { background: var(--accent-violet-soft); color: #c3b3ff; }
        .pill-teal { background: var(--accent-teal-soft); color: var(--accent-teal); }
        .interview-question {
          font-family: var(--font-display);
          font-size: clamp(20px, 3.2vw, 30px);
          max-width: 720px;
          color: var(--text-primary);
          min-height: 1.4em;
        }
        .interview-notice {
          max-width: 480px;
          font-size: 14px;
          color: var(--warning);
          background: rgba(245, 166, 35, 0.1);
          border: 1px solid rgba(245, 166, 35, 0.25);
          padding: 10px 18px;
          border-radius: var(--r-full);
        }
        .interview-bottom {
          padding-bottom: 36px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
        }
        .transcript-box {
          width: 100%;
          max-width: 640px;
          border-radius: var(--r-lg);
          padding: 18px 22px;
          min-height: 74px;
        }
        .transcript-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-tertiary);
        }
        .transcript-text {
          margin-top: 8px;
          font-size: 15px;
          color: var(--text-primary);
        }
        .end-btn {
          padding: 13px 32px;
        }
        .voice-avatar {
          position: relative;
          width: 200px;
          height: 200px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .voice-avatar-core {
          width: 128px;
          height: 128px;
          border-radius: 50%;
          overflow: hidden;
          box-shadow: var(--shadow-glow);
        }
        .voice-avatar-ring {
          position: absolute;
          border: 1.5px solid;
          border-radius: 50%;
        }
        .ring-2 {
          width: 164px;
          height: 164px;
        }
        .ring-3 {
          width: 200px;
          height: 200px;
        }
        .intro-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.72);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 110px;
          z-index: 9999;
          animation: fadeIn .25s ease;
        }

        .intro-highlight {
          transform: scale(1.05);
        }

        .intro-highlight .welcome-bubble {
          box-shadow:
            0 0 35px rgba(124,92,252,.45),
            0 0 70px rgba(63,216,201,.25);
        }

        @keyframes fadeIn {
          from {
            opacity:0;
          }
          to{
            opacity:1;
          }
        }
      `}</style>
    </div>
  );
}

function CenteredMessage({ title, body, actionLabel, onAction }) {
  return (
    <div className="page-shell" style={{ alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
      <div className="card" style={{ padding: 40, maxWidth: 440, textAlign: 'center' }}>
        <h2 style={{ fontSize: 22 }}>{title}</h2>
        <p style={{ marginTop: 12 }}>{body}</p>
        <button className="btn btn-primary" style={{ marginTop: 24 }} onClick={onAction}>
          {actionLabel}
        </button>
      </div>
    </div>
  );
}