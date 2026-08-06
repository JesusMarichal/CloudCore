import { tokenStorage } from './tokenStorage';

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const token = tokenStorage.getToken();
    const headers = new Headers(options.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
        tokenStorage.clearSession();
        if (window.location.pathname !== '/login') {
            window.location.href = '/login';
        }
    }

    return response;
}
