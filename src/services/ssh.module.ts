import { Module } from '@nestjs/common';
import { SshService } from './ssh.service';

/**
 * Expone SshService (primitivo de ejecución/streaming por SSH) para que otros
 * módulos —como DeployModule— lo reutilicen sin re-instanciarlo.
 */
@Module({
    providers: [SshService],
    exports: [SshService],
})
export class SshModule { }
