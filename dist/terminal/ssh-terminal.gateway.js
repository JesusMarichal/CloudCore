"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var SshTerminalGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SshTerminalGateway = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const ssh2_1 = require("ssh2");
const database_service_1 = require("../database/database.service");
const encryption_util_1 = require("../common/utils/encryption.util");
let SshTerminalGateway = SshTerminalGateway_1 = class SshTerminalGateway {
    constructor(dbService, jwtService) {
        this.dbService = dbService;
        this.jwtService = jwtService;
        this.logger = new common_1.Logger(SshTerminalGateway_1.name);
    }
    init(wss) {
        wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    }
    handleConnection(ws, req) {
        let userId;
        try {
            const url = new URL(req.url || '', 'http://localhost');
            const token = url.searchParams.get('token');
            if (!token)
                throw new Error('Token no proporcionado');
            const payload = this.jwtService.verify(token);
            if (payload.scope === 'pre2fa')
                throw new Error('Token no válido para esta operación');
            userId = payload.sub;
        }
        catch (e) {
            ws.close(4401, 'Unauthorized');
            return;
        }
        let sshConn = null;
        let sshStream = null;
        const send = (data) => {
            if (ws.readyState === ws.OPEN)
                ws.send(data);
        };
        ws.on('message', async (raw) => {
            const msg = raw.toString();
            if (msg.startsWith('\x01')) {
                try {
                    const ctrl = JSON.parse(msg.slice(1));
                    if (ctrl.type === 'init' && !sshConn) {
                        await this.startSession(ws, ctrl.serverId, userId, send, (conn, stream) => {
                            sshConn = conn;
                            sshStream = stream;
                        });
                    }
                    else if (ctrl.type === 'resize' && sshStream) {
                        sshStream.setWindow(ctrl.rows, ctrl.cols, 0, 0);
                    }
                }
                catch (e) {
                    this.logger.error('Control message parse error', e);
                }
                return;
            }
            if (sshStream)
                sshStream.write(raw);
        });
        ws.on('close', () => {
            sshConn?.end();
        });
        ws.on('error', (err) => {
            this.logger.error('WebSocket session error: ' + err.message);
            sshConn?.end();
        });
    }
    async startSession(ws, serverId, userId, send, onReady) {
        try {
            const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [serverId]);
            const serverData = result.rows[0];
            if (!serverData) {
                send('\r\n\x1b[31m❌ Servidor no encontrado\x1b[0m\r\n');
                return;
            }
            if (String(serverData.user_id) !== String(userId)) {
                send('\r\n\x1b[31m❌ No autorizado para este servidor\x1b[0m\r\n');
                return;
            }
            const conn = new ssh2_1.Client();
            const config = {
                host: serverData.ip,
                port: serverData.ssh_port || 22,
                username: serverData.ssh_user || 'root',
                readyTimeout: 30000,
                keepaliveInterval: 15000,
                keepaliveCountMax: 8,
            };
            if (serverData.auth_type === 'key' && serverData.private_key) {
                config.privateKey = (0, encryption_util_1.decrypt)(serverData.private_key);
            }
            else if (serverData.auth_type === 'password' && serverData.password) {
                config.password = (0, encryption_util_1.decrypt)(serverData.password);
            }
            conn.on('ready', () => {
                this.logger.log(`SSH Shell abierto para ${serverData.ip}`);
                conn.shell({ term: 'xterm-256color', cols: 220, rows: 50 }, (err, stream) => {
                    if (err) {
                        send(`\r\n\x1b[31m❌ Error abriendo shell: ${err.message}\x1b[0m\r\n`);
                        conn.end();
                        return;
                    }
                    onReady(conn, stream);
                    stream.on('data', (data) => {
                        if (ws.readyState === ws.OPEN)
                            ws.send(data.toString());
                    });
                    stream.stderr.on('data', (data) => {
                        if (ws.readyState === ws.OPEN)
                            ws.send(data.toString());
                    });
                    stream.on('close', () => {
                        send('\r\n\x1b[90m[Sesión SSH cerrada]\x1b[0m\r\n');
                        ws.close();
                    });
                });
            });
            conn.on('error', (err) => {
                send(`\r\n\x1b[31m❌ Error SSH: ${err.message}\x1b[0m\r\n`);
            });
            conn.connect(config);
        }
        catch (err) {
            send(`\r\n\x1b[31m❌ Error: ${err.message}\x1b[0m\r\n`);
        }
    }
};
exports.SshTerminalGateway = SshTerminalGateway;
exports.SshTerminalGateway = SshTerminalGateway = SshTerminalGateway_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        jwt_1.JwtService])
], SshTerminalGateway);
//# sourceMappingURL=ssh-terminal.gateway.js.map