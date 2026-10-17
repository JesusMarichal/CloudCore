import { Client } from 'pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

interface SeedUser {
    name: string;
    email: string;
    password: string;
    role: 'ADMIN' | 'CLIENT';
}

// Cuentas de demostracion con contrasenas conocidas: no usar en produccion.
const seedUsers: SeedUser[] = [
    { name: 'Test Admin', email: 'test.admin@cloudcore.local', password: 'TestAdmin123!', role: 'ADMIN' },
    { name: 'Test Client', email: 'test.client@cloudcore.local', password: 'TestClient123!', role: 'CLIENT' },
];

async function seed() {
    const client = new Client({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'postgres',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
    });

    try {
        await client.connect();

        // La tabla la crea DatabaseService al arrancar el backend; el seed no
        // duplica ese esquema para no desincronizarse de el.
        const { rows } = await client.query(`SELECT to_regclass('public.users') AS t`);
        if (!rows[0].t) {
            console.error('La tabla "users" no existe. Arranca el backend una vez (npm run start:dev) y repite.');
            process.exitCode = 1;
            return;
        }

        for (const u of seedUsers) {
            const hashedPassword = await bcrypt.hash(u.password, 12);
            await client.query(
                `INSERT INTO users (name, email, password, role)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (email)
                 DO UPDATE SET name = EXCLUDED.name, password = EXCLUDED.password, role = EXCLUDED.role`,
                [u.name, u.email, hashedPassword, u.role],
            );
            console.log(`Usuario ${u.email} (${u.role}) listo.`);
        }
    } catch (error) {
        console.error('Error en el seed:', error.message);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}

seed();
