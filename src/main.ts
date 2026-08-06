import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SshTerminalGateway } from './terminal/ssh-terminal.gateway';
import * as dotenv from 'dotenv';
import helmet from 'helmet';
import { WebSocketServer } from 'ws';

async function bootstrap() {
    dotenv.config();
    const app = await NestFactory.create(AppModule, { rawBody: true });

    app.use(helmet());

    const allowedOrigins = process.env.FRONTEND_ORIGIN?.split(',').map(o => o.trim()) ?? false;
    app.enableCors({ origin: allowedOrigins, credentials: false });

    const port = process.env.PORT || 3000;
    await app.listen(port);

    // Attach WebSocket server for interactive SSH terminal sessions
    const httpServer = app.getHttpServer();
    const wss = new WebSocketServer({ server: httpServer, path: '/ws/terminal' });
    const gateway = app.get(SshTerminalGateway);
    gateway.init(wss);

    console.log(`--- CloudCore Engine Running on port ${port} ---`);
}

bootstrap();
