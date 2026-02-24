export class CreateServerDto {
    name: string = '';
    ip: string = '';
    sshPort: number = 22;
    sshUser: string = 'root';
    authType: 'key' | 'password' = 'key';
    privateKey?: string;
    password?: string;
    userId?: string;
}


