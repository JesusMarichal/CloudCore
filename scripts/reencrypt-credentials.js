/**
 * Recifra las credenciales SSH guardadas: de la clave por defecto que hay
 * escrita en `src/common/utils/encryption.util.ts` a la ENCRYPTION_KEY real.
 *
 * Contexto: `ENCRYPTION_KEY` estuvo comentada en el .env, asi que getKey() cayo
 * siempre al literal del codigo — que esta publicado en el repo. Activar la
 * variable sin recifrar dejaria las credenciales existentes ilegibles, porque
 * aes-256-cbc no descifra lo que se cifro con otra clave.
 *
 * Uso:
 *   node scripts/reencrypt-credentials.js            # simulacro, no escribe
 *   node scripts/reencrypt-credentials.js --apply    # aplica los cambios
 *
 * Antes de escribir vuelca los valores actuales a un .json con marca de tiempo,
 * para poder revertir. Todo el UPDATE va en una transaccion.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/** El literal de encryption.util.ts, con el que se cifro todo hasta ahora. */
const OLD_KEY_RAW = 'default_secret_key_32_chars_long!!';
const NEW_KEY_RAW = process.env.ENCRYPTION_KEY;

const APPLY = process.argv.includes('--apply');

// Misma derivacion que encryption.util.ts: rellenar/recortar a 32 bytes.
const toKey = (raw) => Buffer.alloc(32, raw).slice(0, 32);

function decrypt(text, keyRaw) {
    const parts = String(text).split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const enc = Buffer.from(parts.join(':'), 'hex');
    const d = crypto.createDecipheriv(ALGORITHM, toKey(keyRaw), iv);
    return Buffer.concat([d.update(enc), d.final()]).toString();
}

function encrypt(text, keyRaw) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const c = crypto.createCipheriv(ALGORITHM, toKey(keyRaw), iv);
    const enc = Buffer.concat([c.update(Buffer.from(text)), c.final()]);
    return iv.toString('hex') + ':' + enc.toString('hex');
}

const isEncrypted = (v) => typeof v === 'string' && /^[0-9a-f]{32}:[0-9a-f]+$/.test(v);

(async () => {
    if (!NEW_KEY_RAW) {
        console.error('ENCRYPTION_KEY no esta definida en el .env. Descomentala antes de ejecutar --apply.');
        process.exit(1);
    }
    if (NEW_KEY_RAW === OLD_KEY_RAW) {
        console.error('ENCRYPTION_KEY es identica a la clave por defecto: no hay nada que recifrar.');
        process.exit(1);
    }

    const pool = new Pool({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: { rejectUnauthorized: false },
    });

    const { rows } = await pool.query(
        'SELECT id, name, ip, auth_type, private_key, password FROM servers ORDER BY created_at',
    );

    const plan = [];
    const skipped = [];

    for (const s of rows) {
        const updates = {};
        for (const col of ['private_key', 'password']) {
            const val = s[col];
            if (!val) continue;
            if (!isEncrypted(val)) {
                skipped.push({ server: s.name, col, reason: 'no tiene formato iv:cipher' });
                continue;
            }
            // Si ya descifra con la clave nueva, esta fila ya se migro.
            try {
                decrypt(val, NEW_KEY_RAW);
                skipped.push({ server: s.name, col, reason: 'ya cifrado con la clave nueva' });
                continue;
            } catch { /* sigue: toca migrarlo */ }

            let plain;
            try {
                plain = decrypt(val, OLD_KEY_RAW);
            } catch (e) {
                skipped.push({ server: s.name, col, reason: 'no descifra con NINGUNA de las dos claves' });
                continue;
            }
            updates[col] = encrypt(plain, NEW_KEY_RAW);
        }
        if (Object.keys(updates).length) {
            plan.push({ id: s.id, name: s.name, ip: s.ip, auth_type: s.auth_type, updates });
        }
    }

    console.log(`Servidores en la base: ${rows.length}`);
    console.log(`A recifrar: ${plan.length}`);
    for (const p of plan) {
        console.log(`  - ${p.name} (${p.ip}) auth=${p.auth_type} -> columnas: ${Object.keys(p.updates).join(', ')}`);
    }
    if (skipped.length) {
        console.log('Omitidos:');
        for (const s of skipped) console.log(`  - ${s.server}.${s.col}: ${s.reason}`);
    }

    if (!APPLY) {
        console.log('\nSimulacro. Nada se ha escrito. Ejecuta con --apply para aplicar.');
        await pool.end();
        return;
    }

    if (!plan.length) {
        console.log('\nNada que hacer.');
        await pool.end();
        return;
    }

    // Copia de seguridad de los valores actuales antes de tocar nada.
    const backupPath = path.join(__dirname, '..', `credentials-backup-${Date.now()}.json`);
    fs.writeFileSync(
        backupPath,
        JSON.stringify(
            rows.map((r) => ({ id: r.id, name: r.name, private_key: r.private_key, password: r.password })),
            null,
            2,
        ),
    );
    console.log(`\nCopia de seguridad: ${backupPath}`);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const p of plan) {
            const cols = Object.keys(p.updates);
            const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
            await client.query(
                `UPDATE servers SET ${sets} WHERE id = $${cols.length + 1}`,
                [...cols.map((c) => p.updates[c]), p.id],
            );
        }
        await client.query('COMMIT');
        console.log(`Recifrados ${plan.length} servidor(es).`);
    } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        console.error('ERROR, nada se ha cambiado:', e.message);
        process.exit(1);
    } finally {
        client.release();
    }

    // Verificacion: releer y descifrar con la clave nueva.
    const check = await pool.query('SELECT name, auth_type, private_key, password FROM servers');
    let ok = 0;
    for (const s of check.rows) {
        const blob = s.auth_type === 'key' ? s.private_key : s.password;
        if (!blob) continue;
        try {
            const len = decrypt(blob, NEW_KEY_RAW).length;
            console.log(`  OK ${s.name}: descifra con la clave nueva (${len} caracteres)`);
            ok++;
        } catch (e) {
            console.error(`  FALLO ${s.name}: ${e.message.split('\n')[0]}`);
        }
    }
    console.log(`\nVerificacion: ${ok} credencial(es) legibles con ENCRYPTION_KEY.`);

    await pool.end();
})().catch((e) => {
    console.error('ERR', e.message);
    process.exit(1);
});
