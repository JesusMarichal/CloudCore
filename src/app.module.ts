import { Module } from '@nestjs/common';
import { ServerController } from './controllers/server.controller';
import { SshService } from './services/ssh.service';

@Module({
    imports: [],
    controllers: [ServerController],
    providers: [SshService],
})
export class AppModule { }
