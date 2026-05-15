import { WebSocketServer } from 'ws';
import { DatabaseService } from '../database/database.service';
export declare class SshTerminalGateway {
    private readonly dbService;
    private readonly logger;
    constructor(dbService: DatabaseService);
    init(wss: WebSocketServer): void;
    private handleConnection;
    private startSession;
}
