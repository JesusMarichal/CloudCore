import { DeployStack } from './stack.interface';
import { NodeStack } from './node.stack';
export declare class StackRegistry {
    private readonly stacks;
    constructor(nodeStack: NodeStack);
    register(stack: DeployStack): void;
    get(id: string): DeployStack;
}
