"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWebhookSecret = exports.getPaddleClient = void 0;
const paddle_node_sdk_1 = require("@paddle/paddle-node-sdk");
let client = null;
const getPaddleClient = () => {
    if (client)
        return client;
    const apiKey = process.env.API_PADDLE;
    const environment = process.env.PADDLE_ENV;
    if (!apiKey) {
        throw new Error('Falta API_PADDLE (API key de servidor de Paddle) en el .env.');
    }
    if (environment !== 'sandbox' && environment !== 'production') {
        throw new Error(`PADDLE_ENV debe valer "sandbox" o "production" (ahora vale ${JSON.stringify(environment)}).`);
    }
    const isSandboxKey = apiKey.includes('_sdbx_');
    if (environment === 'sandbox' && !isSandboxKey) {
        throw new Error('PADDLE_ENV=sandbox pero API_PADDLE no es una key de sandbox (`_sdbx_`).');
    }
    if (environment === 'production' && isSandboxKey) {
        throw new Error('PADDLE_ENV=production pero API_PADDLE es una key de sandbox (`_sdbx_`).');
    }
    client = new paddle_node_sdk_1.Paddle(apiKey, {
        environment: environment,
        logLevel: paddle_node_sdk_1.LogLevel.error,
    });
    return client;
};
exports.getPaddleClient = getPaddleClient;
const getWebhookSecret = () => {
    const secret = process.env.PADDLE_WEBHOOK_SECRET;
    if (!secret) {
        throw new Error('Falta PADDLE_WEBHOOK_SECRET. Sin él no se puede verificar la firma de los webhooks.');
    }
    return secret;
};
exports.getWebhookSecret = getWebhookSecret;
//# sourceMappingURL=paddle.provider.js.map