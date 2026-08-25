/**
 * Payload de despliegue de un sitio. Tipa lo que antes se recibía como `any`.
 * `stack` es opcional y por defecto vale 'node' (comportamiento actual).
 */
export class DeployWebsiteDto {
    name: string;
    repo: string;
    installCommand: string;
    buildCommand?: string;
    startCommand: string;
    port: string;
    domain?: string;
    entryPoint?: string;
    envVars?: string;
    useLetsEncrypt?: boolean;
    setupWwwAlias?: boolean;
    /** Identificador del stack a desplegar. Default: 'node'. */
    stack?: string;

    // ─────────────────────────────────────────────────────────────────────────
    // WordPress (stack = 'wordpress'). Todo opcional para el resto de stacks.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 'fresh'   → instalación limpia de WordPress (equivale a Softaculous).
     * 'migrate' → subir un WordPress existente (archivos + volcado .sql).
     */
    wpMode?: 'fresh' | 'migrate';

    /** Subdirectorio bajo el dominio: vacío = raíz, 'blog' = dominio.com/blog. */
    wpDirectory?: string;

    // -- Instalación limpia --
    /** Título del sitio (Ajustes → General). */
    wpTitle?: string;
    /** Usuario administrador con el que se entra a /wp-admin. */
    wpAdminUser?: string;
    /** Contraseña del administrador. No se guarda en el panel. */
    wpAdminPassword?: string;
    /** Correo del administrador (recuperación de contraseña, avisos). */
    wpAdminEmail?: string;
    /** Idioma del núcleo, p.ej. 'es_ES'. Default: 'es_ES'. */
    wpLocale?: string;

    // -- Migración --
    /**
     * Archivos del WordPress existente. Puede ser:
     *  - una URL pública a un .zip / .tar.gz / .tgz, o
     *  - una ruta en el propio servidor devuelta por el endpoint de subida
     *    (`/servers/:id/wordpress/upload`), que empieza por /tmp/cloudcore-wp-.
     */
    wpArchiveUrl?: string;
    /** Volcado .sql / .sql.gz / .zip de la base de datos. Mismas dos formas. */
    wpDbDumpUrl?: string;
    /**
     * Reemplazar el dominio antiguo por el nuevo en toda la base de datos
     * (`wp search-replace`). Default: true — sin esto un WordPress migrado
     * sigue enlazando al dominio viejo. */
    wpSearchReplace?: boolean;
    /** Dominio antiguo, si no se puede deducir del propio volcado. */
    wpOldDomain?: string;

    // -- Base de datos --
    /**
     * Base de datos externa ya existente. Si se rellenan, el panel NO crea
     * ninguna base de datos local y solo apunta wp-config.php a estos datos.
     */
    wpDbHost?: string;
    wpDbName?: string;
    wpDbUser?: string;
    wpDbPassword?: string;
    /** Prefijo de tablas. Default: 'wp_'. En migraciones debe ser el original. */
    wpTablePrefix?: string;
}
