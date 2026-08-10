import { DeployContext, DeployStack, ServeMode } from './stack.interface';
export declare class NodeStack implements DeployStack {
    id: string;
    label: string;
    serve(ctx: DeployContext): ServeMode;
    buildAppScript(ctx: DeployContext): string;
}
