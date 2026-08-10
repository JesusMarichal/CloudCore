import { Module } from '@nestjs/common';
import { SshModule } from '../services/ssh.module';
import { DeployController } from './deploy.controller';
import { DeployService } from './deploy.service';
import { NodeStack } from './stacks/node.stack';
import { StackRegistry } from './stacks/stack.registry';

/**
 * Módulo de despliegue: aísla toda la lógica de "subir una web" (orquestador,
 * stacks y registro). DatabaseService llega vía el DatabaseModule global.
 * Para agregar un stack: crear su clase, proveerla aquí y registrarla en StackRegistry.
 */
@Module({
    imports: [SshModule],
    controllers: [DeployController],
    providers: [DeployService, StackRegistry, NodeStack],
})
export class DeployModule { }
