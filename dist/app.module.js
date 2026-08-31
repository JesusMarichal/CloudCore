"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const throttler_1 = require("@nestjs/throttler");
const serve_static_1 = require("@nestjs/serve-static");
const path_1 = require("path");
const server_controller_1 = require("./controllers/server.controller");
const ssh_module_1 = require("./services/ssh.module");
const auth_controller_1 = require("./auth/auth.controller");
const database_module_1 = require("./database/database.module");
const terminal_service_1 = require("./terminal/terminal.service");
const terminal_controller_1 = require("./terminal/terminal.controller");
const github_controller_1 = require("./controllers/github.controller");
const billing_module_1 = require("./billing/billing.module");
const ssh_terminal_gateway_1 = require("./terminal/ssh-terminal.gateway");
const jwt_auth_guard_1 = require("./common/auth/jwt-auth.guard");
const deploy_module_1 = require("./deploy/deploy.module");
const mail_module_1 = require("./mail/mail.module");
const admin_module_1 = require("./admin/admin.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            jwt_1.JwtModule.registerAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    secret: config.get('JWT_SECRET'),
                    signOptions: { expiresIn: (config.get('JWT_EXPIRES_IN') || '2h') },
                }),
            }),
            throttler_1.ThrottlerModule.forRoot([{ ttl: 60000, limit: 20 }]),
            serve_static_1.ServeStaticModule.forRoot({
                rootPath: (0, path_1.join)(__dirname, '..', 'public'),
            }),
            database_module_1.DatabaseModule,
            ssh_module_1.SshModule,
            deploy_module_1.DeployModule,
            mail_module_1.MailModule,
            billing_module_1.BillingModule,
            admin_module_1.AdminModule,
        ],
        controllers: [server_controller_1.ServerController, auth_controller_1.AuthController, terminal_controller_1.TerminalController, github_controller_1.GithubController],
        providers: [
            terminal_service_1.TerminalService,
            ssh_terminal_gateway_1.SshTerminalGateway,
            { provide: core_1.APP_GUARD, useClass: jwt_auth_guard_1.JwtAuthGuard },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map