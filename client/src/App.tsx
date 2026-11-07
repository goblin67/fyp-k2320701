import { useCallback, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';

import Auth from './modules/auth/Auth';
import Dashboard from './modules/dashboard/Dashboard';
import OrganiserPanel from './modules/organiser/OrganiserPanel';
import JoinSession from './modules/sessions/JoinSession';

const SessionJoinRoute = ({
  isAuthenticated,
  onSessionExpired
}: {
  isAuthenticated: boolean;
  onSessionExpired: () => void;
}) => {
  const location = useLocation();
  if (!isAuthenticated) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/auth?next=${encodeURIComponent(next)}`} replace />;
  }
  return <JoinSession onSessionExpired={onSessionExpired} />;
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!localStorage.getItem('token'));
  const [role, setRole] = useState<'player' | 'organiser'>(() =>
    localStorage.getItem('role') === 'organiser' ? 'organiser' : 'player'
  );
  const [organiserAccess, setOrganiserAccess] = useState(() => localStorage.getItem('organiserAccess') === 'true');
  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    localStorage.removeItem('organiserAccess');
    setIsAuthenticated(false);
    setRole('player');
    setOrganiserAccess(false);
  }, []);

  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={isAuthenticated
            ? role === 'organiser'
              ? <OrganiserPanel onLogout={handleLogout} />
              : <Dashboard onLogout={handleLogout} hasOrganiserAccess={organiserAccess} />
            : <Navigate to="/auth" replace />}
        />
        <Route
          path="/auth"
          element={isAuthenticated
            ? <Navigate to="/" replace />
            : <Auth onLoginSuccess={(nextRole, nextOrganiserAccess) => {
              setRole(nextRole);
              setOrganiserAccess(nextOrganiserAccess);
              setIsAuthenticated(true);
            }} />}
        />
        <Route
          path="/join/:sessionId"
          element={<SessionJoinRoute isAuthenticated={isAuthenticated} onSessionExpired={handleLogout} />}
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;