export interface User {
    id: string;
    username: string;
    discriminator: string;
    avatar?: string;
    roles: string[];
}

export interface ServiceStatus {
    id: string;
    name: string;
    status: 'online' | 'offline' | 'maintenance';
    lastRestarted: Date;
}

export interface NitradoService {
    id: string;
    name: string;
    type: string;
    status: ServiceStatus;
}

export interface AuthResponse {
    accessToken: string;
    refreshToken: string;
    user: User;
}

export interface Role {
    id: string;
    name: string;
    permissions: string[];
}