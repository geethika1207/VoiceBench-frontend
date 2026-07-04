import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { ReportBody } from './Report';
import { getInterviewDetail } from '../api/interview';

export default function InterviewDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getInterviewDetail(id)
      .then((r) => !cancelled && setReport(r))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="page-shell">
        <Navbar />
        <main className="page-main container">
          <div className="card" style={{ height: 240, opacity: 0.5 }} />
        </main>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="page-shell">
        <Navbar />
        <main className="page-main" style={{ display: 'flex', justifyContent: 'center' }}>
          <div className="card" style={{ padding: 40, maxWidth: 440, textAlign: 'center' }}>
            <h2 style={{ fontSize: 22 }}>Couldn't load this interview</h2>
            <p style={{ marginTop: 12 }}>{error}</p>
            <button className="btn btn-primary" style={{ marginTop: 24 }} onClick={() => navigate('/history')}>
              Back to history
            </button>
          </div>
        </main>
      </div>
    );
  }

  return <ReportBody report={report} onDone={() => navigate('/history')} />;
}
