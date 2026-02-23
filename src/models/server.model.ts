export interface Server {
  id: string;
  name: string;
  ip: string;
  status: 'online' | 'offline' | 'provisioning';
  lastHealthCheck: Date;
}
