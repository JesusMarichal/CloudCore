import { DeployStack } from './stack.interface';
import { NodeStack } from './node.stack';
import { WordpressStack } from './wordpress.stack';
export declare class StackRegistry {
    private readonly stacks;
    constructor(nodeStack: NodeStack, wordpressStack: WordpressStack);
    register(stack: DeployStack): void;
    get(id: string): DeployStack;
    list(): {
        id: string;
        label: string;
        usesGit: boolean;
    }[];
}
