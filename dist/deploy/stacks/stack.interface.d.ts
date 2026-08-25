import { Server } from '../../models/server.model';
import { DeployWebsiteDto } from '../dto/deploy-website.dto';
export interface DeployContext {
    server: Server;
    safeName: string;
    projectPath: string;
    data: DeployWebsiteDto & {
        userEmail?: string;
    };
    stackConfig?: Record<string, any>;
}
export type ServeMode = {
    kind: 'proxy';
    port: string;
} | {
    kind: 'php';
    docroot: string;
    clientMaxBodySize?: string;
    extraConfig?: string;
} | {
    kind: 'static';
    docroot: string;
};
export type WebsiteRow = Record<string, any>;
export interface StackLogCommands {
    out: string;
    error: string;
    nginx: string;
}
export interface DeployStack {
    id: string;
    label: string;
    usesGit: boolean;
    needsPort: boolean;
    prepare(ctx: DeployContext): Record<string, any>;
    buildAppScript(ctx: DeployContext): string;
    serve(ctx: DeployContext): ServeMode;
    postNginxScript(ctx: DeployContext): string;
    updateAppScript(ctx: DeployContext, site: WebsiteRow): string;
    reconfigure(ctx: DeployContext, site: WebsiteRow): Record<string, any>;
    cleanupScript(ctx: DeployContext, site: WebsiteRow): string;
    logCommands(ctx: DeployContext, site: WebsiteRow): StackLogCommands;
}
