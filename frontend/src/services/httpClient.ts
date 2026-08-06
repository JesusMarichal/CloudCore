import axios from 'axios';
import { API_URL } from '../config';
import { tokenStorage } from './tokenStorage';

export const httpClient = axios.create({ baseURL: API_URL });

httpClient.interceptors.request.use((config) => {
    const token = tokenStorage.getToken();
    if (token) {
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

httpClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error?.response?.status === 401) {
            tokenStorage.clearSession();
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);
