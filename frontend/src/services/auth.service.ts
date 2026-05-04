import axios from 'axios';
import { API_URL } from '../config';

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
