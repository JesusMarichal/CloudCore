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

const seedUsers: SeedUser[] = [
    // Dueño de la plataforma — no tocar sus datos.
    { name: 'Jesus Marichal', email: 'jesusmarichal0@gmail.com', password: '28344112', role: 'ADMIN' },
    // Cuentas de prueba.
    { name: 'Test Client', email: 'test.client@cloudcore.local', password: 'TestClient123!', role: 'CLIENT' },
    { name: 'Test Admin', email: 'test.admin@cloudcore.local', password: 'TestAdmin123!', role: 'ADMIN' },
];

async function seed() {
    const client = new Client({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '6543'),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        console.log('--- Iniciando Seeder ---');

        // 1. Crear tabla si no existe (por seguridad)
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255),
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await client.query(createTableQuery);

        // 2. Asegurar que la columna role exista (por si este script corre antes que la app)
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                             WHERE table_name='users' AND column_name='role') THEN
                    ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'CLIENT';
                END IF;
            END $$;
        `);

        // 3. Insertar cada usuario con ON CONFLICT para actualizar si ya existe o no duplicar.
        const seedQuery = `
            INSERT INTO users (name, email, password, role)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (email)
            DO UPDATE SET
                name = EXCLUDED.name,
                password = EXCLUDED.password,
                role = EXCLUDED.role;
        `;

        for (const u of seedUsers) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(u.password, salt);
            await client.query(seedQuery, [u.name, u.email, hashedPassword, u.role]);
            console.log(`✅ Usuario ${u.email} (${u.role}) insertado/actualizado con éxito.`);
        }

        console.log('--- Seeder Finalizado ---');

    } catch (error) {
        console.error('❌ Error en el seeder:', error);
    } finally {
        await client.end();
    }
}

seed();
