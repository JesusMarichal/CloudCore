import { Injectable, Logger } from '@nestjs/common';
import { WebSocketServer, WebSocket as WsClient } from 'ws';
import { Client } from 'ssh2';
import { DatabaseService } from '../database/database.service';
import { decrypt } from '../common/utils/encryption.util';

@Injectable()
export class SshTerminalGateway {
    private readonly logger = new Logger(SshTerminalGateway.name);

    constructor(private readonly dbService: DatabaseService) {}

    init(wss: WebSocketServer) {
        wss.on('connection', (ws: WsClient) => this.handleConnection(ws));
    }

    private handleConnection(ws: WsClient) {
        let sshConn: Client | null = null;
        let sshStream: any = null;

        const send = (data: string) => {
            if (ws.readyState === (ws as any).OPEN) ws.send(data);
        };

        ws.on('message', async (raw: Buffer | string) => {
            const msg = raw.toString();

            // Control messages are prefixed with \x01 followed by JSON
            if (msg.startsWith('\x01')) {
                try {
                    const ctrl = JSON.parse(msg.slice(1));
                    if (ctrl.type === 'init' && !sshConn) {
                        await this.startSession(ws, ctrl.serverId, send, (conn, stream) => {
                            sshConn = conn;
                            sshStream = stream;
                        });
                    } else if (ctrl.type === 'resize' && sshStream) {
                        sshStream.setWindow(ctrl.rows, ctrl.cols, 0, 0);
                    }
                } catch (e) {
                    this.logger.error('Control message parse error', e);
                }
                return;
            }

            // Raw terminal input — forward directly to SSH PTY
            if (sshStream) sshStream.write(raw);
        });

        ws.on('close', () => {
            sshConn?.end();
        });

        ws.on('error', (err) => {
            this.logger.error('WebSocket session error: ' + err.message);
            sshConn?.end();
        });
    }

    private async startSession(
        ws: WsClient,
        serverId: string,
        send: (data: string) => void,
        onReady: (conn: Client, stream: any) => void,
    ) {
        try {
            const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [serverId]);
            const serverData = result.rows[0];

            if (!serverData) {
                send('\r\n\x1b[31m❌ Servidor no encontrado\x1b[0m\r\n');
                return;
            }

            const conn = new Client();
            const config: any = {
                host: serverData.ip,
                port: serverData.ssh_port || 22,
                username: serverData.ssh_user || 'root',
                readyTimeout: 30000,
                keepaliveInterval: 15000,
                keepaliveCountMax: 8,
            };

            if (serverData.auth_type === 'key' && serverData.private_key) {
                config.privateKey = decrypt(serverData.private_key);
            } else if (serverData.auth_type === 'password' && serverData.password) {
                config.password = decrypt(serverData.password);
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

                    stream.on('data', (data: Buffer) => {
                        if ((ws as any).readyState === (ws as any).OPEN) ws.send(data.toString());
                    });

                    stream.stderr.on('data', (data: Buffer) => {
                        if ((ws as any).readyState === (ws as any).OPEN) ws.send(data.toString());
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
        } catch (err: any) {
            send(`\r\n\x1b[31m❌ Error: ${err.message}\x1b[0m\r\n`);
        }
    }
}
