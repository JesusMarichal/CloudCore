# Graph Report - CloudCore  (2026-08-13)

## Corpus Check
- Corpus is ~33,734 words - fits in a single context window. You may not need a graph.

## Summary
- 543 nodes · 986 edges · 50 communities (19 shown, 31 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 66 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Frontend Auth & Routing
- Frontend API/Server Services
- NestJS App Module & Guards
- Database Service & Migrations
- Backend Package Config
- Auth Controller & DTO Validation
- Frontend Dependencies
- Frontend App TS Config
- Build Errors & SEO Meta
- Frontend ESLint Config
- Frontend Node TS Config
- Frontend Root TS Config
- GitHub Webhook Controller
- Auth Backend Dependencies
- Nest CLI Config
- DB Seed Script
- Settings Casing Conflict
- Frontend TS Project References
- User Roles (ADMIN/CLIENT)
- class-transformer Dependency
- class-validator Dependency
- cors Dependency
- dotenv Dependency
- CloudCore Favicon Assets
- Vite/React Branding Assets
- ESLint React Plugins
- helmet Dependency
- NestJS Config Module
- NestJS Core Dependency
- NestJS Express Platform
- NestJS Static Serving
- NestJS Rate Throttling
- Octokit GitHub SDK
- pg (Postgres) Dependency
- reflect-metadata Dependency
- rxjs Dependency
- ssh2 Dependency
- ts-node Dependency
- bcrypt Type Definitions
- Node Type Definitions
- pg Type Definitions
- ssh2 Type Definitions
- TypeScript Compiler
- ws (WebSocket) Dependency
- xterm Terminal Emulator
- xterm-addon-fit Dependency
- JWT Login Flow
- Backend Entry Point

## God Nodes (most connected - your core abstractions)
1. `CurrentUser` - 40 edges
2. `ServerController` - 35 edges
3. `DatabaseService` - 22 edges
4. `Server` - 22 edges
5. `compilerOptions` - 20 edges
6. `SshService` - 19 edges
7. `compilerOptions` - 18 edges
8. `compilerOptions` - 18 edges
9. `AuthController` - 15 edges
10. `scripts` - 14 edges

## Surprising Connections (you probably didn't know these)
- `CloudCore Platform` --semantically_similar_to--> `CloudCore (SEO/Marketing Entity)`  [INFERRED] [semantically similar]
  README.md → frontend/index.html
- `Frontend Favicon (Cloud Icon)` --semantically_similar_to--> `CloudCore Favicon (Cloud Icon)`  [INFERRED] [semantically similar]
  frontend/public/favicon.png → favicon.png
- `src/views/Terminal/Terminal.tsx` --conceptually_related_to--> `CloudCore Platform`  [INFERRED]
  frontend/build_output.txt → README.md
- `GithubSection()` --calls--> `authFetch()`  [EXTRACTED]
  frontend/src/views/settings/Settings.tsx → frontend/src/services/apiFetch.ts
- `DeployContext` --references--> `Server`  [EXTRACTED]
  src/deploy/stacks/stack.interface.ts → src/models/server.model.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **CloudCore Backend Infrastructure Stack** — readme_cloudcore, readme_nestjs, readme_nginx, readme_pm2, readme_aws_ec2, readme_ssh2 [INFERRED 0.85]
- **JWT Authentication and Role Authorization Flow** — readme_auth_login_endpoint, readme_jwt, readme_admin_role, readme_client_role [INFERRED 0.85]
- **TS1261 File Casing Conflict Error** — frontend_build_output_app_tsx, frontend_build_output_settings_tsx, frontend_build_output_tsconfig_app_json [EXTRACTED 1.00]

## Communities (50 total, 31 thin omitted)

### Community 0 - "Frontend Auth & Routing"
Cohesion: 0.07
Nodes (38): App(), OTPInput(), Props, ProtectedRoute(), API_URL, authFetch(), AuthService, httpClient (+30 more)

### Community 1 - "Frontend API/Server Services"
Cohesion: 0.13
Nodes (13): Delete, CurrentUser, Get, ServerController, Body, Controller, Get, Param (+5 more)

### Community 2 - "NestJS App Module & Guards"
Cohesion: 0.06
Nodes (26): Global, AppModule, Module, JwtAuthGuard, Injectable, JwtPayload, UserRole, IS_PUBLIC_KEY (+18 more)

### Community 3 - "Database Service & Migrations"
Cohesion: 0.09
Nodes (21): DatabaseService, Injectable, DeployController, Body, Controller, Param, Post, Res (+13 more)

### Community 4 - "Backend Package Config"
Cohesion: 0.05
Nodes (39): concurrently, @nestjs/cli, @nestjs/schematics, author, bugs, url, description, devDependencies (+31 more)

### Community 5 - "Auth Controller & DTO Validation"
Cohesion: 0.15
Nodes (22): HttpCode, IsEmail, IsString, Length, MinLength, AuthController, b32ToBuffer(), generateSecret() (+14 more)

### Community 6 - "Frontend Dependencies"
Cohesion: 0.07
Nodes (28): axios, dependencies, axios, lucide-react, react, react-dom, react-router-dom, recharts (+20 more)

### Community 7 - "Frontend App TS Config"
Cohesion: 0.07
Nodes (26): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+18 more)

### Community 8 - "Build Errors & SEO Meta"
Cohesion: 0.08
Nodes (26): ChevronRight (unused import, TS6133), CreateServerData (type-only import required, TS1484), src/views/Terminal/Terminal.tsx, AbstracDev, CloudCore (SEO/Marketing Entity), Content-Security-Policy Meta Configuration, /src/main.tsx (React Entry Script), Open Graph Metadata (+18 more)

### Community 9 - "Frontend ESLint Config"
Cohesion: 0.08
Nodes (25): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks (+17 more)

### Community 10 - "Frontend Node TS Config"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+14 more)

### Community 11 - "Frontend Root TS Config"
Cohesion: 0.09
Nodes (22): dist, frontend, node_modules, compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata (+14 more)

### Community 12 - "GitHub Webhook Controller"
Cohesion: 0.32
Nodes (5): Req, GithubController, Body, Controller, Post

### Community 13 - "Auth Backend Dependencies"
Cohesion: 0.29
Nodes (7): bcrypt, @nestjs/common, @nestjs/jwt, dependencies, bcrypt, @nestjs/common, @nestjs/jwt

### Community 14 - "Nest CLI Config"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 16 - "Settings Casing Conflict"
Cohesion: 0.67
Nodes (3): src/App.tsx, Settings.tsx (casing conflict: views/Settings vs views/settings), tsconfig.app.json (include pattern 'src')

### Community 18 - "User Roles (ADMIN/CLIENT)"
Cohesion: 1.00
Nodes (3): ADMIN Role, CLIENT Role, src/scripts/seed.ts

## Knowledge Gaps
- **191 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+186 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **31 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Auth Backend Dependencies` to `Backend Package Config`, `class-transformer Dependency`, `class-validator Dependency`, `cors Dependency`, `dotenv Dependency`, `helmet Dependency`, `NestJS Config Module`, `NestJS Core Dependency`, `NestJS Express Platform`, `NestJS Static Serving`, `NestJS Rate Throttling`, `Octokit GitHub SDK`, `pg (Postgres) Dependency`, `reflect-metadata Dependency`, `rxjs Dependency`, `ssh2 Dependency`, `ts-node Dependency`, `bcrypt Type Definitions`, `Node Type Definitions`, `pg Type Definitions`, `ssh2 Type Definitions`, `TypeScript Compiler`, `ws (WebSocket) Dependency`, `xterm Terminal Emulator`, `xterm-addon-fit Dependency`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `CurrentUser` connect `Frontend API/Server Services` to `NestJS App Module & Guards`, `Database Service & Migrations`, `GitHub Webhook Controller`, `Auth Controller & DTO Validation`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `DatabaseService` connect `Database Service & Migrations` to `Frontend API/Server Services`, `NestJS App Module & Guards`, `GitHub Webhook Controller`, `Auth Controller & DTO Validation`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _191 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend Auth & Routing` be split into smaller, more focused modules?**
  _Cohesion score 0.06538461538461539 - nodes in this community are weakly interconnected._
- **Should `Frontend API/Server Services` be split into smaller, more focused modules?**
  _Cohesion score 0.13383985973115137 - nodes in this community are weakly interconnected._
- **Should `NestJS App Module & Guards` be split into smaller, more focused modules?**
  _Cohesion score 0.06431372549019608 - nodes in this community are weakly interconnected._