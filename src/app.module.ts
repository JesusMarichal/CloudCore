import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ServerController } from './controllers/server.controller';
import { SshService } from './services/ssh.service';
import { AuthController } from './auth/auth.controller';
import { DatabaseService } from './database/database.service';
import { TerminalService } from './terminal/terminal.service';
import { TerminalController } from './terminal/terminal.controller';
import { GithubController } from './controllers/github.controller';

@Module({
    imports: [
        ServeStaticModule.forRoot({
            rootPath: join(__dirname, '..', 'public'),
        }),
    ],
    controllers: [ServerController, AuthController, TerminalController, GithubController],
    providers: [SshService, DatabaseService, TerminalService],
})
export class AppModule { }
