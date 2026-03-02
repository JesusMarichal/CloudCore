const API_URL = 'http://localhost:3000/servers';

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
    cpuUsage?: number;
    ramUsage?: number;
    diskUsage?: number;
    temp?: number;
}




export const serverService = {
    async create(data: CreateServerData) {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            throw new Error('Error al crear el servidor');
        }
        return response.json();
    },

    async list(userId: string) {
        const response = await fetch(`${API_URL}?userId=${userId}`);
        if (!response.ok) return [];
        return response.json();
    },

    async deleteServer(id: string) {
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'DELETE'
        });
        return response.json();
    },

    async refresh(id: string) {
        const response = await fetch(`${API_URL}/${id}/refresh`, {
            method: 'POST'
        });
        return response.json();
    },

    async getServices(id: string) {
        const response = await fetch(`${API_URL}/${id}/services`);
        if (!response.ok) return [];
        return response.json();
    },

    async manageService(id: string, serviceName: string, action: string) {
        const response = await fetch(`${API_URL}/${id}/services/${serviceName}/${action}`, {
            method: 'POST'
        });
        return response.json();
    },

    async installService(id: string, serviceName: string, onData?: (chunk: string) => void) {
        const response = await fetch(`${API_URL}/${id}/services/install/${serviceName}`, {
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

    async uninstallService(id: string, serviceName: string, onData?: (chunk: string) => void) {
        const response = await fetch(`${API_URL}/${id}/services/uninstall/${serviceName}`, {
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

    async updateSystem(id: string, onData?: (chunk: string) => void) {
        const response = await fetch(`${API_URL}/${id}/update-system`, {
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
        const response = await fetch(`${API_URL}/${serverId}/deploy-website`, {
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
            return { success: true };
        }

        if (!response.ok) throw new Error('Error al desplegar sitio web');
        return response.json();
    },

    async listWebsites(userId: string) {
        const response = await fetch(`${API_URL}/websites/${userId}`);
        if (!response.ok) return [];
        return response.json();
    },

    async deleteWebsite(serverId: string, websiteId: string) {
        const response = await fetch(`${API_URL}/${serverId}/websites/${websiteId}/delete`, {
            method: 'POST'
        });
        return response.json();
    },

    async updateWebsite(serverId: string, websiteId: string, data: any) {
        const response = await fetch(`${API_URL}/${serverId}/websites/${websiteId}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return response.json();
    },

    async getWebsiteEnv(serverId: string, websiteId: string) {
        const response = await fetch(`${API_URL}/${serverId}/websites/${websiteId}/env`);
        return response.json();
    },

    async getWebsiteLogs(serverId: string, websiteId: string) {
        const response = await fetch(`${API_URL}/${serverId}/websites/${websiteId}/logs`);
        return response.json();
    },

    async executeCommand(serverId: string, command: string) {
        const response = await fetch(`${API_URL}/${serverId}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });
        return response.json();
    },

    async getWebsiteCommit(serverId: string, websiteId: string) {
        const response = await fetch(`${API_URL}/${serverId}/websites/${websiteId}/commit`);
        return response.json();
    },

    async deployLatestCommit(serverId: string, websiteId: string) {
        const response = await fetch(`${API_URL}/${serverId}/websites/${websiteId}/deploy-latest`, {
            method: 'POST'
        });
        return response.json();
    },

    // ===== Database Management =====

    async deployDatabase(serverId: string, data: any, onData?: (chunk: string) => void) {
        const response = await fetch(`${API_URL}/${serverId}/deploy-database`, {
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
            return { success: true };
        }
        return response.json();
    },

    async listDatabases(userId: string) {
        const response = await fetch(`${API_URL}/databases/${userId}`);
        if (!response.ok) return [];
        return response.json();
    },

    async manageDatabaseContainer(serverId: string, dbId: string, action: string) {
        const response = await fetch(`${API_URL}/${serverId}/databases/${dbId}/${action}`, {
            method: 'POST'
        });
        return response.json();
    },

    async deleteDatabase(serverId: string, dbId: string) {
        const response = await fetch(`${API_URL}/${serverId}/databases/${dbId}/delete`, {
            method: 'POST'
        });
        return response.json();
    }
};
