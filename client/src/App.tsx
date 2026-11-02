import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import Auth from './modules/auth/Auth';
import Dashboard from './modules/dashboard/Dashboard';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!localStorage.getItem('token'));

  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={isAuthenticated
            ? <Dashboard onLogout={() => setIsAuthenticated(false)} />
            : <Navigate to="/auth" replace />}
        />
        <Route
          path="/auth"
          element={isAuthenticated
            ? <Navigate to="/" replace />
            : <Auth onLoginSuccess={() => setIsAuthenticated(true)} />}
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;