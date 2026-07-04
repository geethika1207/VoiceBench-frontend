import { Routes, Route } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import StartInterview from './pages/StartInterview';
import InterviewScreen from './pages/InterviewScreen';
import Report from './pages/Report';
import History from './pages/History';
import InterviewDetail from './pages/InterviewDetail';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/interview/start"
        element={
          <ProtectedRoute>
            <StartInterview />
          </ProtectedRoute>
        }
      />
      <Route
        path="/interview/:id"
        element={
          <ProtectedRoute>
            <InterviewScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/report"
        element={
          <ProtectedRoute>
            <Report />
          </ProtectedRoute>
        }
      />
      <Route
        path="/history"
        element={
          <ProtectedRoute>
            <History />
          </ProtectedRoute>
        }
      />
      <Route
        path="/history/:id"
        element={
          <ProtectedRoute>
            <InterviewDetail />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
