import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './views/Login/Login';
import Dashboard from './views/Dashboard/Dashboard';
import Servidores from './views/Servidores/Servidores';
import './styles/global.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />}>
          <Route path="servers" element={<Servidores />} />
          <Route path="terminal" element={null} />
          <Route path="settings" element={null} />
        </Route>

        {/* Redirigir cualquier otra ruta a login */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;
