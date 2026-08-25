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
    /**
     * Datos derivados que el stack calculó una vez y el panel persistió
     * (credenciales de base de datos, rutas de instalación…). Lo produce
     * `DeployStack.prepare()` y se guarda en la columna `websites.stack_config`.
     */
    stackConfig?: Record<string, any>;
}

/**
 * Cómo debe servir Nginx el stack. Es la parte que varía entre frameworks;
 * el resto de la configuración Nginx + Certbot es común (ver nginx.util.ts).
 */
export type ServeMode =
    | { kind: 'proxy'; port: string }       // Node: reverse proxy al puerto de la app
    | {
        kind: 'php';                        // WordPress / Laravel: php-fpm + root
        docroot: string;
        /** Tamaño máximo de subida (WordPress necesita más que el 1M por defecto). */
        clientMaxBodySize?: string;
        /**
         * Bloques `location` extra que aporta el stack (endurecimiento de
         * WordPress, instalación en subdirectorio…). Se insertan ANTES del
         * `location /` genérico: en Nginx gana el prefijo más largo.
         */
        extraConfig?: string;
    }
    | { kind: 'static'; docroot: string };  // (futuro) HTML estático

/** Fila de la tabla `websites` tal y como la devuelve Postgres (snake_case). */
export type WebsiteRow = Record<string, any>;

/** Comandos que el panel ejecuta para llenar cada pestaña del modal de logs. */
export interface StackLogCommands {
    out: string;
    error: string;
    nginx: string;
}

/**
 * Estrategia de despliegue para un tipo de stack.
 *
 * Todo lo específico de un stack vive aquí: el panel (DeployService y
 * ServerController) solo pide el script que toca y lo ejecuta por SSH. Para
 * añadir un stack nuevo basta implementar esta interfaz, proveer la clase en
 * DeployModule y registrarla en StackRegistry.
 */
export interface DeployStack {
    /** Identificador único, p.ej. 'node'. */
    id: string;
    /** Nombre legible para la UI, p.ej. 'Node.js / PM2'. */
    label: string;
    /**
     * ¿El sitio se despliega clonando un repositorio git? Determina si el panel
     * puede seguir commits y ofrecer "desplegar último commit".
     */
    usesGit: boolean;
    /**
     * ¿La aplicación escucha en un puerto interno propio? Los stacks que Nginx
     * sirve directamente (PHP-FPM, estáticos) no consumen ninguno, así que el
     * panel no les reserva puerto del rango 30000-39999.
     */
    needsPort: boolean;
    /**
     * Calcula los datos derivados del despliegue (credenciales de BD, rutas…)
     * ANTES de generar ningún script. Lo que devuelve se persiste en
     * `websites.stack_config` y vuelve en `ctx.stackConfig` en cada operación
     * posterior (actualizar, eliminar, logs).
     */
    prepare(ctx: DeployContext): Record<string, any>;
    /** Bash que clona / instala / construye / arranca la aplicación. */
    buildAppScript(ctx: DeployContext): string;
    /** Modo en que Nginx debe servir este stack. */
    serve(ctx: DeployContext): ServeMode;
    /**
     * Bash que se ejecuta DESPUÉS de configurar Nginx y de pedir el certificado.
     *
     * Existe porque hasta ese momento no se sabe si el sitio va a quedar en http
     * o en https: Certbot puede fallar (DNS sin propagar, dominio mal apuntado).
     * WordPress guarda su URL dentro de la base de datos, así que necesita ese
     * dato ya resuelto; los stacks a los que no les afecta devuelven ''.
     */
    postNginxScript(ctx: DeployContext): string;
    /**
     * Bash que aplica una edición de la configuración a un sitio YA desplegado
     * (sin la parte de Nginx, que la añade el panel con el generador común).
     */
    updateAppScript(ctx: DeployContext, site: WebsiteRow): string;
    /**
     * Nuevo `stack_config` tras una edición. Existe porque editar un sitio puede
     * cambiar datos derivados (el dominio de WordPress cambia su URL y la de
     * /wp-admin) sin tocar los que no deben regenerarse nunca, como la
     * contraseña de la base de datos.
     */
    reconfigure(ctx: DeployContext, site: WebsiteRow): Record<string, any>;
    /** Bash que borra del servidor todo lo que creó el stack (sin tocar Nginx). */
    cleanupScript(ctx: DeployContext, site: WebsiteRow): string;
    /** Comandos de lectura de logs para el modal del panel. */
    logCommands(ctx: DeployContext, site: WebsiteRow): StackLogCommands;
}
