import { DeployContext, DeployStack, ServeMode, StackLogCommands, WebsiteRow } from './stack.interface';
export declare class NodeStack implements DeployStack {
    id: string;
    label: string;
    usesGit: boolean;
    needsPort: boolean;
    prepare(_ctx: DeployContext): Record<string, any>;
    serve(ctx: DeployContext): ServeMode;
    postNginxScript(_ctx: DeployContext): string;
    buildAppScript(ctx: DeployContext): string;
    updateAppScript(ctx: DeployContext, site: WebsiteRow): string;
    reconfigure(ctx: DeployContext, _site: WebsiteRow): Record<string, any>;
    cleanupScript(ctx: DeployContext, _site: WebsiteRow): string;
    logCommands(ctx: DeployContext, _site: WebsiteRow): StackLogCommands;
}
