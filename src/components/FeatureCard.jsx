export default function FeatureCard({ icon, title, description }) {
  return (
    <div className="feature-card card">
      <div className="feature-icon">{icon}</div>
      <h3 style={{ fontSize: 17, marginBottom: 8 }}>{title}</h3>
      <p style={{ fontSize: 14 }}>{description}</p>

      <style>{`
        .feature-card {
          padding: 26px;
          transition: border-color 0.25s var(--ease-out), transform 0.25s var(--ease-out);
        }
        .feature-card:hover {
          border-color: var(--border-strong);
          transform: translateY(-3px);
        }
        .feature-icon {
          width: 40px;
          height: 40px;
          border-radius: var(--r-sm);
          background: var(--accent-violet-soft);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
          font-size: 18px;
        }
      `}</style>
    </div>
  );
}
