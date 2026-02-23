import { Injectable } from '@nestjs/common';
import { Server } from '../models/server.model';

@Injectable()
export class SshService {
    /**
     * Ejecuta un comando remoto vía SSH
     */
    async executeCommand(server: Server, command: string): Promise<string> {
        console.log(`Ejecutando "${command}" en el servidor ${server.ip}...`);
        // Lógica de ssh2 aquí
        return `Resultado de: ${command}`;
    }

    /**
     * Instala el stack básico (Nginx, Node.js)
     */
    async provision(server: Server): Promise<void> {
        console.log(`Iniciando aprovisionamiento para ${server.name}...`);
        await this.executeCommand(server, 'sudo apt update && sudo apt upgrade -y');
        await this.executeCommand(server, 'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs');
    }
}
