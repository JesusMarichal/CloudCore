export interface StoredUser {
    id: string;
    name: string;
    email: string;
    role?: 'ADMIN' | 'CLIENT';
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

    clearSession() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    },
};
