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

    async refresh(id: string) {
        const response = await fetch(`${API_URL}/${id}/refresh`, {
            method: 'POST'
        });
        return response.json();
    }

};
