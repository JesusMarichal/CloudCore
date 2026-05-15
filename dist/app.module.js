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
const serve_static_1 = require("@nestjs/serve-static");
const path_1 = require("path");
const server_controller_1 = require("./controllers/server.controller");
const ssh_service_1 = require("./services/ssh.service");
const auth_controller_1 = require("./auth/auth.controller");
const database_service_1 = require("./database/database.service");
const terminal_service_1 = require("./terminal/terminal.service");
const terminal_controller_1 = require("./terminal/terminal.controller");
const github_controller_1 = require("./controllers/github.controller");
const ssh_terminal_gateway_1 = require("./terminal/ssh-terminal.gateway");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            serve_static_1.ServeStaticModule.forRoot({
                rootPath: (0, path_1.join)(__dirname, '..', 'public'),
            }),
        ],
        controllers: [server_controller_1.ServerController, auth_controller_1.AuthController, terminal_controller_1.TerminalController, github_controller_1.GithubController],
        providers: [ssh_service_1.SshService, database_service_1.DatabaseService, terminal_service_1.TerminalService, ssh_terminal_gateway_1.SshTerminalGateway],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map