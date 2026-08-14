import { httpClient } from './httpClient';

export const AuthService = {
    async login(credentials: { email: string; password: string }) {
        const response = await httpClient.post('/auth/login', credentials);
        return response.data;
    },

    async verify2FALogin(preAuthToken: string, token: string) {
        const response = await httpClient.post('/auth/2fa/login', { preAuthToken, token });
        return response.data;
    },

    async register(data: { name: string; email: string; password: string }) {
        const response = await httpClient.post('/auth/register', data);
        return response.data;
    },

    async verifyRegister(email: string, code: string) {
        const response = await httpClient.post('/auth/register/verify', { email, code });
        return response.data;
    },

    async forgotPassword(email: string) {
        const response = await httpClient.post('/auth/forgot-password', { email });
        return response.data;
    },

    async resetPassword(token: string, newPassword: string) {
        const response = await httpClient.post('/auth/reset-password', { token, newPassword });
        return response.data;
    },

    async changePassword(currentPassword: string, newPassword: string) {
        const response = await httpClient.post('/auth/change-password', {
            currentPassword, newPassword
        });
        return response.data;
    },

    async get2FAStatus() {
        const response = await httpClient.post('/auth/2fa/status', {});
        return response.data;
    },

    async generate2FA() {
        const response = await httpClient.post('/auth/2fa/generate', {});
        return response.data;
    },

    async enable2FA(token: string) {
        const response = await httpClient.post('/auth/2fa/enable', { token });
        return response.data;
    },

    async disable2FA(password: string) {
        const response = await httpClient.post('/auth/2fa/disable', { password });
        return response.data;
    },
};
