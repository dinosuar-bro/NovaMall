# Stage 1 Foundation and Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 NovaMall 可运行的 React + Express + MySQL 基础设施，并完成注册、登录、会话、退出、CSRF 与三角色应用壳的可验证闭环。

**Architecture:** 使用 pnpm workspace 管理 `apps/api`、`apps/web` 和 `packages/shared`。Express 固定遵循 Route → Controller → Service → Repository；MySQL 使用显式 SQL、dbmate 迁移和自定义 Session Store；React 通过共享 Zod 合同消费 API，并使用 `impeccable` 设计系统及 `gsap`/`@gsap/react` 实现短促、可减少的状态动效。

**Tech Stack:** Node.js 24、pnpm 11、TypeScript strict、React、Vite、React Router、Express 5、MySQL 8.4、mysql2、Zod、express-session、Vitest、Testing Library、Supertest、Playwright、GSAP、@gsap/react、Docker Compose、dbmate。

---

## File Map

### Root and tooling

- Create: `package.json` — workspace scripts and shared dev dependencies.
- Create: `pnpm-workspace.yaml` — workspace package discovery.
- Create: `tsconfig.base.json` — strict TypeScript baseline.
- Create: `eslint.config.mjs` — TypeScript/React lint rules, including no explicit `any`.
- Create: `.env.example` — required configuration names and generation guidance.
- Modify: `.gitignore` — dependencies, builds, env files, uploads and test artifacts.

### Shared package

- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/auth.contract.ts`
- Create: `packages/shared/src/errors.ts`

### API

- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`
- Create: `apps/api/src/app.ts`, `apps/api/src/server.ts`
- Create: `apps/api/src/config/env.ts`
- Create: `apps/api/src/db/pool.ts`, `apps/api/src/db/transaction.ts`, `apps/api/src/db/session-store.ts`
- Create: `apps/api/src/errors/app-error.ts`, `apps/api/src/errors/error-handler.ts`
- Create: `apps/api/src/middleware/request-context.ts`, `apps/api/src/middleware/csrf.ts`, `apps/api/src/middleware/auth.ts`
- Create: `apps/api/src/modules/health/*`
- Create: `apps/api/src/modules/auth/auth.repository.ts`, `auth.service.ts`, `auth.controller.ts`, `auth.routes.ts`, `password.ts`, `session.ts`
- Create: `apps/api/src/types/express.d.ts`, `apps/api/src/types/session.d.ts`
- Create: `apps/api/tests/unit/*`, `apps/api/tests/integration/*`, `apps/api/tests/helpers/*`

### Database

- Create: `database/migrations/202606220001_initial_auth.sql` — 同一文件包含 dbmate 的 `migrate:up` 与 `migrate:down` 区段。
- Create: `database/seeds/roles.sql`
- Create: `database/seeds/create-demo-users.ts`

### Web

- Create: `apps/web/package.json`, `apps/web/tsconfig*.json`, `apps/web/vite.config.ts`, `apps/web/vitest.config.ts`, `apps/web/index.html`
- Create: `apps/web/src/main.tsx`, `apps/web/src/app/router.tsx`, `apps/web/src/app/providers.tsx`
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/features/auth/*`
- Create: `apps/web/src/layouts/member-layout.tsx`, `owner-layout.tsx`, `admin-layout.tsx`
- Create: `apps/web/src/pages/login-page.tsx`, `register-page.tsx`, `member-page.tsx`, `owner-page.tsx`, `admin-page.tsx`, `forbidden-page.tsx`
- Create: `apps/web/src/styles/tokens.css`, `global.css`
- Create: `apps/web/src/ui/button.tsx`, `field.tsx`, `status-message.tsx`, `brand-mark.tsx`
- Create: `apps/web/src/test/setup.ts`, `apps/web/src/**/*.test.tsx`

### Docker and E2E

- Create: `docker-compose.yml`, `docker-compose.test.yml`
- Create: `docker/api.Dockerfile`, `docker/web.Dockerfile`, `docker/nginx.conf`
- Create: `playwright.config.ts`, `tests/e2e/auth.spec.ts`
- Modify: `README.md`, `DESIGN.md`, `docs/api.md`, `docs/security.md`, `docs/testing-and-acceptance.md`

---

### Task 1: Establish the workspace and quality gates

**Files:** root tooling files and package manifests.

- [ ] **Step 1: Write the root package manifest**

Create scripts with one stable interface:

```json
{
  "name": "novamall",
  "private": true,
  "packageManager": "pnpm@11.6.0",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "pnpm --parallel --filter @novamall/api --filter @novamall/web dev",
    "lint": "eslint .",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "test:integration": "pnpm --filter @novamall/api test:integration",
    "test:e2e": "playwright test",
    "build": "pnpm -r build"
  }
}
```

- [ ] **Step 2: Create strict TypeScript and ESLint configuration**

`tsconfig.base.json` must include:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "useUnknownInCatchVariables": true,
    "skipLibCheck": true
  }
}
```

ESLint must reject `any`, floating promises, unsafe arguments and missing React hook dependencies.

- [ ] **Step 3: Install workspace dependencies**

Run approved pnpm commands for root, API, web and shared packages. Do not use npm/yarn. Record exact versions in `pnpm-lock.yaml`.

- [ ] **Step 4: Verify the empty workspace**

Run:

```bash
pnpm lint
pnpm typecheck
```

Expected: exit 0 with all packages discovered.

- [ ] **Step 5: Commit checkpoint after Git authorization**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json eslint.config.mjs .gitignore apps packages
git commit -m "build: initialize pnpm workspace"
```

### Task 2: Define shared contracts before API implementation

**Files:** `packages/shared/src/*`, shared tests.

- [ ] **Step 1: Write failing contract tests**

Test exact rules:

```ts
expect(registerInputSchema.safeParse({
  username: "nova_user",
  password: "StrongPass123!",
  displayName: "星选用户",
  phone: "13800138000"
}).success).toBe(true);

expect(registerInputSchema.safeParse({
  username: "x",
  password: "short",
  displayName: "",
  phone: "123"
}).success).toBe(false);
```

Also test `roleCodeSchema`, `loginInputSchema`, successful response schema and the stable error-code enum.

- [ ] **Step 2: Run tests and confirm RED**

```bash
pnpm --filter @novamall/shared test
```

Expected: FAIL because contract modules do not exist.

- [ ] **Step 3: Implement minimal Zod contracts**

Define:

```ts
export const roleCodeSchema = z.enum(["MEMBER", "OWNER", "ADMIN"]);
export const registerInputSchema = z.object({
  username: z.string().trim().min(3).max(50).regex(/^[A-Za-z0-9_]+$/),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(1).max(100),
  phone: z.string().regex(/^1[3-9]\d{9}$/)
});
export const loginInputSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(128)
});
```

Keep IDs as strings and money absent from Stage 1.

- [ ] **Step 4: Run tests and confirm GREEN**

```bash
pnpm --filter @novamall/shared test
pnpm --filter @novamall/shared typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit checkpoint after authorization**

```bash
git add packages/shared
git commit -m "feat: define authentication contracts"
```

### Task 3: Create the initial MySQL schema and migration workflow

**Files:** database migrations, Compose migration service, database test helpers.

- [ ] **Step 1: Write migration integration assertions**

The test must query `information_schema` and assert the exact tables and constraints:

```ts
expect(tableNames).toEqual(expect.arrayContaining([
  "users", "roles", "user_roles", "sessions", "schema_migrations"
]));
expect(roleCodes).toEqual(["ADMIN", "MEMBER", "OWNER"]);
```

Also attempt duplicate usernames, invalid status and duplicate user-role pairs and expect database errors.

- [ ] **Step 2: Run test and confirm RED**

```bash
docker compose -f docker-compose.test.yml up -d mysql-test
pnpm test:integration -- migration
```

Expected: FAIL because migrations and tables do not exist.

- [ ] **Step 3: Write the SQL migration**

Create one dbmate migration containing both directions. MySQL DDL has implicit commit semantics, so every statement must be independently valid and rollback is verified in a disposable database. Create InnoDB/utf8mb4 tables with explicit checks and foreign keys. The core shape is:

```sql
-- migrate:up

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  phone_cipher VARBINARY(255) NOT NULL,
  phone_iv BINARY(16) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  CONSTRAINT chk_users_status CHECK (status IN ('ACTIVE', 'DISABLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- migrate:down

DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS users;
```

Create roles, user_roles and sessions consistently with the approved ER document. The `migrate:down` section drops only Stage 1 objects in reverse dependency order.

- [ ] **Step 4: Run migrations and confirm GREEN**

Use dbmate against the test MySQL service, then run the migration tests twice to prove idempotent application.

- [ ] **Step 5: Verify rollback in a disposable database**

Run down then up. Expected: Stage 1 tables disappear and recreate without manual edits.

- [ ] **Step 6: Commit checkpoint after authorization**

```bash
git add database docker-compose.test.yml
git commit -m "feat: add initial authentication schema"
```

### Task 4: Implement configuration, connection handling and health endpoints

**Files:** API config/db/health modules and tests.

- [ ] **Step 1: Write failing environment tests**

Assert missing secrets fail with readable field names and valid configuration parses without echoing secret values.

- [ ] **Step 2: Write failing health tests**

```ts
await request(app).get("/api/v1/health/live").expect(200, {
  success: true,
  data: { status: "live" }
});
```

Ready returns 200 when `SELECT 1` and migration checks pass, 503 with `SERVICE_NOT_READY` otherwise.

- [ ] **Step 3: Run tests and confirm RED**

```bash
pnpm --filter @novamall/api test -- health
```

- [ ] **Step 4: Implement env parsing and pool initialization**

Create the callback-style mysql2 pool, register its connection initialization handler, then export its Promise wrapper. This keeps the handler on the real pool while Repository code remains Promise-based. Every newly created physical connection must set its encryption mode before application queries use it:

```ts
const rawPool = mysql.createPool(poolOptions);
rawPool.on("connection", (connection) => {
  connection.query(
    "SET SESSION block_encryption_mode = 'aes-256-cbc'",
    (error) => handleConnectionInitializationError(error)
  );
});
export const pool = rawPool.promise();
```

Add an integration assertion that a connection acquired from the exported pool reports `@@session.block_encryption_mode = 'aes-256-cbc'`; startup/ready must fail if connection initialization fails.

Wrap startup so failed configuration or database initialization exits non-zero without printing secrets.

- [ ] **Step 5: Implement liveness/readiness and error envelope**

Use a typed `AppError` with `code`, `status`, `message`, optional field errors and requestId. Unknown errors map to `INTERNAL_ERROR`.

- [ ] **Step 6: Run GREEN verification**

```bash
pnpm --filter @novamall/api test -- health
pnpm --filter @novamall/api typecheck
```

### Task 5: Implement password hashing, AES phone storage and auth repository

**Files:** password helper, repository, transaction helper and unit/integration tests.

- [ ] **Step 1: Write password tests first**

Test correct password, wrong password, malformed encoded string and unique salt:

```ts
const first = await hashPassword("StrongPass123!");
const second = await hashPassword("StrongPass123!");
expect(first).not.toBe(second);
expect(await verifyPassword("StrongPass123!", first)).toBe(true);
expect(await verifyPassword("wrong", first)).toBe(false);
```

- [ ] **Step 2: Confirm RED, then implement scrypt**

Use async `crypto.scrypt`, 16-byte random salt and `timingSafeEqual`. Encode version and parameters in one string; reject unknown versions.

- [ ] **Step 3: Write repository integration tests**

Register a user and assert:

- `phone_cipher` does not contain phone text;
- different IVs produce different ciphertext for the same phone;
- authorized lookup decrypts correctly with the configured key;
- registration inserts MEMBER role in the same transaction;
- duplicate username maps to `USERNAME_TAKEN`.

- [ ] **Step 4: Implement repository with parameterized SQL**

Use:

```sql
AES_ENCRYPT(?, ?, ?)
```

and

```sql
CAST(AES_DECRYPT(phone_cipher, ?, phone_iv) AS CHAR CHARACTER SET utf8mb4)
```

Never expose password_hash outside the credential lookup method.

- [ ] **Step 5: Run GREEN verification**

```bash
pnpm --filter @novamall/api test -- password
pnpm test:integration -- auth-repository
```

### Task 6: Implement MySQL Session Store, CSRF and request auth context

**Files:** session store, middleware, Express type augmentations and tests.

- [ ] **Step 1: Write failing Session Store tests**

Cover `set`, `get`, `touch`, `destroy` and expiry. Expired rows return no session and are deleted safely.

- [ ] **Step 2: Implement the Store interface**

Create a focused class extending `session.Store`. Serialize only JSON, calculate expiry from `cookie.expires` or maxAge, and use upsert for `set`.

- [ ] **Step 3: Write failing CSRF tests**

Assert `GET /auth/csrf` sets a cookie and returns a token; missing/wrong `X-CSRF-Token` rejects POST; correct token passes; token changes after login regeneration.

- [ ] **Step 4: Implement Session-bound CSRF**

Generate 32 random bytes, encode base64url and compare decoded bytes with `timingSafeEqual`. Do not use double-submit cookies or localStorage.

- [ ] **Step 5: Write and implement auth/role middleware**

`requireAuth` loads current user/status/roles from MySQL for every protected request. `requireRole("OWNER")` checks attached typed context. Disabled users receive `ACCOUNT_DISABLED` and their session is destroyed.

- [ ] **Step 6: Run GREEN verification**

```bash
pnpm --filter @novamall/api test -- session csrf auth-middleware
pnpm --filter @novamall/api typecheck
```

### Task 7: Complete authentication routes and API integration tests

**Files:** auth service/controller/routes, app assembly and integration tests.

- [ ] **Step 1: Write end-to-end API tests before routes**

Use Supertest agent cookie jars:

1. fetch CSRF;
2. register and assert 201 + rotated CSRF;
3. fetch session and assert MEMBER;
4. logout and assert old session returns 401;
5. login and assert regenerated Session ID;
6. MEMBER gets 403 on owner/admin overview;
7. seeded OWNER/ADMIN get 200 only on allowed routes.

- [ ] **Step 2: Confirm RED**

```bash
pnpm test:integration -- auth-api
```

- [ ] **Step 3: Implement register/login/session/logout**

Controllers validate shared Zod schemas. Services regenerate sessions through Promise wrappers, set only `userId` and `csrfToken`, and save before responding.

- [ ] **Step 4: Implement role overview endpoints**

Return small typed payloads identifying the active role and Stage 1 availability; do not fabricate Stage 2 data.

- [ ] **Step 5: Run GREEN and full API verification**

```bash
pnpm --filter @novamall/api test
pnpm test:integration
pnpm --filter @novamall/api typecheck
```

### Task 8: Build the visual token system and accessible UI primitives

**Skills:** `impeccable`, `gsap-core`, `gsap-react`.

**Files:** web styles, Button/Field/StatusMessage/BrandMark and tests.

- [ ] **Step 1: Resolve and test design tokens**

Create real OKLCH tokens starting from `oklch(0.590 0.188 35.8)`. Add a test or script that calculates WCAG contrast for body text, muted text, primary button text and focus ring combinations. Expected: body ≥ 4.5:1, primary button text ≥ 4.5:1, large text ≥ 3:1.

- [ ] **Step 2: Write failing component tests**

Cover:

- button disabled/loading semantics;
- field label association, help/error `aria-describedby` and password reveal accessible name;
- status message live-region behavior;
- keyboard focus visibility contract.

- [ ] **Step 3: Implement minimal components**

Use one warm humanist system font stack, pure-white body background, restrained coral primary, maximum 16px surface radius and semantic z-index tokens. Do not add card grids or decorative glass.

- [ ] **Step 4: Run impeccable detector**

Run the local detector against `apps/web/src` and fix all applicable absolute-ban findings before continuing.

- [ ] **Step 5: Verify components**

```bash
pnpm --filter @novamall/web test -- ui
pnpm --filter @novamall/web typecheck
pnpm --filter @novamall/web lint
```

### Task 9: Build login/register experience and session client

**Files:** API client, auth provider/hooks, pages/forms/tests.

- [ ] **Step 1: Write failing API client tests**

Assert credentials are included, CSRF header is attached to writes, response schemas are validated and errors retain requestId.

- [ ] **Step 2: Implement the typed client**

No generated global singleton mutable token. AuthProvider owns current CSRF/session state and passes the token to write calls.

- [ ] **Step 3: Write failing page tests**

Cover valid submission, field errors, server error, loading state, password reveal, Enter submission, login/register links and successful navigation.

- [ ] **Step 4: Implement pages with accessible layout**

Desktop uses brand context and form regions without nested cards; mobile becomes one column. Content remains visible before animation initialization.

- [ ] **Step 5: Add GSAP state motion**

Use `useGSAP` with a scoped root ref. Use transform/autoAlpha only, 180–240ms `power3.out`, no bounce/elastic. Use `gsap.matchMedia()` and skip displacement under reduced motion. Animate only route/form state, error summary and success confirmation.

- [ ] **Step 6: Test reduced motion and cleanup**

Mock `matchMedia`, unmount pages and assert no retained animation callbacks or hidden content.

### Task 10: Build role-aware application shells

**Files:** router, route guards, member/owner/admin layouts and page tests.

- [ ] **Step 1: Write route guard tests**

Anonymous users redirect to login; MEMBER cannot enter `/owner` or `/admin`; OWNER and ADMIN reach their allowed shells; multi-role users can switch only among owned roles.

- [ ] **Step 2: Implement session restoration**

The router waits on an accessible skeleton/state label while `/auth/session` resolves. A 401 becomes anonymous; other errors render retry with requestId.

- [ ] **Step 3: Implement three shells**

Member uses top navigation. Owner/Admin use desktop side navigation with mobile collapse. Empty states explain the next stage instead of showing fake metrics.

- [ ] **Step 4: Add purposeful shell transition**

Use a single short GSAP transition when switching role context. Reduced motion uses instant replacement. Do not animate every navigation item on load.

- [ ] **Step 5: Verify web application**

```bash
pnpm --filter @novamall/web test
pnpm --filter @novamall/web typecheck
pnpm --filter @novamall/web build
```

### Task 11: Dockerize and prove the browser E2E loop

**Files:** Dockerfiles, Compose, Nginx, Playwright and E2E tests.

- [ ] **Step 1: Write Docker configuration tests/checks**

`docker compose config` must resolve with `.env.example`-compatible variables. No host-mounted node_modules. MySQL is not publicly exposed in the production profile.

- [ ] **Step 2: Implement multi-stage images**

Web builds static files and serves via Nginx. API uses a non-root runtime user and production-only dependencies. Nginx proxies `/api` and serves SPA fallback.

- [ ] **Step 3: Implement Playwright auth journeys**

Test desktop and mobile register/login, logout protection, MEMBER forbidden routes, seeded OWNER/ADMIN shells, keyboard tab order and reduced-motion emulation.

- [ ] **Step 4: Run full container verification**

```bash
docker compose config
docker compose up --build -d
pnpm test:e2e
docker compose ps
```

Expected: all services healthy and E2E pass.

### Task 12: Refresh design documentation and run the final Stage 1 gate

**Files:** DESIGN.md, `.impeccable/design.json`, README and technical docs.

- [ ] **Step 1: Re-run impeccable document in scan mode**

Extract the real OKLCH colors, typography, spacing, radii and component states from implemented CSS/components. Remove the SEED marker and create `.impeccable/design.json` with motion tokens and representative primitives.

- [ ] **Step 2: Update operational docs**

README receives exact setup and commands. API/security/testing docs must match actual endpoints, cookie names, migration flow and scripts.

- [ ] **Step 3: Run complete verification fresh**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
docker compose config
docker compose up --build -d
pnpm test:e2e
git diff --check
```

Record exact pass/fail counts and container health. Do not claim completion if any command fails.

- [ ] **Step 4: Browser QA**

Inspect login, register and all three shells at desktop and mobile widths. Verify contrast, overflow, focus, error text, loading, reduced motion and no console errors.

- [ ] **Step 5: Commit final checkpoint after explicit Git authorization**

```bash
git add .
git commit -m "feat: complete stage 1 authentication foundation"
```

---

## Plan Self-Review Mapping

- Workspace/Docker: Tasks 1, 3, 11.
- Registration/auth/session/CSRF: Tasks 2, 4–7.
- scrypt/AES/MySQL roles: Tasks 3, 5.
- React role shells: Tasks 8–10.
- impeccable/GSAP/reduced motion: Tasks 8–10, 12.
- Unit/integration/E2E/build gates: every implementation task and Tasks 11–12.
- Documentation-first and no Stage 2 leakage: stage spec plus Task 12.

No Stage 2 merchant/shop tables or endpoints are included.
