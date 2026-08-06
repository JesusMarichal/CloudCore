import { JwtService } from '@nestjs/jwt';
import { WebSocketServer } from 'ws';
import { DatabaseService } from '../database/database.service';
export declare class SshTerminalGateway {
    private readonly dbService;
    private readonly jwtService;
    private readonly logger;
    constructor(dbService: DatabaseService, jwtService: JwtService);
    init(wss: WebSocketServer): void;
    private handleConnection;
    private startSession;
}
