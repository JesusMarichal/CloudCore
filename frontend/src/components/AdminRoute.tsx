import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../services/session-context';

/**
 * Deja pasar solo a las cuentas ADMIN.
 *
 * El rol sale de `useSession()`, que lo confirma contra la base de datos, no del
 * usuario guardado en el navegador. Además revalida al entrar en cada ruta de
 * admin, para que una degradación de rol tenga efecto en cuanto navegas y no al
 * caducar el token.
 *
 * Sigue siendo una comodidad de la interfaz: cada ruta /admin del backend
 * comprueba el rol por su cuenta (AdminGuard).
 */
const AdminRoute = () => {
    const { role, loading, refresh } = useSession();
    const location = useLocation();

    useEffect(() => { void refresh(); }, [location.pathname, refresh]);

    // Sin confirmar todavía: no se redirige, para no expulsar a un admin
    // legítimo por un parpadeo mientras responde el servidor.
    if (loading) return null;
    if (role !== 'ADMIN') return <Navigate to="/dashboard" replace />;
    return <Outlet />;
};

export default AdminRoute;
