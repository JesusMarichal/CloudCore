import { Client } from 'pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

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

        // 2. Preparar datos de Jesus Marichal
        const name = 'Jesus Marichal';
        const email = 'jesusmarichal0@gmail.com'; // En minúsculas para consistencia
        const rawPassword = '28344112';

        // Encriptar contraseña para máxima seguridad
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(rawPassword, salt);

        // 3. Insertar con ON CONFLICT para actualizar si ya existe o no duplicar
        const seedQuery = `
            INSERT INTO users (name, email, password)
            VALUES ($1, $2, $3)
            ON CONFLICT (email) 
            DO UPDATE SET 
                name = EXCLUDED.name,
                password = EXCLUDED.password;
        `;

        await client.query(seedQuery, [name, email, hashedPassword]);

        console.log(`✅ Usuario ${email} insertado/actualizado con éxito.`);
        console.log('--- Seeder Finalizado ---');

    } catch (error) {
        console.error('❌ Error en el seeder:', error);
    } finally {
        await client.end();
    }
}

seed();
