import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import Auth from './modules/auth/Auth';
import Dashboard from './modules/dashboard/Dashboard';
import OrganiserPanel from './modules/organiser/OrganiserPanel';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!localStorage.getItem('token'));
  const [role, setRole] = useState<'player' | 'organiser'>(() =>
    localStorage.getItem('role') === 'organiser' ? 'organiser' : 'player'
  );
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    setIsAuthenticated(false);
    setRole('player');
  };

  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={isAuthenticated
            ? role === 'organiser'
              ? <OrganiserPanel onLogout={handleLogout} />
              : <Dashboard onLogout={handleLogout} />
            : <Navigate to="/auth" replace />}
        />
        <Route
          path="/auth"
          element={isAuthenticated
            ? <Navigate to="/" replace />
            : <Auth onLoginSuccess={(nextRole) => {
              setRole(nextRole);
              setIsAuthenticated(true);
            }} />}
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;