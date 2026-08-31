# Graph Report - CloudCore  (2026-08-31)

## Corpus Check
- 86 files · ~114,994 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 963 nodes · 1937 edges · 88 communities (47 shown, 41 thin omitted)
- Extraction: 93% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 125 edges (avg confidence: 0.79)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Website Deploy Pipeline
- Auth And Email Flows
- Server Provisioning Controller
- Backend Build Tooling
- Lint And Build Diagnostics
- Shared UI Primitives
- Pricing And Paddle Hooks
- Runtime Dependencies
- App Routing And Guards
- Frontend TS Config
- Vite Node TS Config
- Backend TS Config
- Admin User Management API
- NestJS Module Wiring
- Admin Clients UI
- Deploy Controller Surface
- Settings And I18n Config
- Paddle Webhook Mirroring
- Dashboard And Onboarding Tour
- App Bootstrap And Crypto
- GitHub Webhook Integration
- Translation Dictionaries
- Local Webhook Simulator
- Websites Management View
- Paddle Client Provider
- Billing Controller
- JWT Auth Primitives
- Paddle IP Allowlist
- Database Schema Bootstrap
- Subscription Access Rules
- Toast Notifications
- Admin Request DTOs
- Geo Detection
- Project Doctrine Notes
- Hashing And Validation Deps
- Paddle.js Client Config
- Paddle Backfill Script
- Landing Page
- Nest CLI Config
- CLAUDE.md Sections
- Brand And Mascot Assets
- Vite React Plugins
- Database Module
- JWT Auth Guard
- Admin Role Guard
- Database Seeder
- Build Warnings
- Vite Env Types
- TS Project References
- Role Model Docs
- Dependency: class-validator
- Dependency: cors
- Dependency: dotenv
- Favicon Assets
- Framework Logos
- React Lint Plugins
- Dependency: helmet
- Dependency: @nestjs/common
- Dependency: @nestjs/config
- Dependency: @nestjs/core
- Dependency: @nestjs/jwt
- Dependency: @nestjs/platform-express
- Dependency: @nestjs/serve-static
- Dependency: @nestjs/throttler
- Dependency: nodemailer
- Dependency: @octokit/rest
- Dependency: @paddle/paddle-node-sdk
- Dependency: pg
- Dependency: rxjs
- Dependency: ssh2
- Dependency: ts-node
- Dependency: @types/bcrypt
- Dependency: @types/pg
- Dependency: @types/ssh2
- Dependency: ws
- Dependency: xterm
- Login Endpoint Docs
- Isolated Decorator Node
- Isolated Decorator Node
- Isolated Decorator Node
- Isolated Decorator Node
- Isolated Decorator Node
- Backend Entry Point
- Isolated Decorator Node
- Isolated Decorator Node

## God Nodes (most connected - your core abstractions)
1. `ServerController` - 37 edges
2. `DeployContext` - 34 edges
3. `DatabaseService` - 32 edges
4. `useT()` - 31 edges
5. `WordpressStack` - 25 edges
6. `SshService` - 22 edges
7. `AuthController` - 21 edges
8. `compilerOptions` - 20 edges
9. `DeployService` - 20 edges
10. `tokenStorage` - 19 edges

## Surprising Connections (you probably didn't know these)
- `CoreBot Mascot (full body)` --conceptually_related_to--> `CloudCore Brand Palette`  [AMBIGUOUS]
  frontend/src/assets/corebot.png → README_desarrollo.MD
- `Frontend Favicon (Cloud Icon)` --semantically_similar_to--> `CloudCore Favicon (Cloud Icon)`  [INFERRED] [semantically similar]
  frontend/public/favicon.png → favicon.png
- `typescript-eslint (tseslint type-aware rules)` --references--> `typescript`  [EXTRACTED]
  frontend/README.md → package.json
- `Content Security Policy` --conceptually_related_to--> `Paddle Integration Policy`  [INFERRED]
  frontend/index.html → CLAUDE.md
- `src/views/Terminal/Terminal.tsx` --conceptually_related_to--> `CloudCore Platform`  [INFERRED]
  frontend/build_output.txt → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Paddle Billing Integration Contract** — claude_paddle_integration_policy, claude_webhook_signature_verification, claude_webhook_idempotency, claude_paddle_env_vars, frontend_index_content_security_policy [EXTRACTED 1.00]
- **CoreBot Visual Identity** — frontend_src_assets_corebot_mascot, frontend_src_assets_corebot_head, frontend_src_assets_corebot_dark_variant [EXTRACTED 1.00]
- **TS1261 File Casing Conflict Error** — frontend_build_output_app_tsx, frontend_build_output_settings_tsx, frontend_build_output_tsconfig_app_json [EXTRACTED 1.00]
- **CloudCore Backend Infrastructure Stack** — readme_cloudcore, readme_nestjs, readme_nginx, readme_pm2, readme_aws_ec2, readme_ssh2 [INFERRED 0.85]
- **JWT Authentication and Role Authorization Flow** — readme_auth_login_endpoint, readme_jwt, readme_admin_role, readme_client_role [INFERRED 0.85]

## Communities (88 total, 41 thin omitted)

### Community 0 - "Website Deploy Pipeline"
Cohesion: 0.05
Nodes (39): DISCOVER_STEP, resolve4, WP_UPLOAD_EXTENSIONS, DeployService, parseStackConfig(), PORT_RANGE_END, PORT_RANGE_START, resolve4 (+31 more)

### Community 1 - "Auth And Email Flows"
Cohesion: 0.09
Nodes (37): IsBoolean, Matches, MinLength, AuthController, b32ToBuffer(), generateSecret(), getTOTP(), Body (+29 more)

### Community 2 - "Server Provisioning Controller"
Cohesion: 0.14
Nodes (11): ServerController, Body, Controller, CurrentUser, Delete, Get, Param, Post (+3 more)

### Community 3 - "Backend Build Tooling"
Cohesion: 0.05
Nodes (42): concurrently, @nestjs/cli, @nestjs/schematics, author, bugs, url, description, devDependencies (+34 more)

### Community 4 - "Lint And Build Diagnostics"
Cohesion: 0.05
Nodes (40): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, ChevronRight (unused import, TS6133), CreateServerData (type-only import required, TS1484), src/views/Terminal/Terminal.tsx, devDependencies (+32 more)

### Community 5 - "Shared UI Primitives"
Cohesion: 0.11
Nodes (24): Alert(), AlertKind, AlertProps, ICONS, AvatarPicker(), AvatarPickerProps, Props, useToast() (+16 more)

### Community 6 - "Pricing And Paddle Hooks"
Cohesion: 0.13
Nodes (27): FrequencyToggle(), FrequencyToggleProps, PlanCard(), PlanCardProps, BillingFrequency, PRICING_TIERS, Tier, useDetectedCountry() (+19 more)

### Community 7 - "Runtime Dependencies"
Cohesion: 0.06
Nodes (33): axios, dependencies, axios, lucide, morphicons, @paddle/paddle-js, react, react-dom (+25 more)

### Community 8 - "App Routing And Guards"
Cohesion: 0.12
Nodes (19): App(), AdminRoute(), authFetch(), cache, CreateServerData, ProvisioningStatus, serverService, StoredUser (+11 more)

### Community 9 - "Frontend TS Config"
Cohesion: 0.07
Nodes (26): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+18 more)

### Community 10 - "Vite Node TS Config"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+14 more)

### Community 11 - "Backend TS Config"
Cohesion: 0.09
Nodes (22): dist, frontend, node_modules, compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata (+14 more)

### Community 12 - "Admin User Management API"
Cohesion: 0.15
Nodes (12): Patch, Query, AdminController, Body, Controller, CurrentUser, Delete, Get (+4 more)

### Community 13 - "NestJS Module Wiring"
Cohesion: 0.13
Nodes (14): AdminModule, Module, BillingModule, Module, DeployModule, Module, MailModule, Module (+6 more)

### Community 14 - "Admin Clients UI"
Cohesion: 0.19
Nodes (14): AdminService, AdminUser, AdminUserDetail, AdminUserServer, AdminUsersResponse, AdminUserSubscription, UpdateUserPatch, UserRole (+6 more)

### Community 15 - "Deploy Controller Surface"
Cohesion: 0.15
Nodes (10): DeployController, Body, Controller, CurrentUser, Get, Param, Post, Res (+2 more)

### Community 16 - "Settings And I18n Config"
Cohesion: 0.15
Nodes (8): API_URL, LANGUAGES, GeoService, httpClient, LanguageSection(), Settings(), SettingsTab, TABS

### Community 17 - "Paddle Webhook Mirroring"
Cohesion: 0.20
Nodes (4): BillingRepository, Injectable, PaddleWebhookService, Injectable

### Community 18 - "Dashboard And Onboarding Tour"
Cohesion: 0.18
Nodes (13): CoreBotTour(), CoreBotTourProps, Rect, STEPS, TourStep, AppNotification, Dashboard(), formatRelativeTime() (+5 more)

### Community 19 - "App Bootstrap And Crypto"
Cohesion: 0.20
Nodes (7): AppModule, Module, decrypt(), encrypt(), getKey(), SshTerminalGateway, Injectable

### Community 20 - "GitHub Webhook Integration"
Cohesion: 0.21
Nodes (8): CurrentUser, verifyGithubSignature(), GithubController, Body, Controller, Get, Post, Req

### Community 21 - "Translation Dictionaries"
Cohesion: 0.21
Nodes (11): DICTIONARIES, I18nContext, I18nContextValue, I18nProvider(), Lang, loadStoredLang(), resolve(), TranslateVars (+3 more)

### Community 22 - "Local Webhook Simulator"
Cohesion: 0.18
Nodes (10): crypto, CUSTOMER, DRY, envelope(), now(), plusDays(), SEQUENCE, SUBSCRIPTION (+2 more)

### Community 23 - "Websites Management View"
Cohesion: 0.23
Nodes (9): adminUrlOf(), emptyForm(), loadAutoDeployedKeys(), siteUrlOf(), StackId, tracksCommits(), WebsiteFormData, Websites() (+1 more)

### Community 24 - "Paddle Client Provider"
Cohesion: 0.21
Nodes (9): Headers, getPaddleClient(), getWebhookSecret(), PaddleWebhookController, Controller, HttpCode, Post, Public (+1 more)

### Community 25 - "Billing Controller"
Cohesion: 0.21
Nodes (6): BillingController, Controller, CurrentUser, Get, Post, SubscriptionRecord

### Community 26 - "JWT Auth Primitives"
Cohesion: 0.24
Nodes (6): GEO_HEADERS, UNKNOWN_CODES, JwtPayload, UserRole, IS_PUBLIC_KEY, Public()

### Community 27 - "Paddle IP Allowlist"
Cohesion: 0.23
Nodes (5): ipv4InCidr(), ipv4ToInt(), normalizeIpv4(), PaddleIpAllowlistService, Injectable

### Community 29 - "Subscription Access Rules"
Cohesion: 0.24
Nodes (8): PaymentMethodSummary, SubscriptionUpsert, TransactionUpsert, ACCESS_GRANTING, getSubscriptionUiState(), grantsAccess(), SubscriptionStatus, SubscriptionUiState

### Community 30 - "Toast Notifications"
Cohesion: 0.31
Nodes (7): AUTO_DISMISS_MS, ShowToast, ToastContext, ToastKind, ICONS, Toast, ToastProvider()

### Community 31 - "Admin Request DTOs"
Cohesion: 0.33
Nodes (8): IsIn, MaxLength, ListUsersQueryDto, IsEmail, IsOptional, IsString, Length, UpdateUserDto

### Community 32 - "Geo Detection"
Cohesion: 0.22
Nodes (6): GeoController, Controller, Get, Public, Req, SubscriptionEvent

### Community 33 - "Project Doctrine Notes"
Cohesion: 0.25
Nodes (8): Paddle Environment Variables, Paddle Integration Policy, Secrets Committed To Git, CloudCore Stack, Webhook Idempotency, Webhook Signature Verification, Content Security Policy, SPA Mount Point

### Community 34 - "Hashing And Validation Deps"
Cohesion: 0.29
Nodes (7): bcrypt, class-transformer, dependencies, bcrypt, class-transformer, reflect-metadata, reflect-metadata

### Community 35 - "Paddle.js Client Config"
Cohesion: 0.43
Nodes (4): PaddleConfig, readPaddleConfig(), UsePaddleResult, getPaddle()

### Community 36 - "Paddle Backfill Script"
Cohesion: 0.29
Nodes (3): { Environment, LogLevel, Paddle }, paddle, { Pool }

### Community 37 - "Landing Page"
Cohesion: 0.47
Nodes (5): buildDeepFeatures(), buildSteps(), commandText, commandTokens, Landing()

### Community 38 - "Nest CLI Config"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 39 - "CLAUDE.md Sections"
Cohesion: 0.40
Nodes (4): CloudCore, Integración con Paddle, Seguridad, Variables de entorno de Paddle

### Community 40 - "Brand And Mascot Assets"
Cohesion: 0.40
Nodes (5): SEO And Social Metadata, CoreBot Mascot (dark variant), CoreBot Head Crop, CoreBot Mascot (full body), CloudCore Brand Palette

### Community 41 - "Vite React Plugins"
Cohesion: 0.50
Nodes (5): React, React Compiler (not enabled), Vite, @vitejs/plugin-react (Babel Fast Refresh), @vitejs/plugin-react-swc (SWC Fast Refresh)

### Community 42 - "Database Module"
Cohesion: 0.40
Nodes (3): Global, DatabaseModule, Module

### Community 46 - "Build Warnings"
Cohesion: 0.67
Nodes (3): src/App.tsx, Settings.tsx (casing conflict: views/Settings vs views/settings), tsconfig.app.json (include pattern 'src')

### Community 49 - "Role Model Docs"
Cohesion: 1.00
Nodes (3): ADMIN Role, CLIENT Role, src/scripts/seed.ts

## Ambiguous Edges - Review These
- `CloudCore Brand Palette` → `CoreBot Mascot (full body)`  [AMBIGUOUS]
  frontend/src/assets/corebot.png · relation: conceptually_related_to

## Knowledge Gaps
- **255 isolated node(s):** `Props`, `allowImportingTsExtensions`, `erasableSyntaxOnly`, `module`, `moduleDetection` (+250 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **41 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `CloudCore Brand Palette` and `CoreBot Mascot (full body)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `DatabaseService` connect `Database Schema Bootstrap` to `Website Deploy Pipeline`, `Auth And Email Flows`, `Server Provisioning Controller`, `Database Module`, `Admin User Management API`, `Admin Role Guard`, `Deploy Controller Surface`, `Paddle Webhook Mirroring`, `App Bootstrap And Crypto`, `GitHub Webhook Integration`, `JWT Auth Primitives`, `Subscription Access Rules`, `Admin Request DTOs`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Hashing And Validation Deps` to `Backend Build Tooling`, `Lint And Build Diagnostics`, `Runtime Dependencies`, `Dependency: class-validator`, `Dependency: cors`, `Dependency: dotenv`, `Dependency: helmet`, `Dependency: @nestjs/common`, `Dependency: @nestjs/config`, `Dependency: @nestjs/core`, `Dependency: @nestjs/jwt`, `Dependency: @nestjs/platform-express`, `Dependency: @nestjs/serve-static`, `Dependency: @nestjs/throttler`, `Dependency: nodemailer`, `Dependency: @octokit/rest`, `Dependency: @paddle/paddle-node-sdk`, `Dependency: pg`, `Dependency: rxjs`, `Dependency: ssh2`, `Dependency: ts-node`, `Dependency: @types/bcrypt`, `Dependency: @types/pg`, `Dependency: @types/ssh2`, `Dependency: ws`, `Dependency: xterm`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `DeployContext` connect `Website Deploy Pipeline` to `Server Provisioning Controller`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `Props`, `allowImportingTsExtensions`, `erasableSyntaxOnly` to the rest of the system?**
  _255 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Website Deploy Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.05207920792079208 - nodes in this community are weakly interconnected._
- **Should `Auth And Email Flows` be split into smaller, more focused modules?**
  _Cohesion score 0.08672659968270756 - nodes in this community are weakly interconnected._