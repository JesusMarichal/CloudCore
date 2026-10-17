# <p align="center">☁️ CloudCore 🚀</p>

<p align="center">
  <strong>Próxima Generación de Automatización de Infraestructura & Panel SaaS</strong><br>
  <em>Gestiona, Despliega y Escala Servidores VPS con facilidad</em>
</p>

---

## 📖 Descripción

**CloudCore** es un panel SaaS para gestionar servidores VPS. Se conecta a tus instancias por **SSH** y desde el navegador permite aprovisionarlas, desplegar aplicaciones desde GitHub, crear bases de datos y abrir una terminal interactiva.

## ✨ Características Principales

- 🦾 **Aprovisionamiento One-Click**: instala Nginx, Node.js, PM2, Docker y más en un VPS recién creado.
- 🚀 **Despliegue de sitios**: Node.js y WordPress desde un repositorio de GitHub, con auto-deploy por webhook.
- 🗄️ **Bases de datos**: crea contenedores de MySQL/PostgreSQL en tus servidores.
- 💻 **Terminal SSH en el navegador** (xterm.js + WebSocket).
- 🔐 **Seguridad**: JWT, 2FA (TOTP), credenciales SSH cifradas (AES-256) y roles `ADMIN` / `CLIENT`.
- 💳 **Facturación** con Paddle (opcional).
- 🌐 Interfaz en español e inglés, tema claro/oscuro.

## 🛠️ Stack Tecnológico

| Componente | Tecnología |
| :--- | :--- |
| **Backend** | NestJS 11 / TypeScript |
| **Frontend** | React 19 + Vite + React Router |
| **Base de datos** | PostgreSQL (`pg`, sin ORM) |
| **SSH** | `ssh2` |
| **Pagos** | Paddle Billing (opcional) |

---

## 🚀 Puesta en marcha (local)

### Requisitos

- [Node.js](https://nodejs.org/) 20 o superior
- [Docker](https://www.docker.com/) (para la base de datos local). Si prefieres usar una base de datos en la nube (Neon, Supabase…), no hace falta.
- Git

### 1. Clonar e instalar dependencias

```bash
git clone https://github.com/JesusMarichal/CloudCore.git
cd CloudCore
npm run install:all
```

`install:all` instala las dependencias del backend y del frontend.

### 2. Configurar las variables de entorno

```bash
cp .env.example .env
```

Abre `.env` y rellena **las dos variables obligatorias**:

| Variable | Cómo generarla |
| :--- | :--- |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | `openssl rand -hex 16` |

> Sin `openssl` (Windows): `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

El resto ya viene listo para funcionar en local. Las secciones de correo, GitHub y Paddle son **opcionales**.

### 3. Levantar la base de datos

```bash
npm run db:up
```

Arranca un PostgreSQL 16 en Docker (`localhost:5432`, usuario/clave/base `cloudcore`), que coincide con los valores de `.env.example`. Las tablas las crea el backend automáticamente la primera vez que arranca.

> **¿Base de datos en la nube?** Pon en `.env` el host, usuario y contraseña de Neon/Supabase y `DB_SSL=true`. Te saltas este paso.

### 4. Arrancar la aplicación

```bash
npm run dev
```

Arranca a la vez:

- **Backend** en http://localhost:3000
- **Frontend** en http://localhost:5173 ← abre esta

En la consola deberías ver `¡CONEXIÓN EXITOSA!` y `CloudCore Engine Running on port 3000`.

### 5. Crear usuarios de prueba

Con el backend ya arrancado al menos una vez (para que existan las tablas), en otra terminal:

```bash
npm run seed
```

| Rol | Email | Contraseña |
| :--- | :--- | :--- |
| `ADMIN` | `test.admin@cloudcore.local` | `TestAdmin123!` |
| `CLIENT` | `test.client@cloudcore.local` | `TestClient123!` |

> ⚠️ Son cuentas de demostración con contraseñas públicas. No las crees en un entorno de producción.

También puedes registrarte desde la propia app. **Si no configuraste SMTP**, el código de verificación del registro (y el enlace de "olvidé mi contraseña") aparece en la consola del backend, en una línea `[SMTP no configurado]`.

### 6. Probar el panel

- Inicia sesión con una de las cuentas anteriores.
- Para gestionar un servidor real necesitas un **VPS Ubuntu** con acceso SSH (IP, usuario y contraseña o clave `.pem`). Añádelo en **Servidores**.
- El rol `ADMIN` ve además la sección **Clientes**; el rol `CLIENT` ve **Facturación**.

---

## ⚙️ Configuración opcional

### Correo (SMTP)

Rellena `EMAIL_USER` y `EMAIL_PASS` en `.env`. Con Gmail hace falta una [contraseña de aplicación](https://myaccount.google.com/apppasswords), no la contraseña normal.

### Paddle (precios y facturación)

Sin Paddle, las páginas de **Precios** y **Facturación** muestran un aviso de configuración; el resto del panel funciona igual. Para activarlo, crea una cuenta de [sandbox de Paddle](https://sandbox-vendors.paddle.com/) y rellena en `.env`:

- `API_PADDLE` — API key de servidor (`pdl_sdbx_...`)
- `PADDLE_ENV=sandbox`
- `PADDLE_WEBHOOK_SECRET` — secreto del destino de notificaciones
- `VITE_PADDLE_CLIENT_TOKEN` (`test_...`) y `VITE_PADDLE_ENV=sandbox` — cópialos también a `frontend/.env` (plantilla en `frontend/.env.example`)

Para recibir webhooks en local: `npm run webhook:local`.

### GitHub (auto-deploy)

`GITHUB_WEBHOOK_SECRET` es el secreto con el que GitHub firma los webhooks de push. Cada usuario pega su token personal de GitHub en **Ajustes** del panel.

---

## 📦 Producción

```bash
npm run build:all   # compila el backend a dist/ y el frontend a public/
npm run start:prod  # sirve API + panel en el puerto 3000 (PORT)
```

En producción: usa secretos propios y largos, pon `FRONTEND_ORIGIN` con tu dominio y, si hay HTTPS delante (Nginx con certificado), `HTTPS_ENABLED=true`.

---

## 🧰 Scripts útiles

| Comando | Qué hace |
| :--- | :--- |
| `npm run install:all` | Instala dependencias de backend y frontend |
| `npm run db:up` / `npm run db:down` | Arranca / para el PostgreSQL local |
| `npm run dev` | Backend + frontend en modo desarrollo |
| `npm run seed` | Crea las cuentas de prueba |
| `npm run build:all` | Build de producción completo |

## 🔐 Autenticación

El login (`POST /auth/login`) devuelve un JWT (expira en 2h, configurable con `JWT_EXPIRES_IN`) que el frontend envía como `Authorization: Bearer <token>`. Cada usuario tiene un `role`: `ADMIN` o `CLIENT` (los registros nuevos son `CLIENT`).

## 📂 Estructura del Proyecto

```text
src/                  # Backend (NestJS)
├── auth/             # Login, registro, 2FA
├── admin/            # Gestión de clientes (ADMIN)
├── billing/          # Paddle: webhooks y suscripciones
├── controllers/      # Servidores y GitHub
├── database/         # Conexión y creación de tablas
├── deploy/           # Despliegue de sitios (Node, WordPress)
├── mail/             # Correo transaccional
├── services/         # Motor SSH
├── terminal/         # Terminal SSH por WebSocket
├── scripts/seed.ts   # Usuarios de prueba
└── main.ts           # Punto de entrada
frontend/             # Panel (React + Vite)
scripts/              # Utilidades (webhooks locales, backfill de Paddle…)
docker-compose.yml    # PostgreSQL local
```

## 🩺 Problemas frecuentes

- **`Faltan variables obligatorias en .env`** → rellena `JWT_SECRET` y `ENCRYPTION_KEY`.
- **`ERROR DE CONEXIÓN`** → comprueba que Docker está corriendo (`docker ps`) y que el puerto 5432 no lo usa otro Postgres. Con una base en la nube, revisa `DB_SSL=true`.
- **`npm run seed` dice que no existe la tabla `users`** → arranca el backend una vez antes.
- **No llega el código de verificación** → sin SMTP, búscalo en la consola del backend.

<p align="center">Desarrollado con ❤️ desde 🇻🇪</p>
