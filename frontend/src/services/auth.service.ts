import axios from 'axios';

const API_URL = 'http://localhost:3000';

export const AuthService = {
    async login(credentials: any) {
        const response = await axios.post(`${API_URL}/auth/login`, credentials);
        return response.data;
    },
    async register(data: any) {
        const response = await axios.post(`${API_URL}/auth/register`, data);
        return response.data;
    }
};
