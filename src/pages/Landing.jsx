import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import FeatureCard from '../components/FeatureCard';
import { useAuth } from '../context/AuthContext';

export default function Landing() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="page-shell landing">
      <Navbar />

      <main className="page-main">
        <section className="hero container">
          <motion.span
            className="badge badge-violet"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            Adaptive · Voice-first · Instant feedback
          </motion.span>

          <motion.h1
            className="hero-title"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
          >
            Master Any Topic Through Real-Time AI Voice Conversations
          </motion.h1>

          <motion.p
            className="hero-subtitle"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12 }}
          >
            Practice topic-focused voice conversations with an adaptive AI interviewer. 
            Receive automatic evaluation, detailed performance reports, and complete interview history.
          </motion.p>

          <motion.div
            className="hero-actions"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18 }}
          >
            <Link to={isAuthenticated ? '/interview/start' : '/register'} className="btn btn-primary">
              Start interview
            </Link>
            {!isAuthenticated && (
              <>
                <Link to="/login" className="btn btn-ghost">
                  Log in
                </Link>
                <Link to="/register" className="btn btn-ghost">
                  Register
                </Link>
              </>
            )}
          </motion.div>

          <motion.div
            className="hero-waveform"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            aria-hidden="true"
          >
            <svg viewBox="0 0 800 80" width="100%" height="80" preserveAspectRatio="none">
              {Array.from({ length: 64 }).map((_, i) => {
                const h = 8 + Math.abs(Math.sin(i * 0.5)) * 55 + Math.random() * 8;
                return (
                  <motion.rect
                    key={i}
                    x={i * 12.5}
                    width="6"
                    rx="3"
                    fill={i % 2 === 0 ? '#7c5cfc' : '#3fd8c9'}
                    initial={{ height: 4, y: 38 }}
                    animate={{ height: h, y: 40 - h / 2 }}
                    transition={{ duration: 1.6, repeat: Infinity, repeatType: 'reverse', delay: i * 0.02, ease: 'easeInOut' }}
                  />
                );
              })}
            </svg>
          </motion.div>
        </section>

        <section className="container features-grid">
          <FeatureCard
            icon="🎙"
            title="Voice conversations"
            description="Speak your answers naturally — no typing, no forms, just a real conversation."
          />
          <FeatureCard
            icon="📈"
            title="Adaptive difficulty"
            description="Questions adjust in real time based on how you're performing."
          />
          <FeatureCard
            icon="⚡"
            title="Instant feedback"
            description="Get evaluated the moment you finish, not days later."
          />
          <FeatureCard
            icon="📋"
            title="Interview reports"
            description="Detailed breakdowns with scores, highlights, and suggestions for every session."
          />
        </section>
      </main>

      <style>{`
        .hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding-top: 64px;
          padding-bottom: 40px;
          position: relative;
        }
        .landing::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 720px;
          background: var(--gradient-mesh);
          pointer-events: none;
          z-index: 0;
        }
        .hero-title {
          font-size: clamp(34px, 5.4vw, 62px);
          max-width: 820px;
          margin-top: 24px;
        }
        .hero-subtitle {
          max-width: 560px;
          font-size: 17px;
          margin-top: 20px;
        }
        .hero-actions {
          display: flex;
          gap: 14px;
          margin-top: 34px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .hero-waveform {
          margin-top: 64px;
          max-width: 800px;
          width: 100%;
          opacity: 0.85;
        }
        .features-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 18px;
          margin-top: 40px;
          position: relative;
          z-index: 1;
        }
        @media (max-width: 900px) {
          .features-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 520px) {
          .features-grid {
            grid-template-columns: 1fr;
          }
          .hero {
            padding-top: 40px;
          }
        }
      `}</style>
    </div>
  );
}
