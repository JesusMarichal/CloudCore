import * as crypto from 'crypto';

export function verifyGithubSignature(
    rawBody: Buffer | string | undefined,
    signatureHeader: string | undefined,
    secret: string | undefined,
): boolean {
    if (!rawBody || !signatureHeader || !secret) return false;
    if (!signatureHeader.startsWith('sha256=')) return false;

    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(signatureHeader);

    if (expectedBuf.length !== receivedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}
