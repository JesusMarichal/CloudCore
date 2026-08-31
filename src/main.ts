import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SshTerminalGateway } from './terminal/ssh-terminal.gateway';
import * as dotenv from 'dotenv';
import helmet from 'helmet';
import { WebSocketServer } from 'ws';

async function bootstrap() {
    dotenv.config();
    const app = await NestFactory.create(AppModule, { rawBody: true });

    /**
     * Origen de Paddle.js y del iframe del checkout.
     *
     * Tiene que estar permitido AQUI ademas de en el <meta> de
     * frontend/index.html: cuando una pagina lleva dos CSP, el navegador aplica
     * la INTERSECCION de ambas, asi que la cabecera mas estricta anula lo que
     * permita el <meta>. Con el `script-src 'self'` que trae helmet por defecto,
     * Paddle.js queda bloqueado y el checkout no llega a abrirse.
     */
    const PADDLE_ORIGIN = 'https://*.paddle.com';

    /**
     * Solo se endurece para HTTPS cuando de verdad hay TLS delante.
     *
     * `upgrade-insecure-requests` reescribe a https:// todas las peticiones de
     * la propia pagina. Sirviendo en claro (una IP o un host sslip.io sin
     * certificado) eso manda los assets al puerto 443, donde no escucha nadie:
     * el HTML carga pero el JS y el CSS mueren, y queda una pagina en blanco.
     * HSTS tampoco pinta nada sin TLS.
     */
    const httpsEnabled = process.env.HTTPS_ENABLED === 'true';

    const cspDirectives: Record<string, any> = {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", PADDLE_ORIGIN],
        'frame-src': [PADDLE_ORIGIN],
        // 'self' no cubre de forma fiable ws:// en todos los navegadores, y la
        // terminal SSH del panel vive en /ws/terminal.
        'connect-src': ["'self'", PADDLE_ORIGIN, 'ws:', 'wss:'],
        'img-src': ["'self'", 'data:', 'https:'],
    };
    if (!httpsEnabled) delete cspDirectives['upgrade-insecure-requests'];

    app.use(helmet({
        contentSecurityPolicy: { useDefaults: false, directives: cspDirectives },
        hsts: httpsEnabled,
    }));

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
