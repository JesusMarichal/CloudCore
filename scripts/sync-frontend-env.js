/**
 * Copia las variables `VITE_*` del .env de la raiz a `frontend/.env`.
 *
 * Por que hace falta: Vite incrusta las `VITE_*` en el bundle EN TIEMPO DE
 * COMPILACION, leyendolas de los ficheros .env del propio proyecto frontend. El
 * panel de despliegue, en cambio, escribe un unico .env en la raiz. Sin este
 * puente, el frontend se compila en el servidor sin token de Paddle y el
 * checkout no abre, aunque la variable este bien puesta en el despliegue.
 *
 * Se ejecuta desde `npm run build:all`. Es idempotente y no pisa nada que no
 * gestione: reescribe frontend/.env solo si encuentra variables VITE_ en la
 * raiz; si no hay ninguna, deja intacto el fichero que ya hubiera (el caso
 * normal en local, donde frontend/.env se mantiene a mano).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ROOT_ENV = path.join(ROOT, '.env');
const FRONT_ENV = path.join(ROOT, 'frontend', '.env');

/** Parseo minimo de .env: KEY=VALUE, ignorando comentarios y lineas sueltas. */
function parseEnv(text) {
    const out = {};
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
        out[key] = trimmed.slice(eq + 1).trim();
    }
    return out;
}

if (!fs.existsSync(ROOT_ENV)) {
    console.log('[sync-frontend-env] No hay .env en la raiz; se deja frontend/.env como este.');
    process.exit(0);
}

const vite = Object.entries(parseEnv(fs.readFileSync(ROOT_ENV, 'utf8')))
    .filter(([k]) => k.startsWith('VITE_'));

if (vite.length === 0) {
    const yaHay = fs.existsSync(FRONT_ENV);
    console.log(
        `[sync-frontend-env] El .env de la raiz no trae variables VITE_. ` +
        (yaHay
            ? 'Se conserva el frontend/.env existente.'
            : 'AVISO: no hay frontend/.env, el bundle se compilara sin ellas.'),
    );
    process.exit(0);
}

const contenido =
    '# Generado por scripts/sync-frontend-env.js a partir del .env de la raiz.\n' +
    '# No lo edites a mano: se sobrescribe en cada `npm run build:all`.\n' +
    vite.map(([k, v]) => `${k}=${v}`).join('\n') +
    '\n';

fs.writeFileSync(FRONT_ENV, contenido);
console.log(`[sync-frontend-env] frontend/.env escrito con: ${vite.map(([k]) => k).join(', ')}`);
