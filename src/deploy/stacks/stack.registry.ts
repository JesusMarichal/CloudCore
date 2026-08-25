import { BadRequestException, Injectable } from '@nestjs/common';
import { DeployStack } from './stack.interface';
import { NodeStack } from './node.stack';
import { WordpressStack } from './wordpress.stack';

/**
 * Registro central de stacks. Para agregar un stack nuevo (Laravel, estático…)
 * basta crear su clase que implemente DeployStack, proveerla en DeployModule e
 * inyectarla + registrarla aquí. El orquestador no cambia.
 */
@Injectable()
export class StackRegistry {
    private readonly stacks = new Map<string, DeployStack>();

    constructor(nodeStack: NodeStack, wordpressStack: WordpressStack) {
        this.register(nodeStack);
        this.register(wordpressStack);
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

    /** Catálogo para la UI: qué stacks puede elegir el usuario al desplegar. */
    list(): { id: string; label: string; usesGit: boolean }[] {
        return Array.from(this.stacks.values()).map(s => ({
            id: s.id,
            label: s.label,
            usesGit: s.usesGit,
        }));
    }
}
