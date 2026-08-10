import { BadRequestException, Injectable } from '@nestjs/common';
import { DeployStack } from './stack.interface';
import { NodeStack } from './node.stack';

/**
 * Registro central de stacks. Para agregar un stack nuevo (WordPress, Laravel,
 * estático…) basta crear su clase que implemente DeployStack, proveerla en
 * DeployModule e inyectarla + registrarla aquí. El orquestador no cambia.
 */
@Injectable()
export class StackRegistry {
    private readonly stacks = new Map<string, DeployStack>();

    constructor(nodeStack: NodeStack) {
        this.register(nodeStack);
        // Próximos stacks: this.register(wordpressStack), this.register(staticStack)...
    }

    register(stack: DeployStack): void {
        this.stacks.set(stack.id, stack);
    }

    get(id: string): DeployStack {
        const stack = this.stacks.get(id);
        if (!stack) {
            throw new BadRequestException(`Stack no soportado: '${id}'`);
        }
        return stack;
    }
}
