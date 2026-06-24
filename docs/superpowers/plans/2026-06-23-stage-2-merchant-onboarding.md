# Stage 2 Merchant Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Git commit steps are intentionally omitted because this repository requires explicit user authorization before any Git write operation.

**Goal:** Build the merchant onboarding loop where a member submits a shop application, an admin approves or rejects it, approval creates a shop and grants OWNER, and the owner can view the created shop.

**Architecture:** Follow the existing modular monolith structure. Shared Zod contracts define request and response DTOs, Express routes call controller/service/repository layers, repositories are the only SQL boundary, and React pages call typed API client functions.

**Tech Stack:** TypeScript, pnpm workspace, Express, mysql2, MySQL/dbmate migrations, Zod, React, React Router, Vitest, Supertest, Playwright.

---

## File Map

- Create `database/migrations/202606230001_merchant_onboarding.sql`: Stage 2 tables, indexes, constraints, and audit trigger.
- Modify `docs/api.md`: add Stage 2 stable error codes and note `/owner/shop`.
- Modify `packages/shared/src/errors.ts`: add `DUPLICATE_APPLICATION`, `APPLICATION_STATE_CONFLICT`, `SHOP_NAME_TAKEN`, `RESOURCE_NOT_OWNED`, `NOT_FOUND`.
- Create `packages/shared/src/merchant.contract.ts`: merchant application, admin list, reject input, owner shop contracts.
- Modify `packages/shared/src/index.ts`: export merchant contracts.
- Create `packages/shared/tests/merchant.contract.test.ts`: shared contract tests.
- Modify `apps/api/src/app.ts`: mount merchant application routes when auth dependencies exist.
- Create `apps/api/src/modules/merchant-applications/merchant-applications.repository.ts`: all SQL, transaction, row mapping, audit context variables.
- Create `apps/api/src/modules/merchant-applications/merchant-applications.service.ts`: input validation, state rules, stable error mapping.
- Create `apps/api/src/modules/merchant-applications/merchant-applications.controller.ts`: HTTP request/response glue.
- Create `apps/api/src/modules/merchant-applications/merchant-applications.routes.ts`: member, admin, owner route declarations and middleware.
- Create `apps/api/tests/integration/merchant-applications-api.test.ts`: API and database integration coverage.
- Modify `apps/web/src/api/client.ts`: add merchant application and owner shop API functions.
- Modify `apps/web/src/app/app.tsx`: keep existing route shell, no new top-level route required for Stage 2.
- Modify `apps/web/src/pages/role-page.tsx`: render member application, admin review, and owner shop sections.
- Create `apps/web/src/pages/role-page.test.tsx`: focused UI behavior tests for the Stage 2 sections.
- Modify `tests/e2e/auth.spec.ts`: extend with merchant onboarding E2E or add a Stage 2 spec if the existing file becomes noisy.

## Task 1: Synchronize API And Shared Contracts

**Files:**
- Modify: `docs/api.md`
- Modify: `packages/shared/src/errors.ts`
- Create: `packages/shared/src/merchant.contract.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/tests/merchant.contract.test.ts`

- [ ] **Step 1: Write failing shared contract tests**

Create tests that assert valid merchant application input parses, invalid fields fail, status enum is exact, and Stage 2 error codes are accepted.

Run:

```bash
pnpm --filter @novamall/shared test
```

Expected: fail because `merchant.contract.ts` and new error codes do not exist.

- [ ] **Step 2: Implement minimal shared contracts**

Add Zod schemas and exported types for:

- `merchantApplicationStatusSchema`;
- `merchantApplicationInputSchema`;
- `merchantApplicationRejectInputSchema`;
- `merchantApplicationSchema`;
- `adminMerchantApplicationSchema`;
- `shopSummarySchema`;
- paginated admin list response data.

Update error code enum with Stage 2 codes only.

- [ ] **Step 3: Update API documentation**

Add `APPLICATION_STATE_CONFLICT` and `SHOP_NAME_TAKEN` to the stable error table. Add `/owner/shop` to the owner shop API section because Stage 2 uses it to verify approved ownership.

- [ ] **Step 4: Verify shared contracts**

Run:

```bash
pnpm --filter @novamall/shared test
pnpm --filter @novamall/shared typecheck
```

Expected: pass.

## Task 2: Add Database Migration And Migration Tests

**Files:**
- Create: `database/migrations/202606230001_merchant_onboarding.sql`
- Modify: `apps/api/tests/integration/migration.test.ts`

- [ ] **Step 1: Write failing migration assertions**

Extend migration tests to verify the new tables, constraints, and trigger exist:

- `merchant_applications`;
- `shops`;
- `audit_logs`;
- trigger `trg_merchant_applications_status_audit`;
- roles remain `ADMIN`, `MEMBER`, `OWNER`.

Run:

```bash
pnpm --filter @novamall/api test:integration -- tests/integration/migration.test.ts
```

Expected: fail because the new migration is missing.

- [ ] **Step 2: Add migration**

Create the migration with `migrate:up` and `migrate:down` sections. Use the exact table shapes documented in `docs/phases/02-merchant-onboarding.md`. Add an `AFTER UPDATE` trigger on `merchant_applications` that inserts `audit_logs` when `status` changes.

- [ ] **Step 3: Verify migration**

Run:

```bash
TEST_DATABASE_URL='mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test' pnpm db:test:migrate
pnpm --filter @novamall/api test:integration -- tests/integration/migration.test.ts
```

Expected: pass against a running test MySQL.

## Task 3: Build Merchant Application API

**Files:**
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/src/modules/merchant-applications/merchant-applications.repository.ts`
- Create: `apps/api/src/modules/merchant-applications/merchant-applications.service.ts`
- Create: `apps/api/src/modules/merchant-applications/merchant-applications.controller.ts`
- Create: `apps/api/src/modules/merchant-applications/merchant-applications.routes.ts`
- Test: `apps/api/tests/integration/merchant-applications-api.test.ts`

- [ ] **Step 1: Write failing API integration tests**

Cover:

- member submits and reads own application;
- duplicate pending submit returns `DUPLICATE_APPLICATION`;
- admin reject enables member resubmission on same record;
- admin approve creates shop and grants OWNER;
- session after approval includes OWNER;
- member cannot list or review admin applications;
- repeated approval returns `APPLICATION_STATE_CONFLICT`;
- concurrent approval has one success;
- shop name conflict rolls back shop and OWNER role;
- audit log is generated for review status change.

Run:

```bash
pnpm --filter @novamall/api test:integration -- tests/integration/merchant-applications-api.test.ts
```

Expected: fail because routes are not mounted.

- [ ] **Step 2: Implement repository**

Implement SQL methods:

- `findMine(userId)`;
- `submitForUser(userId, input)`;
- `listForAdmin(query)`;
- `approve(applicationId, adminUserId, requestId)`;
- `reject(applicationId, adminUserId, requestId, reason)`;
- `findOwnerShop(ownerUserId)`.

All database writes use transactions where state can change. Approval locks the application row and performs shop creation, OWNER role grant, and status update in one transaction.

- [ ] **Step 3: Implement service, controller, and routes**

Use shared Zod schemas for validation. Map duplicate keys and state conflicts to stable `AppError` instances. Mount routes under `/api/v1`.

- [ ] **Step 4: Verify API integration**

Run:

```bash
pnpm --filter @novamall/api test:integration -- tests/integration/merchant-applications-api.test.ts
pnpm --filter @novamall/api test
pnpm --filter @novamall/api typecheck
```

Expected: pass.

## Task 4: Add Stage 2 Web UI

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/pages/role-page.tsx`
- Create: `apps/web/src/pages/role-page.test.tsx`

- [ ] **Step 1: Write failing web tests**

Test that:

- member role shows application form when no application exists;
- pending application shows submitted state and no duplicate submit button;
- rejected application shows reason and resubmission form;
- admin role lists applications and exposes approve/reject actions for pending rows;
- owner role shows shop summary when `/owner/shop` succeeds.

Run:

```bash
pnpm --filter @novamall/web test -- src/pages/role-page.test.tsx
```

Expected: fail because RolePage has no Stage 2 UI.

- [ ] **Step 2: Add API client functions**

Add typed functions for:

- `getMyMerchantApplication`;
- `submitMerchantApplication`;
- `listMerchantApplications`;
- `approveMerchantApplication`;
- `rejectMerchantApplication`;
- `getOwnerShop`.

- [ ] **Step 3: Implement minimal role page sections**

Keep the existing shell and add focused sections inside the current member/admin/owner pages. Do not introduce a table library or speculative dashboard abstractions.

- [ ] **Step 4: Verify web**

Run:

```bash
pnpm --filter @novamall/web test -- src/pages/role-page.test.tsx
pnpm --filter @novamall/web typecheck
```

Expected: pass.

## Task 5: Extend End-To-End Coverage And Run Gates

**Files:**
- Modify: `tests/e2e/auth.spec.ts` or create `tests/e2e/merchant-onboarding.spec.ts`

- [ ] **Step 1: Write failing E2E journey**

Cover:

1. register member;
2. submit merchant application;
3. admin logs in and approves it;
4. member logs in again or refreshes session;
5. owner page displays created shop.

Run:

```bash
pnpm test:e2e
```

Expected: fail until API and UI are wired end to end.

- [ ] **Step 2: Make E2E pass with minimal wiring fixes**

Fix only Stage 2 defects surfaced by E2E. Do not add Stage 3 behavior.

- [ ] **Step 3: Run stage quality gates**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
docker compose config
git diff --check
```

Expected: pass, or report exact unrun/failed commands with reasons.

## Self-Review

- Spec coverage: The plan covers docs/API sync, database tables and trigger, member submit/read, admin list/approve/reject, approval transaction, OWNER role grant, owner shop read, frontend pages, E2E, and quality gates.
- Scope check: Product, category, order, refund, upload, full audit query, and user management are excluded.
- Placeholder scan: No `TBD` or deferred behavior remains in this plan.
- Type consistency: Contract names, route names, status names, and error codes match `docs/phases/02-merchant-onboarding.md`.
