/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Client-side token de Paddle. Público por diseño: `test_...` en sandbox. */
    readonly VITE_PADDLE_CLIENT_TOKEN?: string;
    /** Entorno de Paddle: 'sandbox' o 'production'. Sin valor por defecto. */
    readonly VITE_PADDLE_ENV?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
