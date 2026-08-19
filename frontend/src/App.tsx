import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './views/Landing/Landing';
import Login from './views/Login/Login';
import Register from './views/Register/Register';
import ResetPassword from './views/ResetPassword/ResetPassword';
import Dashboard from './views/Dashboard/Dashboard';
import Servidores from './views/Servidores/Servidores';
import Websites from './views/Websites/Websites';
import DatabaseView from './views/Database/Database';
import Settings from './views/settings/Settings';
import Profile from './views/Profile/Profile';
import Terminal from './views/Terminal/Terminal';
import Billing from './views/Billing/Billing';
import ProtectedRoute from './components/ProtectedRoute';
import { I18nProvider } from './i18n';
import './styles/global.css';

function App() {
  return (
    <I18nProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />}>
              <Route path="servers" element={<Servidores />} />
              <Route path="websites" element={<Websites />} />
              <Route path="databases" element={<DatabaseView />} />
              <Route path="terminal" element={<Terminal />} />
              <Route path="billing" element={<Billing />} />
              <Route path="settings" element={<Settings />} />
              <Route path="profile" element={<Profile />} />
            </Route>
          </Route>

          {/* Redirigir cualquier otra ruta a login */}
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </Router>
    </I18nProvider>
  );
}

export default App;
