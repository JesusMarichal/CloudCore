import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthService } from '../services/auth.service';
import { tokenStorage } from '../services/tokenStorage';
import type { StoredUser } from '../services/tokenStorage';
import { SessionContext } from '../services/session-context';
import type { SessionValue, UserRole } from '../services/session-context';

/** Cada cuánto se revalida el rol estando la pestaña activa. */
const REVALIDATE_MS = 60_000;

/**
 * Fuente única de verdad de la sesión.
 *
 * El rol que decide qué se enseña (opciones del menú, rutas de admin) sale
 * SIEMPRE de `POST /auth/me`, que lo lee de la base de datos. Nunca de
 * localStorage: esa copia la puede editar cualquiera desde el navegador y
 * además se queda obsoleta en cuanto otro admin cambia el rol. De localStorage
 * solo se aprovecha el nombre y el avatar, que no deciden permisos.
 *
 * Se revalida al montar, al volver a la pestaña, cada minuto, y cuando el perfil
 * avisa de que cambió algo.
 */
export const SessionProvider = ({ children }: { children: ReactNode }) => {
    // El usuario cacheado sirve para pintar nombre y avatar sin parpadeo: son
    // datos inofensivos. El ROL no se siembra desde aquí a propósito.
    const [user, setUser] = useState<StoredUser | null>(() => tokenStorage.getUser());
    /**
     * Rol confirmado por el servidor. Arranca en null aunque localStorage diga
     * otra cosa: quien edite `user.role` en el navegador no consigue que se le
     * pinte ni una sola opción de más. El precio es que una entrada exclusiva de
     * un rol aparece cuando responde /auth/me, no antes.
     */
    const [confirmedRole, setConfirmedRole] = useState<UserRole | null>(null);
    // Solo hay que esperar al servidor si de verdad hay una sesión que validar.
    const [loading, setLoading] = useState<boolean>(() => !!tokenStorage.getToken());
    const inFlight = useRef<Promise<void> | null>(null);

    const refresh = useCallback(async () => {
        if (!tokenStorage.getToken()) {
            setUser(null);
            setConfirmedRole(null);
            setLoading(false);
            return;
        }
        // Varias pantallas pueden pedir revalidación a la vez (montaje +
        // navegación); una sola petición sirve a todas.
        if (inFlight.current) return inFlight.current;

        inFlight.current = (async () => {
            try {
                const data = await AuthService.me();
                if (data?.success && data.user) {
                    setUser(data.user);
                    setConfirmedRole(data.user.role === 'ADMIN' ? 'ADMIN' : 'CLIENT');
                    // Mantiene al día la copia que leen las pantallas antiguas.
                    tokenStorage.updateUser(data.user);
                }
            } catch {
                // Un 401 ya lo gestiona el interceptor de httpClient (cierra
                // sesión y manda a /login). Cualquier otro fallo es de red: se
                // conserva lo que había en vez de dejar al usuario sin menú.
            } finally {
                setLoading(false);
                inFlight.current = null;
            }
        })();

        return inFlight.current;
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    useEffect(() => {
        const onFocus = () => { void refresh(); };
        const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisible);
        // El perfil avisa al cambiar avatar o nombre.
        window.addEventListener('cc-user-updated', onFocus);
        // Otra pestaña ha iniciado o cerrado sesión.
        window.addEventListener('storage', onFocus);

        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible') void refresh();
        }, REVALIDATE_MS);

        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('cc-user-updated', onFocus);
            window.removeEventListener('storage', onFocus);
            window.clearInterval(timer);
        };
    }, [refresh]);

    const value = useMemo<SessionValue>(() => ({
        user,
        role: confirmedRole,
        loading,
        refresh,
    }), [user, confirmedRole, loading, refresh]);

    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export default SessionProvider;
