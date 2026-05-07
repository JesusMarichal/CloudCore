import axios from 'axios';
import { API_URL } from '../config';

export const AuthService = {
    async login(credentials: { email: string; password: string }) {
        const response = await axios.post(`${API_URL}/auth/login`, credentials);
        return response.data;
    },

    async verify2FALogin(userId: string, token: string) {
        const response = await axios.post(`${API_URL}/auth/2fa/login`, { userId, token });
        return response.data;
    },

    async register(data: { name: string; email: string; password: string }) {
        const response = await axios.post(`${API_URL}/auth/register`, data);
        return response.data;
    },

    async changePassword(userId: string, currentPassword: string, newPassword: string) {
        const response = await axios.post(`${API_URL}/auth/change-password`, {
            userId, currentPassword, newPassword
        });
        return response.data;
    },

    async get2FAStatus(userId: string) {
        const response = await axios.post(`${API_URL}/auth/2fa/status`, { userId });
        return response.data;
    },

    async generate2FA(userId: string) {
        const response = await axios.post(`${API_URL}/auth/2fa/generate`, { userId });
        return response.data;
    },

    async enable2FA(userId: string, token: string) {
        const response = await axios.post(`${API_URL}/auth/2fa/enable`, { userId, token });
        return response.data;
    },

    async disable2FA(userId: string, password: string) {
        const response = await axios.post(`${API_URL}/auth/2fa/disable`, { userId, password });
        return response.data;
    },
};
