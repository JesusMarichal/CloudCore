import { API_URL as BASE_URL } from '../config';
import { authFetch } from './apiFetch';

const API_URL = `${BASE_URL}/admin`;

export type UserRole = 'ADMIN' | 'CLIENT';

export interface AdminUserSubscription {
    subscriptionId: string;
    status: string;
    priceId: string;
    nextBilledAt: string | null;
    scheduledChangeAction: string | null;
    scheduledChangeAt: string | null;
}

export interface AdminUser {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    avatar: string | null;
    createdAt: string;
    twoFactorEnabled: boolean;
    failedAttempts: number;
    /** Solo viene relleno mientras el bloqueo sigue vigente. */
    lockedUntil: string | null;
    onboardingDone: boolean;
    hasGithubToken: boolean;
    serverCount: number;
    subscription: AdminUserSubscription | null;
}

export interface AdminUserServer {
    id: string;
    name: string;
    ip: string;
    status: string;
    createdAt: string;
}

export interface AdminUserDetail extends AdminUser {
    servers: AdminUserServer[];
}

export interface UpdateUserPatch {
    name?: string;
    email?: string;
    role?: UserRole;
}

export interface AdminUsersResponse {
    users: AdminUser[];
    total: number;
    admins: number;
    clients: number;
}

/** Saca el mensaje del backend (400/403/404) para poder enseñarlo tal cual. */
const readError = async (response: Response): Promise<never> => {
    let message = '';
    try {
        const body = await response.json();
        message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message ?? '';
    } catch { /* respuesta sin cuerpo JSON */ }
    throw new Error(message || `HTTP ${response.status}`);
};

export const AdminService = {
    async listUsers(params: { search?: string; role?: 'ALL' | UserRole } = {}): Promise<AdminUsersResponse> {
        const query = new URLSearchParams();
        if (params.search?.trim()) query.set('search', params.search.trim());
        if (params.role && params.role !== 'ALL') query.set('role', params.role);

        const suffix = query.toString() ? `?${query}` : '';
        const response = await authFetch(`${API_URL}/users${suffix}`);
        if (!response.ok) return readError(response);
        return response.json();
    },

    async getUser(id: string): Promise<AdminUserDetail> {
        const response = await authFetch(`${API_URL}/users/${id}`);
        if (!response.ok) return readError(response);
        return response.json();
    },

    /** Acepta cualquier subconjunto de {name, email, role}; solo se envia lo que cambia. */
    async updateUser(id: string, patch: UpdateUserPatch): Promise<{ changed: boolean; user: AdminUser }> {
        const response = await authFetch(`${API_URL}/users/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
        });
        if (!response.ok) return readError(response);
        return response.json();
    },

    async deleteUser(id: string): Promise<{ deletedId: string; email: string }> {
        const response = await authFetch(`${API_URL}/users/${id}`, { method: 'DELETE' });
        if (!response.ok) return readError(response);
        return response.json();
    },

    async unlockUser(id: string): Promise<{ user: AdminUser }> {
        const response = await authFetch(`${API_URL}/users/${id}/unlock`, { method: 'POST' });
        if (!response.ok) return readError(response);
        return response.json();
    },
};
