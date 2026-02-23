import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ServerController } from './controllers/server.controller';
import { SshService } from './services/ssh.service';
import { AuthController } from './auth/auth.controller';

@Module({
    imports: [
        ServeStaticModule.forRoot({
            rootPath: join(__dirname, '..', 'public'),
        }),
    ],
    controllers: [ServerController, AuthController],
    providers: [SshService],
})
export class AppModule { }
