import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthService } from '../services/auth.service';
import { tokenStorage, SESSION_CHANGED_EVENT } from '../services/tokenStorage';
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
 * además se queda obsoleta en cuanto otro admin cambia el rol.
 *
 * El nombre y el avatar sí se siembran del cacheado: no deciden permisos y
 * evitan que la cabecera parpadee en "Usuario" nada más entrar.
 *
 * Se revalida al iniciar y cerrar sesión, al montar, al volver a la pestaña,
 * cada minuto, y cuando el perfil avisa de que cambió algo.
 */
export const SessionProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<StoredUser | null>(() => tokenStorage.getUser());
    /**
     * Rol confirmado por el servidor. Arranca en null aunque localStorage diga
     * otra cosa: quien edite `user.role` en el navegador no consigue que se le
     * pinte ni una sola opción de más.
     */
    const [confirmedRole, setConfirmedRole] = useState<UserRole | null>(null);
    const [hasToken, setHasToken] = useState<boolean>(() => !!tokenStorage.getToken());
    const inFlight = useRef<Promise<void> | null>(null);

    const refresh = useCallback(async () => {
        const token = tokenStorage.getToken();
        setHasToken(!!token);

        if (!token) {
            setUser(null);
            setConfirmedRole(null);
            return;
        }

        // Recién iniciada la sesión el provider aún no tiene usuario: se coge el
        // del almacenamiento para que el nombre salga ya, mientras se confirma.
        setUser((prev) => prev ?? tokenStorage.getUser());

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
                inFlight.current = null;
            }
        })();

        return inFlight.current;
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    useEffect(() => {
        const onChange = () => { void refresh(); };
        const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
        // Login y logout en esta misma pestaña. `navigate()` no remonta el
        // provider, así que sin este aviso se quedaría creyendo que no hay
        // sesión y la cabecera mostraría "Usuario".
        window.addEventListener(SESSION_CHANGED_EVENT, onChange);
        window.addEventListener('focus', onChange);
        document.addEventListener('visibilitychange', onVisible);
        // El perfil avisa al cambiar avatar o nombre.
        window.addEventListener('cc-user-updated', onChange);
        // Otra pestaña ha iniciado o cerrado sesión.
        window.addEventListener('storage', onChange);

        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible') void refresh();
        }, REVALIDATE_MS);

        return () => {
            window.removeEventListener(SESSION_CHANGED_EVENT, onChange);
            window.removeEventListener('focus', onChange);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('cc-user-updated', onChange);
            window.removeEventListener('storage', onChange);
            window.clearInterval(timer);
        };
    }, [refresh]);

    const value = useMemo<SessionValue>(() => ({
        user,
        role: confirmedRole,
        // Hay sesión pero el servidor todavía no ha dicho qué rol es. Derivarlo
        // así, en vez de con un flag suelto, evita que la revalidación de cada
        // minuto devuelva la pantalla a "cargando" con el rol ya sabido.
        loading: hasToken && confirmedRole === null,
        refresh,
    }), [user, confirmedRole, hasToken, refresh]);

    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export default SessionProvider;
