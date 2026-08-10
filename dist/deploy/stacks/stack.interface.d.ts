import { Server } from '../../models/server.model';
import { DeployWebsiteDto } from '../dto/deploy-website.dto';
export interface DeployContext {
    server: Server;
    safeName: string;
    projectPath: string;
    data: DeployWebsiteDto & {
        userEmail?: string;
    };
}
export type ServeMode = {
    kind: 'proxy';
    port: string;
} | {
    kind: 'php';
    docroot: string;
} | {
    kind: 'static';
    docroot: string;
};
export interface DeployStack {
    id: string;
    label: string;
    buildAppScript(ctx: DeployContext): string;
    serve(ctx: DeployContext): ServeMode;
}
