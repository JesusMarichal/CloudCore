import { Server } from '../../models/server.model';
import { DeployWebsiteDto } from '../dto/deploy-website.dto';

/** Contexto que recibe cada stack para generar su script de despliegue. */
export interface DeployContext {
    server: Server;
    /** name saneado (solo [a-zA-Z0-9_-], en minúsculas). */
    safeName: string;
    /** Ruta del proyecto en el servidor: /var/www/<safeName>. */
    projectPath: string;
    /** Datos del deploy con el repo ya tokenizado y el email del usuario. */
    data: DeployWebsiteDto & { userEmail?: string };
}

/**
 * Cómo debe servir Nginx el stack. Es la parte que varía entre frameworks;
 * el resto de la configuración Nginx + Certbot es común (ver nginx.util.ts).
 */
export type ServeMode =
    | { kind: 'proxy'; port: string }       // Node: reverse proxy al puerto de la app
    | { kind: 'php'; docroot: string }      // (futuro) WordPress / Laravel: php-fpm + root
    | { kind: 'static'; docroot: string };  // (futuro) HTML estático

/** Estrategia de despliegue para un tipo de stack. */
export interface DeployStack {
    /** Identificador único, p.ej. 'node'. */
    id: string;
    /** Nombre legible para la UI, p.ej. 'Node.js / PM2'. */
    label: string;
    /** Bash que clona / instala / construye / arranca la aplicación. */
    buildAppScript(ctx: DeployContext): string;
    /** Modo en que Nginx debe servir este stack. */
    serve(ctx: DeployContext): ServeMode;
}
