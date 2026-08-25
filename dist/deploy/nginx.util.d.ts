import { DeployContext, ServeMode } from './stacks/stack.interface';
export declare function fallbackHostname(safeName: string, ip: string): string;
export declare function buildBaseNginxScript(): string;
export declare function buildNginxScript(ctx: DeployContext, serve: ServeMode): string;
