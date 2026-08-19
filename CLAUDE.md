# CloudCore

Panel SaaS de automatización de infraestructura (gestión de VPS).

- **Backend:** NestJS 11 + TypeScript (CommonJS) en `src/`. Arranque: `npm run start:dev`.
- **Frontend:** React 19 + Vite + React Router en `frontend/`. Arranque: `npm run dev --prefix frontend`.
- **Ambos a la vez:** `npm run dev` (concurrently).
- **Base de datos:** PostgreSQL en Neon (`pg` directo, sin ORM).
- **Auth de la app:** JWT (`@nestjs/jwt`), secreto en `JWT_SECRET`.

## Integración con Paddle

Al escribir o modificar código que integre Paddle:

- Consulta siempre la documentación vigente con el MCP `paddle-docs` **antes** de proponer código. La API y los SDKs de Paddle cambian con frecuencia — no te fíes solo del conocimiento del modelo.
- SDKs oficiales para esta stack:
  - Backend (NestJS/Node) → `@paddle/paddle-node-sdk`
  - Frontend (React/Vite) → `@paddle/paddle-js` (Paddle.js)
- Todo el desarrollo va contra **sandbox**. Las API keys de sandbox contienen `_sdbx`; los client-side tokens de sandbox empiezan por `test_`.
- Verifica **siempre** la firma del webhook antes de actuar sobre el payload: `paddle.webhooks.unmarshal(rawBody, secret, signatureHeader)`.
  - En NestJS hace falta el **body crudo**: registra el endpoint de webhooks con `rawBody: true` en `NestFactory.create()` y lee `req.rawBody`. Si el body llega ya parseado a JSON, la firma no valida nunca.
  - Los webhooks se reintentan: la lógica debe ser **idempotente** (deduplica por `event_id`).
- Antes de cambios destructivos en la cuenta (actualizar precios, archivar productos, cancelar suscripciones) pide confirmación explícita antes de llamar a los MCP `paddle-sandbox` o `paddle-live`.
- Usa `paddle-sandbox` por defecto. Llama a `paddle-live` solo si el prompt menciona explícitamente live, producción o datos reales de clientes.
- Las API keys y los secretos de webhook viven en variables de entorno — nunca inline en el código.

### Variables de entorno de Paddle

| Variable | Dónde | Qué es |
| --- | --- | --- |
| `API_PADDLE` | backend (`.env`) | API key de sandbox (`pdl_sdbx_...`). Solo servidor, nunca al frontend. |
| `PADDLE_WEBHOOK_SECRET` | backend (`.env`) | Secreto de firma del destino de notificaciones. |
| `PADDLE_ENV` | backend (`.env`) | `sandbox` o `production`. |
| `VITE_PADDLE_CLIENT_TOKEN` | frontend (`frontend/.env`) | Client-side token (`test_...` en sandbox). Es público por diseño. |

Solo las variables con prefijo `VITE_` llegan al bundle del frontend. Nunca prefijes con `VITE_` una API key.

## Seguridad

- `.env` y `.env.example` están **versionados en git** con credenciales reales (Neon, SMTP, JWT, Paddle). Cualquier trabajo sobre secretos debe tener esto en cuenta; no añadas secretos nuevos a esos ficheros hasta que se saquen del repositorio.
