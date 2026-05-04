export const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : ''; // En producción, usamos rutas relativas si el backend sirve el frontend
