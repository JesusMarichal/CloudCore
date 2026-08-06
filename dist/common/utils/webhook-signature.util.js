"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyGithubSignature = verifyGithubSignature;
const crypto = require("crypto");
function verifyGithubSignature(rawBody, signatureHeader, secret) {
    if (!rawBody || !signatureHeader || !secret)
        return false;
    if (!signatureHeader.startsWith('sha256='))
        return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(signatureHeader);
    if (expectedBuf.length !== receivedBuf.length)
        return false;
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}
//# sourceMappingURL=webhook-signature.util.js.map