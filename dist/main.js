"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const ssh_terminal_gateway_1 = require("./terminal/ssh-terminal.gateway");
const dotenv = require("dotenv");
const helmet_1 = require("helmet");
const ws_1 = require("ws");
async function bootstrap() {
    dotenv.config();
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { rawBody: true });
    app.use((0, helmet_1.default)());
    const allowedOrigins = process.env.FRONTEND_ORIGIN?.split(',').map(o => o.trim()) ?? false;
    app.enableCors({ origin: allowedOrigins, credentials: false });
    const port = process.env.PORT || 3000;
    await app.listen(port);
    const httpServer = app.getHttpServer();
    const wss = new ws_1.WebSocketServer({ server: httpServer, path: '/ws/terminal' });
    const gateway = app.get(ssh_terminal_gateway_1.SshTerminalGateway);
    gateway.init(wss);
    console.log(`--- CloudCore Engine Running on port ${port} ---`);
}
bootstrap();
//# sourceMappingURL=main.js.map