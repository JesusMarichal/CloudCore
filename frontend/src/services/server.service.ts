import { API_URL as BASE_URL } from '../config';
import { authFetch } from './apiFetch';

const API_URL = `${BASE_URL}/servers`;

export interface CreateServerData {
    id?: string;
    name: string;
    ip: string;
    sshPort: number;
    sshUser: string;
    authType: 'key' | 'password';
    privateKey?: string;
    password?: string;
    userId?: string;
    status?: string;
    provisioningStep?: string;
    provisioningStepKey?: string;
    provisioningIndex?: number;
    provisioningTotal?: number;
    provisioningPercent?: number;
    provisioningDetail?: string;
    provisioningStartedAt?: string;
    cpuUsage?: number;
    ramUsage?: number;
    diskUsage?: number;
    temp?: number;
}




export interface ProvisioningStatus {
    status: string;
    step: string | null;
    stepKey: string | null;
    index: number;
    total: number;
    percent: number;
    detail: string;
    log: string;
    startedAt: string | null;
    finishedAt: string | null;
    elapsedSeconds: number;
    steps: { key: string; name: string }[];
}

const cache: Record<string, { value: any; expiry: number }> = {};
const CACHE_TTL = 3 * 60 * 1000; // 3 minutos

async function withCache<T>(key: string, fetcher: () => Promise<T>, ttl: number = CACHE_TTL): Promise<T> {
    const now = Date.now();
    if (cache[key] && cache[key].expiry > now) {
        return cache[key].value;
    }
    const res = await fetcher();
    cache[key] = { value: res, expiry: now + ttl };
    return res;
}

function invalidateCache(prefix: string) {
    Object.keys(cache).forEach(k => {
        if (k.startsWith(prefix)) {
            delete cache[k];
        }
    });
}

export const serverService = {
    async create(data: CreateServerData) {
        const response = await authFetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            throw new Error('Error al crear el servidor');
        }
        invalidateCache('servers_');
        return response.json();
    },

    async list() {
        // TTL corto: esta lista trae métricas (CPU/RAM/disco) y el progreso de
        // aprovisionamiento, que deben verse casi en tiempo real en las vistas.
        return withCache('servers_current', async () => {
            const response = await authFetch(API_URL);
            if (!response.ok) return [];
            return response.json();
        }, 5000);
    },

    // Progreso del aprovisionamiento. Sin caché: es un seguimiento en vivo.
    async getProvisioning(id: string): Promise<ProvisioningStatus | null> {
        const response = await authFetch(`${API_URL}/${id}/provisioning`);
        if (!response.ok) return null;
        return response.json();
    },

    async deleteServer(id: string) {
        const response = await authFetch(`${API_URL}/${id}`, {
            method: 'DELETE'
        });
        invalidateCache('servers_');
        return response.json();
    },

    async refresh(id: string) {
        const response = await authFetch(`${API_URL}/${id}/refresh`, {
            method: 'POST'
        });
        // Invalidar la caché para que la próxima carga traiga las métricas recién guardadas
        invalidateCache('servers_');
        return response.json();
    },

    async getServices(id: string) {
        return withCache(`services_${id}`, async () => {
            const response = await authFetch(`${API_URL}/${id}/services`);
            if (!response.ok) return [];
            return response.json();
        });
    },

    async manageService(id: string, serviceName: string, action: string) {
        const response = await authFetch(`${API_URL}/${id}/services/${serviceName}/${action}`, {
            method: 'POST'
        });
        invalidateCache(`services_${id}`);
        invalidateCache('servers_');
        return response.json();
    },

    async installService(id: string, serviceName: string, onData?: (chunk: string) => void) {
        const response = await authFetch(`${API_URL}/${id}/services/install/${serviceName}`, {
            method: 'POST'
        });
        if (onData && response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                onData(decoder.decode(value, { stream: true }));
            }
            invalidateCache(`services_${id}`);
            invalidateCache('servers_');
            return { success: true };
        }
        invalidateCache(`services_${id}`);
        invalidateCache('servers_');
        return response.json();
    },

    async uninstallService(id: string, serviceName: string, onData?: (chunk: string) => void) {
        const response = await authFetch(`${API_URL}/${id}/services/uninstall/${serviceName}`, {
            method: 'POST'
        });
        if (onData && response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                onData(decoder.decode(value, { stream: true }));
            }
            invalidateCache(`services_${id}`);
            invalidateCache('servers_');
            return { success: true };
        }
        invalidateCache(`services_${id}`);
        invalidateCache('servers_');
        return response.json();
    },

    async updateSystem(id: string, onData?: (chunk: string) => void) {
        const response = await authFetch(`${API_URL}/${id}/update-system`, {
            method: 'POST'
        });
        if (onData && response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                onData(decoder.decode(value, { stream: true }));
            }
            return { success: true };
        }
        return response.json();
    },

    async deployWebsite(serverId: string, data: any, onData?: (chunk: string) => void) {
        const response = await authFetch(`${API_URL}/${serverId}/deploy-website`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (onData && response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                onData(decoder.decode(value, { stream: true }));
            }
            invalidateCache('websites_');
            return { success: true };
        }

        if (!response.ok) throw new Error('Error al desplegar sitio web');
        invalidateCache('websites_');
        return response.json();
    },

    async listWebsites() {
        return withCache('websites_current', async () => {
            const response = await authFetch(`${API_URL}/websites`);
            if (!response.ok) return [];
            return response.json();
        });
    },

    async deleteWebsite(serverId: string, websiteId: string) {
        const response = await authFetch(`${API_URL}/${serverId}/websites/${websiteId}/delete`, {
            method: 'POST'
        });
        invalidateCache('websites_');
        return response.json();
    },

    async updateWebsite(serverId: string, websiteId: string, data: any, onData?: (chunk: string) => void) {
        const response = await authFetch(`${API_URL}/${serverId}/websites/${websiteId}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (onData && response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                onData(decoder.decode(value, { stream: true }));
            }
            invalidateCache('websites_');
            return { success: true };
        }

        invalidateCache('websites_');
        return response.json();
    },

    async getWebsiteEnv(serverId: string, websiteId: string) {
        const response = await authFetch(`${API_URL}/${serverId}/websites/${websiteId}/env`);
        return response.json();
    },

    async getWebsiteLogs(serverId: string, websiteId: string) {
        const response = await authFetch(`${API_URL}/${serverId}/websites/${websiteId}/logs`);
        return response.json();
    },

    async executeCommand(serverId: string, command: string) {
        const response = await authFetch(`${API_URL}/${serverId}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });
        return response.json();
    },

    async getWebsiteCommit(serverId: string, websiteId: string) {
        const response = await authFetch(`${API_URL}/${serverId}/websites/${websiteId}/commit`);
        return response.json();
    },

    async deployLatestCommit(serverId: string, websiteId: string) {
        const response = await authFetch(`${API_URL}/${serverId}/websites/${websiteId}/deploy-latest`, {
            method: 'POST'
        });
        invalidateCache('websites_');
        return response.json();
    },

    // ===== Database Management =====

    async deployDatabase(serverId: string, data: any, onData?: (chunk: string) => void) {
        const response = await authFetch(`${API_URL}/${serverId}/deploy-database`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (onData && response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                onData(decoder.decode(value, { stream: true }));
            }
            invalidateCache('databases_');
            return { success: true };
        }
        invalidateCache('databases_');
        return response.json();
    },

    async importDatabases() {
        const response = await authFetch(`${API_URL}/import-databases`, {
            method: 'POST'
        });
        invalidateCache('databases_');
        return response.json();
    },

    async listDatabases() {
        return withCache('databases_current', async () => {
            const response = await authFetch(`${API_URL}/databases`);
            if (!response.ok) return [];
            return response.json();
        });
    },

    async manageDatabaseContainer(serverId: string, dbId: string, action: string) {
        const response = await authFetch(`${API_URL}/${serverId}/databases/${dbId}/${action}`, {
            method: 'POST'
        });
        return response.json();
    },

    async deleteDatabase(serverId: string, dbId: string) {
        const response = await authFetch(`${API_URL}/${serverId}/databases/${dbId}/delete`, {
            method: 'POST'
        });
        invalidateCache('databases_');
        return response.json();
    },

    async getNotifications() {
        const response = await authFetch(`${API_URL}/notifications`);
        if (!response.ok) return { success: false, notifications: [] };
        return response.json();
    },

    async markNotificationsRead() {
        await authFetch(`${API_URL}/notifications/mark-read`, { method: 'POST' });
    },

    async dismissNotification(id: string) {
        await authFetch(`${API_URL}/notifications/${id}/dismiss`, { method: 'POST' });
    },
};
