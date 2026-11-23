import { Routes, Route, Navigate } from 'react-router-dom';
import ProfileSettingsPage from './pages/ProfileSettingsPage.jsx';

/**
 * App — Root router. Extend with more routes as features land.
 */
function App() {
  return (
    <Routes>
      {/* Profile Settings — task-frontend-02 */}
      <Route path="/profile/settings" element={<ProfileSettingsPage />} />

      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/profile/settings" replace />} />

      {/* 404 fallback */}
      <Route
        path="*"
        element={
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <h2>404 — Page not found</h2>
          </div>
        }
      />
    </Routes>
  );
}

export default App;
