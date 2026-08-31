export interface StoredUser {
    id: string;
    name: string;
    email: string;
    role?: 'ADMIN' | 'CLIENT';
    /** ID del avatar del pack predeterminado (ej. 'av-pe-1'). Nunca una imagen. */
    avatar?: string | null;
    /** true cuando el usuario ya terminó (o saltó) la guía de CoreBot. */
    onboardingDone?: boolean;
}

const TOKEN_KEY = 'cc_auth_token';
const USER_KEY = 'user';

/**
 * Aviso de que la sesión ha empezado o terminado en ESTA pestaña.
 *
 * El evento nativo `storage` solo llega a las *otras* pestañas, así que sin esto
 * SessionProvider —que se monta una sola vez, por encima del Router— no se
 * entera de un login: `navigate()` no lo remonta y se quedaría creyendo que no
 * hay sesión. Se emite solo al abrir y cerrar sesión, nunca en `updateUser`,
 * porque el propio provider llama a `updateUser` al revalidar y se realimentaría.
 */
export const SESSION_CHANGED_EVENT = 'cc-session-changed';

const announce = () => window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));

export const tokenStorage = {
    getToken(): string | null {
        return localStorage.getItem(TOKEN_KEY);
    },

    getUser(): StoredUser | null {
        const raw = localStorage.getItem(USER_KEY);
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    },

    setSession(token: string, user: StoredUser) {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        announce();
    },

    /** Actualiza el usuario guardado sin tocar el token de sesión. */
    updateUser(patch: Partial<StoredUser>) {
        const current = this.getUser();
        if (!current) return null;
        const next = { ...current, ...patch };
        localStorage.setItem(USER_KEY, JSON.stringify(next));
        return next;
    },

    clearSession() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        announce();
    },
};
