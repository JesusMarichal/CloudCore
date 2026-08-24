# Graph Report - CloudCore  (2026-08-23)

## Corpus Check
- 104 files · ~97,747 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 810 nodes · 1598 edges · 81 communities (42 shown, 39 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 99 edges (avg confidence: 0.79)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5eba996c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- App.tsx
- .query
- app.module.ts
- .deploy
- scripts
- auth.controller.ts
- dependencies
- compilerOptions
- CloudCore Platform
- devDependencies
- compilerOptions
- compilerOptions
- Billing.tsx
- bcrypt
- nest-cli.json
- seed.ts
- Settings.tsx (casing conflict: views/Settings vs views/settings)
- frontend/tsconfig.json
- ADMIN Role
- dependencies
- class-validator
- cors
- dotenv
- CloudCore Favicon (Cloud Icon)
- Vite Logo
- eslint-plugin-react-dom
- helmet
- @nestjs/config
- @nestjs/core
- Login.tsx
- Settings.tsx
- @nestjs/throttler
- @octokit/rest
- pg
- reflect-metadata
- server.controller.ts
- ssh2
- ts-node
- @types/bcrypt
- @types/node
- @types/pg
- @types/ssh2
- typescript
- ws
- xterm
- xterm-addon-fit
- POST /auth/login Endpoint
- src/main.ts (Entry Point)
- billing.controller.ts
- Dashboard.tsx
- index.tsx
- BillingRepository
- paddle-webhook-local.js
- MailService
- Profile.tsx
- deploy.module.ts
- paddle-webhook.controller.ts
- DatabaseService
- PaddleIpAllowlistService
- deploy.service.ts
- billing.module.ts
- frontend/package.json
- Toast.tsx
- SshTerminalGateway
- paddle-backfill.js
- Landing.tsx
- billing.repository.ts
- CloudCore
- vite-env.d.ts
- @eslint/js
- eslint-plugin-react-refresh
- react-router-dom
- @xterm/addon-fit
- typescript-eslint
- @nestjs/common
- @nestjs/jwt
- nodemailer
- @paddle/paddle-node-sdk

## God Nodes (most connected - your core abstractions)
1. `CurrentUser` - 47 edges
2. `ServerController` - 37 edges
3. `useT()` - 31 edges
4. `DatabaseService` - 27 edges
5. `Server` - 22 edges
6. `AuthController` - 21 edges
7. `compilerOptions` - 20 edges
8. `SshService` - 19 edges
9. `compilerOptions` - 18 edges
10. `BillingRepository` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Frontend Favicon (Cloud Icon)` --semantically_similar_to--> `CloudCore Favicon (Cloud Icon)`  [INFERRED] [semantically similar]
  frontend/public/favicon.png → favicon.png
- `CloudCore Platform` --semantically_similar_to--> `CloudCore (SEO/Marketing Entity)`  [INFERRED] [semantically similar]
  README.md → frontend/index.html
- `src/views/Terminal/Terminal.tsx` --conceptually_related_to--> `CloudCore Platform`  [INFERRED]
  frontend/build_output.txt → README.md
- `AvatarPicker()` --calls--> `useT()`  [EXTRACTED]
  frontend/src/components/AvatarPicker.tsx → frontend/src/i18n/index.tsx
- `CoreBotTour()` --calls--> `useT()`  [EXTRACTED]
  frontend/src/components/CoreBotTour.tsx → frontend/src/i18n/index.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **TS1261 File Casing Conflict Error** — frontend_build_output_app_tsx, frontend_build_output_settings_tsx, frontend_build_output_tsconfig_app_json [EXTRACTED 1.00]
- **CloudCore Backend Infrastructure Stack** — readme_cloudcore, readme_nestjs, readme_nginx, readme_pm2, readme_aws_ec2, readme_ssh2 [INFERRED 0.85]
- **JWT Authentication and Role Authorization Flow** — readme_auth_login_endpoint, readme_jwt, readme_admin_role, readme_client_role [INFERRED 0.85]

## Communities (81 total, 39 thin omitted)

### Community 0 - "App.tsx"
Cohesion: 0.15
Nodes (16): App(), ProtectedRoute(), useT(), cache, CreateServerData, ProvisioningStatus, serverService, DatabaseInstance (+8 more)

### Community 1 - ".query"
Cohesion: 0.08
Nodes (27): Delete, AuthController, Body, Controller, HttpCode, Post, verifyTOTP(), CurrentUser (+19 more)

### Community 2 - "app.module.ts"
Cohesion: 0.13
Nodes (13): Global, DatabaseModule, Module, DeployModule, Module, MailModule, Module, SshModule (+5 more)

### Community 3 - ".deploy"
Cohesion: 0.15
Nodes (9): DeployController, Body, Controller, Param, Post, Res, DeployService, resolve4 (+1 more)

### Community 4 - "scripts"
Cohesion: 0.05
Nodes (42): concurrently, @nestjs/cli, @nestjs/schematics, author, bugs, url, description, devDependencies (+34 more)

### Community 5 - "auth.controller.ts"
Cohesion: 0.12
Nodes (26): IsBoolean, IsEmail, IsOptional, IsString, Length, Matches, MinLength, b32ToBuffer() (+18 more)

### Community 6 - "dependencies"
Cohesion: 0.11
Nodes (19): axios, dependencies, axios, lucide, morphicons, @paddle/paddle-js, react, react-dom (+11 more)

### Community 7 - "compilerOptions"
Cohesion: 0.07
Nodes (26): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+18 more)

### Community 8 - "CloudCore Platform"
Cohesion: 0.08
Nodes (26): ChevronRight (unused import, TS6133), CreateServerData (type-only import required, TS1484), src/views/Terminal/Terminal.tsx, AbstracDev, CloudCore (SEO/Marketing Entity), Content-Security-Policy Meta Configuration, /src/main.tsx (React Entry Script), Open Graph Metadata (+18 more)

### Community 9 - "devDependencies"
Cohesion: 0.11
Nodes (19): eslint, eslint-plugin-react-hooks, devDependencies, eslint, eslint-plugin-react-hooks, globals, @types/node, @types/react (+11 more)

### Community 10 - "compilerOptions"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+14 more)

### Community 11 - "compilerOptions"
Cohesion: 0.09
Nodes (22): dist, frontend, node_modules, compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata (+14 more)

### Community 12 - "Billing.tsx"
Cohesion: 0.10
Nodes (33): FrequencyToggle(), FrequencyToggleProps, PlanCard(), PlanCardProps, PaddleConfig, readPaddleConfig(), BillingFrequency, PRICING_TIERS (+25 more)

### Community 14 - "nest-cli.json"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 16 - "Settings.tsx (casing conflict: views/Settings vs views/settings)"
Cohesion: 0.67
Nodes (3): src/App.tsx, Settings.tsx (casing conflict: views/Settings vs views/settings), tsconfig.app.json (include pattern 'src')

### Community 18 - "ADMIN Role"
Cohesion: 1.00
Nodes (3): ADMIN Role, CLIENT Role, src/scripts/seed.ts

### Community 19 - "dependencies"
Cohesion: 0.22
Nodes (9): class-transformer, @nestjs/platform-express, @nestjs/serve-static, dependencies, class-transformer, @nestjs/platform-express, @nestjs/serve-static, rxjs (+1 more)

### Community 29 - "Login.tsx"
Cohesion: 0.18
Nodes (15): Alert(), AlertKind, AlertProps, ICONS, OTPInput(), Props, useToast(), TranslateFn (+7 more)

### Community 30 - "Settings.tsx"
Cohesion: 0.18
Nodes (11): API_URL, authFetch(), httpClient, StoredUser, tokenStorage, GithubSection(), SettingsTab, TABS (+3 more)

### Community 35 - "server.controller.ts"
Cohesion: 0.16
Nodes (12): decrypt(), encrypt(), getKey(), verifyGithubSignature(), DISCOVER_STEP, resolve4, CreateServerDto, PROVISION_STEPS (+4 more)

### Community 50 - "billing.controller.ts"
Cohesion: 0.15
Nodes (10): BillingController, Controller, Get, Post, ACCESS_GRANTING, getSubscriptionUiState(), grantsAccess(), SubscriptionRecord (+2 more)

### Community 51 - "Dashboard.tsx"
Cohesion: 0.18
Nodes (13): CoreBotTour(), CoreBotTourProps, Rect, STEPS, TourStep, AppNotification, Dashboard(), formatRelativeTime() (+5 more)

### Community 52 - "index.tsx"
Cohesion: 0.19
Nodes (12): DICTIONARIES, I18nContext, I18nContextValue, I18nProvider(), Lang, LANGUAGES, loadStoredLang(), resolve() (+4 more)

### Community 53 - "BillingRepository"
Cohesion: 0.22
Nodes (4): BillingRepository, Injectable, PaddleWebhookService, Injectable

### Community 54 - "paddle-webhook-local.js"
Cohesion: 0.18
Nodes (10): crypto, CUSTOMER, DRY, envelope(), now(), plusDays(), SEQUENCE, SUBSCRIPTION (+2 more)

### Community 55 - "MailService"
Cohesion: 0.23
Nodes (6): MailService, Injectable, buildPasswordResetEmailHtml(), escapeHtml(), buildVerificationEmailHtml(), escapeHtml()

### Community 56 - "Profile.tsx"
Cohesion: 0.22
Nodes (9): AvatarPicker(), AvatarPickerProps, ALL_AVATARS, AVATAR_PACKS, AvatarOption, AvatarPack, DEFAULT_AVATAR_ID, getAvatarUrl() (+1 more)

### Community 57 - "deploy.module.ts"
Cohesion: 0.27
Nodes (5): NodeStack, Injectable, DeployStack, StackRegistry, Injectable

### Community 58 - "paddle-webhook.controller.ts"
Cohesion: 0.23
Nodes (8): Headers, getPaddleClient(), getWebhookSecret(), PaddleWebhookController, Controller, HttpCode, Post, Req

### Community 60 - "PaddleIpAllowlistService"
Cohesion: 0.23
Nodes (5): ipv4InCidr(), ipv4ToInt(), normalizeIpv4(), PaddleIpAllowlistService, Injectable

### Community 61 - "deploy.service.ts"
Cohesion: 0.39
Nodes (5): DeployWebsiteDto, buildNginxScript(), locationBlock(), DeployContext, ServeMode

### Community 62 - "billing.module.ts"
Cohesion: 0.20
Nodes (8): BillingModule, Module, GEO_HEADERS, GeoController, Controller, Get, Req, UNKNOWN_CODES

### Community 63 - "frontend/package.json"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, dev, lint, preview, type (+1 more)

### Community 64 - "Toast.tsx"
Cohesion: 0.31
Nodes (7): AUTO_DISMISS_MS, ShowToast, ToastContext, ToastKind, ICONS, Toast, ToastProvider()

### Community 65 - "SshTerminalGateway"
Cohesion: 0.24
Nodes (4): AppModule, Module, SshTerminalGateway, Injectable

### Community 66 - "paddle-backfill.js"
Cohesion: 0.29
Nodes (3): { Environment, LogLevel, Paddle }, paddle, { Pool }

### Community 67 - "Landing.tsx"
Cohesion: 0.47
Nodes (5): buildDeepFeatures(), buildSteps(), commandText, commandTokens, Landing()

### Community 68 - "billing.repository.ts"
Cohesion: 0.33
Nodes (4): PaymentMethodSummary, SubscriptionUpsert, TransactionUpsert, SubscriptionEvent

### Community 69 - "CloudCore"
Cohesion: 0.40
Nodes (4): CloudCore, Integración con Paddle, Seguridad, Variables de entorno de Paddle

## Knowledge Gaps
- **252 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+247 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **39 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CurrentUser` connect `.query` to `.deploy`, `server.controller.ts`, `auth.controller.ts`, `billing.controller.ts`, `deploy.service.ts`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `DatabaseService` connect `DatabaseService` to `.query`, `app.module.ts`, `server.controller.ts`, `billing.repository.ts`, `auth.controller.ts`, `.deploy`, `SshTerminalGateway`, `MailService`, `deploy.service.ts`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `scripts`, `bcrypt`, `class-validator`, `cors`, `dotenv`, `helmet`, `@nestjs/config`, `@nestjs/core`, `@nestjs/throttler`, `@octokit/rest`, `pg`, `reflect-metadata`, `ssh2`, `ts-node`, `@types/bcrypt`, `@types/node`, `@types/pg`, `@types/ssh2`, `typescript`, `ws`, `xterm`, `xterm-addon-fit`, `@nestjs/common`, `@nestjs/jwt`, `nodemailer`, `@paddle/paddle-node-sdk`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _252 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1476923076923077 - nodes in this community are weakly interconnected._
- **Should `.query` be split into smaller, more focused modules?**
  _Cohesion score 0.0802675585284281 - nodes in this community are weakly interconnected._
- **Should `app.module.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13450292397660818 - nodes in this community are weakly interconnected._