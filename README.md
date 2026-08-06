# <p align="center">☁️ CloudCore 🚀</p>

<p align="center">
  <strong>Próxima Generación de Automatización de Infraestructura & Panel SaaS</strong><br>
  <em>Gestiona, Despliega y Escala Servidores VPS con facilidad</em>
</p>

---

## 📖 Descripción

**CloudCore** es una potente plataforma SaaS desarrollada sobre **NestJS**, diseñada para revolucionar la gestión de infraestructura. Permite el aprovisionamiento automatizado, la instalación de stacks tecnológicos y el despliegue de aplicaciones mediante conexiones **SSH programáticas** directas a instancias VPS.

---

## ✨ Características Principales

- 🦾 **Aprovisionamiento One-Click**: Instalación automática de Nginx, Node.js, PM2 y más.
- 🔐 **Gestión de Seguridad**: Manejo automatizado de llaves `.pem` y configuración de firewalls.
- 🚀 **Despliegue Continuo**: Sincronización de código vía SFTP y recargas automáticas.
- 📊 **Monitoreo en Vivo**: Visualización de logs del sistema en tiempo real.
- 🌐 **Reverse Proxy Setup**: Configuración automática de dominios y certificados SSL.

---

## 🏗️ Arquitectura MVC (Model-View-Controller)

Para maximizar el orden y la escalabilidad, el proyecto está estructurado bajo el patrón **MVC**:

- 📂 **Models**: Define la estructura de datos y la lógica de persistencia (Entidades).
- 📂 **Views** (Opcional/API): Representación de datos (DTOs y Respuestas JSON).
- 📂 **Controllers**: Gestiona las peticiones entrantes y delega la lógica a los servicios.
- 📂 **Services**: Contiene la lógica profunda de negocio (Model logic).

---

## 🛠️ Stack Tecnológico

| Componente | Tecnología |
| :--- | :--- |
| **Backend** | NestJS (v20+) / TypeScript |
| **SSN Engine** | `ssh2` (Protocolo seguro) |
| **Runtime** | Node.js v20 LTS |
| **Reverse Proxy** | Nginx |
| **Procesos** | PM2 |
| **Infraestructura** | Amazon Web Services (EC2) |

---

## 🚀 Inicio Rápido

### Requisitos Previos

- Node.js v20.x
- AWS CLI configurado (opcional)
- Acceso SSH a tus instancias

### Instalación

1.  **Clonar el repositorio**
    ```bash
    git clone https://github.com/tu-usuario/CloudCore.git
    cd CloudCore
    ```

2.  **Instalar dependencias**
    ```bash
    npm install
    ```

3.  **Configurar Variables de Entorno**
    Crea un archivo `.env` basado en `.env.example`:
    ```env
    MASTER_SERVER_IP=18.118.32.137
    SSH_USER=ubuntu
    SSH_KEY_PATH=C:/ruta/a/tu/CloudCore.pem
    ```

4.  **Ejecutar en Desarrollo**
    ```bash
    npm run start:dev
    ```

---

## 📂 Estructura del Proyecto

```text
src/
├── controllers/    # Controladores de la API
├── services/       # Lógica de negocio (Model)
├── models/         # Entidades y Esquemas de BD
├── dto/            # Data Transfer Objects
├── config/         # Configuraciones globales
├── common/         # Utilidades y Middlewares
└── main.ts         # Punto de entrada
```

---

## 📝 Próximos Pasos

- [ ] Implementar `SshService` para ejecución remota.
- [ ] Módulo de aprovisionamiento de Nginx.
- [ ] Integración de WebSockets para logs en vivo.
- [ ] Panel de administración en React/NextJS.

---

<p align="center">Desarrollado con ❤️ desde 🇻🇪</p>