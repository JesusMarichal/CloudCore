export declare class DeployWebsiteDto {
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
    stack?: string;
}
