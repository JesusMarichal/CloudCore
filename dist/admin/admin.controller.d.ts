import { DatabaseService } from '../database/database.service';
import { ListUsersQueryDto, UpdateUserDto } from './dto/admin.dto';
export declare class AdminController {
    private readonly db;
    private readonly logger;
    constructor(db: DatabaseService);
    private static readonly USER_SELECT;
    private toUser;
    private findUser;
    private countAdmins;
    listUsers(query: ListUsersQueryDto): Promise<{
        users: {
            id: string;
            name: any;
            email: any;
            role: string;
            avatar: any;
            createdAt: any;
            twoFactorEnabled: boolean;
            failedAttempts: any;
            lockedUntil: any;
            onboardingDone: boolean;
            hasGithubToken: boolean;
            serverCount: any;
            subscription: {
                subscriptionId: any;
                status: any;
                priceId: any;
                nextBilledAt: any;
                scheduledChangeAction: any;
                scheduledChangeAt: any;
            };
        }[];
        total: number;
        admins: number;
        clients: number;
    }>;
    getUser(id: string): Promise<{
        servers: {
            id: string;
            name: any;
            ip: any;
            status: any;
            createdAt: any;
        }[];
        id: string;
        name: any;
        email: any;
        role: string;
        avatar: any;
        createdAt: any;
        twoFactorEnabled: boolean;
        failedAttempts: any;
        lockedUntil: any;
        onboardingDone: boolean;
        hasGithubToken: boolean;
        serverCount: any;
        subscription: {
            subscriptionId: any;
            status: any;
            priceId: any;
            nextBilledAt: any;
            scheduledChangeAction: any;
            scheduledChangeAt: any;
        };
    }>;
    updateUser(id: string, body: UpdateUserDto, actorId: string): Promise<{
        success: boolean;
        changed: boolean;
        user: {
            id: string;
            name: any;
            email: any;
            role: string;
            avatar: any;
            createdAt: any;
            twoFactorEnabled: boolean;
            failedAttempts: any;
            lockedUntil: any;
            onboardingDone: boolean;
            hasGithubToken: boolean;
            serverCount: any;
            subscription: {
                subscriptionId: any;
                status: any;
                priceId: any;
                nextBilledAt: any;
                scheduledChangeAction: any;
                scheduledChangeAt: any;
            };
        };
    }>;
    unlockUser(id: string, actorId: string): Promise<{
        success: boolean;
        user: {
            id: string;
            name: any;
            email: any;
            role: string;
            avatar: any;
            createdAt: any;
            twoFactorEnabled: boolean;
            failedAttempts: any;
            lockedUntil: any;
            onboardingDone: boolean;
            hasGithubToken: boolean;
            serverCount: any;
            subscription: {
                subscriptionId: any;
                status: any;
                priceId: any;
                nextBilledAt: any;
                scheduledChangeAction: any;
                scheduledChangeAt: any;
            };
        };
    }>;
    deleteUser(id: string, actorId: string): Promise<{
        success: boolean;
        deletedId: string;
        email: any;
        removedServers: number;
    }>;
}
