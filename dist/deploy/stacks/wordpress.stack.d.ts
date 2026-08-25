import { DeployContext, DeployStack, ServeMode, StackLogCommands, WebsiteRow } from './stack.interface';
export declare const WP_UPLOAD_PREFIX = "/tmp/cloudcore-wp-";
export interface WordpressConfig {
    mode: 'fresh' | 'migrate';
    directory: string;
    installPath: string;
    docroot: string;
    host: string;
    siteUrl: string;
    installUrl: string;
    adminUrl: string;
    externalDb: boolean;
    dbHost: string;
    dbName: string;
    dbUser: string;
    dbPassword: string;
    tablePrefix: string;
    adminUser?: string;
    adminEmail?: string;
    locale: string;
}
export declare class WordpressStack implements DeployStack {
    id: string;
    label: string;
    usesGit: boolean;
    needsPort: boolean;
    prepare(ctx: DeployContext): WordpressConfig;
    private configOf;
    serve(ctx: DeployContext): ServeMode;
    postNginxScript(ctx: DeployContext): string;
    buildAppScript(ctx: DeployContext): string;
    private helpersScript;
    private prepareServerScript;
    private prepareMariadbScript;
    private createDatabaseScript;
    private externalDbNoticeScript;
    private freshInstallScript;
    private migrateScript;
    private importDumpScript;
    private searchReplaceScript;
    private finalizeScript;
    reconfigure(ctx: DeployContext, _site: WebsiteRow): Record<string, any>;
    updateAppScript(ctx: DeployContext, _site: WebsiteRow): string;
    cleanupScript(ctx: DeployContext, _site: WebsiteRow): string;
    logCommands(ctx: DeployContext, _site: WebsiteRow): StackLogCommands;
}
