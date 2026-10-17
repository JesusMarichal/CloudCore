import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function getKey(): Buffer {
    // Sin valor por defecto: un literal en el repo es una clave publica y
    // cualquiera podria descifrar las credenciales SSH guardadas.
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        throw new Error('Falta ENCRYPTION_KEY en el .env (genera una con: openssl rand -hex 16).');
    }
    // Asegurar que la llave sea exactamente de 32 bytes para aes-256-cbc
    return Buffer.alloc(32, key).slice(0, 32);
}

export function encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

