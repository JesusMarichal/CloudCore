"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const bcrypt = require("bcrypt");
const dotenv = require("dotenv");
const path = require("path");
dotenv.config({ path: path.join(__dirname, '../../.env') });
async function seed() {
    const client = new pg_1.Client({
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
        const name = 'Jesus Marichal';
        const email = 'jesusmarichal0@gmail.com';
        const rawPassword = '28344112';
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(rawPassword, salt);
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
    }
    catch (error) {
        console.error('❌ Error en el seeder:', error);
    }
    finally {
        await client.end();
    }
}
seed();
//# sourceMappingURL=seed.js.map