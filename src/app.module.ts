import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ServerController } from './controllers/server.controller';
import { SshService } from './services/ssh.service';
import { AuthController } from './auth/auth.controller';
import { DatabaseService } from './database/database.service';
import { TerminalService } from './terminal/terminal.service';
import { TerminalController } from './terminal/terminal.controller';
import { GithubController } from './controllers/github.controller';
import { SshTerminalGateway } from './terminal/ssh-terminal.gateway';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret: config.get<string>('JWT_SECRET'),
                signOptions: { expiresIn: (config.get<string>('JWT_EXPIRES_IN') || '2h') as any },
            }),
        }),
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 20 }]),
        ServeStaticModule.forRoot({
            rootPath: join(__dirname, '..', 'public'),
        }),
    ],
    controllers: [ServerController, AuthController, TerminalController, GithubController],
    providers: [
        SshService,
        DatabaseService,
        TerminalService,
        SshTerminalGateway,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
    ],
})
export class AppModule { }
