export interface StoredUser {
    id: string;
    name: string;
    email: string;
    role?: 'ADMIN' | 'CLIENT';
    /** ID del avatar del pack predeterminado (ej. 'av-pe-1'). Nunca una imagen. */
    avatar?: string | null;
}

const TOKEN_KEY = 'cc_auth_token';
const USER_KEY = 'user';

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
    },
};
