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
}
