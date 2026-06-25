# Stage 3 Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Stage 3 product catalog loop: admin categories, owner product management with image upload, public category/search/detail browsing, price history, audit triggers, and database search evidence.

**Architecture:** Keep the existing modular monolith shape. Shared Zod contracts define DTOs, Express routes delegate to controller, service, and repository modules, repositories are the only layer that executes SQL, and the React app keeps Stage 3 panels inside the current role workspace until later routing is introduced.

**Tech Stack:** TypeScript, Zod, React, Express, mysql2, MySQL 8.4, dbmate, Vitest, Testing Library, Playwright, pnpm.

---

## File Map

- Create: `packages/shared/src/catalog.contract.ts` for category, product, upload, pagination and search DTO schemas.
- Modify: `packages/shared/src/errors.ts` and `packages/shared/src/index.ts` to expose Stage 3 contracts and error codes.
- Create: `packages/shared/tests/catalog.contract.test.ts` for contract RED/GREEN coverage.
- Create: `database/migrations/202606240001_catalog.sql` for `categories`, `products`, `product_price_history`, triggers and indexes.
- Modify: `apps/api/tests/integration/migration.test.ts` to assert Stage 3 schema, FULLTEXT index and triggers.
- Create: `apps/api/src/modules/catalog/catalog.repository.ts`, `catalog.service.ts`, `catalog.controller.ts`, and `catalog.routes.ts`.
- Modify: `apps/api/src/app.ts` and `apps/api/src/server.ts` to mount the catalog routes and repository.
- Create: `apps/api/tests/integration/catalog-api.test.ts` for admin, owner, public and upload flows.
- Modify: `apps/api/tests/integration/auth-api.test.ts` and `apps/api/tests/integration/auth-repository.test.ts` cleanup if new foreign keys block user deletion.
- Modify: `apps/web/src/api/client.ts` to add catalog API helpers.
- Modify: `apps/web/src/pages/role-page.tsx`, `apps/web/src/pages/role-page.test.tsx`, and `apps/web/src/styles/global.css` for Stage 3 UI panels.
- Modify: `tests/e2e/auth.spec.ts` to extend the browser journey from merchant approval to category/product publish/search/detail.
- Create: `docs/evidence/database/catalog-search.md` with real search/index evidence after verification.

## Task 1: Shared Catalog Contracts

**Files:**
- Create: `packages/shared/tests/catalog.contract.test.ts`
- Create: `packages/shared/src/catalog.contract.ts`
- Modify: `packages/shared/src/errors.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing contract tests**

Add tests that define the intended Stage 3 contract surface:

```ts
import { describe, expect, it } from "vitest";

import {
  categoryInputSchema,
  categorySchema,
  ownerProductInputSchema,
  ownerProductSchema,
  productSearchQuerySchema,
  publicProductListSchema,
  uploadProductImageResponseSchema
} from "../src/catalog.contract.js";
import { apiErrorCodeSchema } from "../src/errors.js";

describe("catalog contracts", () => {
  it("validates category input and output", () => {
    expect(categoryInputSchema.parse({
      name: "生鲜水果",
      description: "当季水果与社区精选"
    })).toEqual({
      name: "生鲜水果",
      description: "当季水果与社区精选"
    });
    expect(categorySchema.parse({
      id: "1",
      name: "生鲜水果",
      description: "当季水果与社区精选",
      status: "ACTIVE",
      createdAt: "2026-06-24T01:00:00.000Z",
      updatedAt: "2026-06-24T01:00:00.000Z"
    }).status).toBe("ACTIVE");
  });

  it("validates owner product input and output", () => {
    expect(ownerProductInputSchema.parse({
      categoryId: "1",
      name: "四川脆桃",
      description: "当季现摘，适合家庭分享",
      price: "29.90",
      stock: 30,
      mainImagePath: "/uploads/products/2026/06/example.webp"
    }).price).toBe("29.90");
    expect(ownerProductSchema.parse({
      id: "10",
      shopId: "3",
      categoryId: "1",
      categoryName: "生鲜水果",
      name: "四川脆桃",
      description: "当季现摘，适合家庭分享",
      price: "29.90",
      stock: 30,
      mainImagePath: "/uploads/products/2026/06/example.webp",
      status: "DRAFT",
      version: 1,
      createdAt: "2026-06-24T01:00:00.000Z",
      updatedAt: "2026-06-24T01:00:00.000Z"
    }).status).toBe("DRAFT");
  });

  it("validates public search query and paginated response", () => {
    expect(productSearchQuerySchema.parse({
      page: "1",
      pageSize: "12",
      categoryId: "1",
      keyword: "桃",
      sort: "relevance"
    }).sort).toBe("relevance");
    expect(publicProductListSchema.parse({
      data: [],
      meta: { page: 1, pageSize: 12, total: 0 }
    }).meta.total).toBe(0);
  });

  it("validates upload response and Stage 3 error codes", () => {
    expect(uploadProductImageResponseSchema.parse({
      path: "/uploads/products/2026/06/image.webp"
    }).path).toContain("/uploads/products/");
    expect(apiErrorCodeSchema.parse("CATEGORY_NAME_TAKEN")).toBe("CATEGORY_NAME_TAKEN");
    expect(apiErrorCodeSchema.parse("PRODUCT_STATE_CONFLICT")).toBe("PRODUCT_STATE_CONFLICT");
    expect(apiErrorCodeSchema.parse("PRODUCT_VERSION_CONFLICT")).toBe("PRODUCT_VERSION_CONFLICT");
    expect(apiErrorCodeSchema.parse("INVALID_IMAGE_FILE")).toBe("INVALID_IMAGE_FILE");
    expect(apiErrorCodeSchema.parse("IMAGE_TOO_LARGE")).toBe("IMAGE_TOO_LARGE");
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
CI=true pnpm --filter @novamall/shared test -- tests/catalog.contract.test.ts
```

Expected: FAIL because `../src/catalog.contract.js` does not exist or the new error codes are missing.

- [ ] **Step 3: Implement minimal shared contracts**

Create `catalog.contract.ts` with strict Zod schemas for:

- `categoryStatusSchema = ACTIVE | DISABLED`
- `productStatusSchema = DRAFT | PUBLISHED | UNPUBLISHED | ARCHIVED`
- `categoryInputSchema`, `categorySchema`, `paginatedCategoriesSchema`
- `ownerProductInputSchema`, `ownerProductStockInputSchema`, `ownerProductSchema`, `paginatedOwnerProductsSchema`
- `publicProductSchema`, `publicProductListSchema`, `productDetailSchema`
- `productSearchQuerySchema`
- `productPriceHistorySchema`
- `uploadProductImageResponseSchema`

Use `z.string().regex(/^\d+$/)` for ID strings, `z.string().regex(/^\d+\.\d{2}$/)` for money strings, and no `any`.

- [ ] **Step 4: Export and verify**

Export the contracts from `packages/shared/src/index.ts`, extend `apiErrorCodeSchema`, then run:

```bash
CI=true pnpm --filter @novamall/shared test -- tests/catalog.contract.test.ts
CI=true pnpm --filter @novamall/shared typecheck
```

Expected: PASS.

## Task 2: Database Migration, Indexes and Triggers

**Files:**
- Modify: `apps/api/tests/integration/migration.test.ts`
- Create: `database/migrations/202606240001_catalog.sql`

- [ ] **Step 1: Write failing migration assertions**

Extend migration tests to verify:

- `categories`, `products`, `product_price_history` exist;
- `products` has indexes `idx_products_category_status_id`, `idx_products_shop_status_updated`, `idx_products_status_updated`, and FULLTEXT `ft_products_name_description`;
- triggers `trg_products_price_history` and `trg_products_audit` exist;
- check constraints reject invalid category/product status and non-positive price.

- [ ] **Step 2: Verify RED**

Run:

```bash
docker compose -f docker-compose.test.yml up -d mysql-test
TEST_DATABASE_URL='mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test' CI=true pnpm db:test:migrate
TEST_DATABASE_URL='mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test' CI=true pnpm --filter @novamall/api test:integration -- tests/integration/migration.test.ts
```

Expected: FAIL because Stage 3 tables and triggers are not present.

- [ ] **Step 3: Add migration**

Create the migration from `docs/phases/03-catalog.md`. Include:

- `categories`
- `products`
- `product_price_history`
- `trg_products_price_history`
- `trg_products_audit`
- down migration that drops triggers before tables and drops child tables before parent tables.

- [ ] **Step 4: Verify migration**

Run the same migration commands again.

Expected: migration succeeds and `migration.test.ts` passes.

## Task 3: Catalog API

**Files:**
- Create: `apps/api/tests/integration/catalog-api.test.ts`
- Create: `apps/api/src/modules/catalog/catalog.repository.ts`
- Create: `apps/api/src/modules/catalog/catalog.service.ts`
- Create: `apps/api/src/modules/catalog/catalog.controller.ts`
- Create: `apps/api/src/modules/catalog/catalog.routes.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Write failing API integration tests**

Cover these behaviors in `catalog-api.test.ts` using real HTTP requests and the test database:

- admin creates, lists, disables and enables a category;
- duplicate category name returns `CATEGORY_NAME_TAKEN`;
- owner creates a draft product in own shop;
- owner edits price and the database writes price history;
- owner publishes, unpublishes and archives valid products;
- owner cannot access another owner shop product;
- public list returns only `PUBLISHED` products whose category is `ACTIVE` and shop is `ACTIVE`;
- public keyword search finds a Chinese product name;
- invalid product state transition returns `PRODUCT_STATE_CONFLICT`;
- stale stock version returns `PRODUCT_VERSION_CONFLICT`.

- [ ] **Step 2: Verify RED**

Run:

```bash
TEST_DATABASE_URL='mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test' CI=true pnpm --filter @novamall/api test:integration -- tests/integration/catalog-api.test.ts
```

Expected: FAIL because catalog routes are not mounted.

- [ ] **Step 3: Implement repository**

The repository owns SQL only. Use explicit methods:

- category methods: `createCategory`, `listCategoriesForAdmin`, `listActiveCategories`, `updateCategory`, `setCategoryStatus`;
- owner product methods: `findOwnerShopId`, `createOwnerProduct`, `listOwnerProducts`, `findOwnerProduct`, `updateOwnerProduct`, `setOwnerProductStock`, `transitionOwnerProductStatus`, `listPriceHistory`;
- public product methods: `listPublicProducts`, `findPublicProduct`.

All owner product SQL must include `shop_id = ?`. Write price values as `DECIMAL` strings and map MySQL `Date` values to ISO strings.

- [ ] **Step 4: Implement service**

The service validates unknown input with shared schemas, owns state rules, and maps domain failures to `AppError`:

- only `DRAFT` and `UNPUBLISHED` can publish;
- publish requires active category and `mainImagePath !== null`;
- `PUBLISHED` can unpublish;
- `DRAFT` and `UNPUBLISHED` can archive;
- `ARCHIVED` rejects edit, publish, unpublish and stock changes;
- stale version returns `PRODUCT_VERSION_CONFLICT`.

- [ ] **Step 5: Implement controller and routes**

Mount:

- public `GET /categories`, `GET /products`, `GET /products/:productId`;
- admin category routes under `/admin/categories`;
- owner product routes under `/owner/products`.

Use existing `requireRoles`, `requireCsrf` and request context patterns.

- [ ] **Step 6: Verify API**

Run:

```bash
TEST_DATABASE_URL='mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test' CI=true pnpm --filter @novamall/api test:integration -- tests/integration/catalog-api.test.ts
CI=true pnpm --filter @novamall/api typecheck
```

Expected: PASS.

## Task 4: Product Image Upload

**Files:**
- Extend: `apps/api/tests/integration/catalog-api.test.ts`
- Modify: `apps/api/src/modules/catalog/catalog.service.ts`
- Modify: `apps/api/src/modules/catalog/catalog.controller.ts`
- Modify: `apps/api/src/modules/catalog/catalog.routes.ts`
- Modify: `apps/api/src/config/env.ts` if an upload root env var is needed.

- [ ] **Step 1: Write failing upload tests**

Add tests for:

- a valid 1x1 PNG upload returns a path under `/uploads/products/`;
- `text/plain` upload returns `INVALID_IMAGE_FILE`;
- a file larger than 2 MB returns `IMAGE_TOO_LARGE`.

- [ ] **Step 2: Verify RED**

Run the catalog integration test.

Expected: FAIL because `/uploads/products` is not implemented.

- [ ] **Step 3: Implement upload handling with mature middleware**

Use an installed Express-compatible upload parser if already available. If no parser is installed, ask the user for permission before adding one. Do not hand-roll multipart parsing.

Validate MIME and magic bytes:

- PNG starts with `89504E470D0A1A0A`;
- JPEG starts with `FFD8FF`;
- WebP starts with `RIFF....WEBP`.

Write files under `uploads/products/YYYY/MM/` with generated UUID names.

- [ ] **Step 4: Verify upload**

Run:

```bash
TEST_DATABASE_URL='mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test' CI=true pnpm --filter @novamall/api test:integration -- tests/integration/catalog-api.test.ts
CI=true pnpm --filter @novamall/api typecheck
```

Expected: PASS.

## Task 5: Web Catalog UI

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/pages/role-page.test.tsx`
- Modify: `apps/web/src/pages/role-page.tsx`
- Modify: `apps/web/src/styles/global.css`

- [ ] **Step 1: Write failing UI tests**

Extend `role-page.test.tsx` for:

- ADMIN sees category management and can submit a category;
- OWNER sees product management and can submit a draft product;
- MEMBER sees product search and rendered product cards;
- public search shows empty and error states.

- [ ] **Step 2: Verify RED**

Run:

```bash
CI=true pnpm --filter @novamall/web test -- src/pages/role-page.test.tsx
```

Expected: FAIL because Stage 3 UI is absent.

- [ ] **Step 3: Add client helpers**

Add typed helpers for:

- `listPublicCategories`
- `listPublicProducts`
- `getPublicProduct`
- `listAdminCategories`
- `createCategory`
- `updateCategory`
- `enableCategory`
- `disableCategory`
- `listOwnerProducts`
- `createOwnerProduct`
- `updateOwnerProduct`
- `setOwnerProductStock`
- `publishOwnerProduct`
- `unpublishOwnerProduct`
- `archiveOwnerProduct`
- `uploadProductImage`
- `listProductPriceHistory`

All parsing uses shared Zod schemas.

- [ ] **Step 4: Add role panels**

Keep the existing one-page workspace style:

- ADMIN: category list and create form;
- OWNER: product list, create/edit form, image upload field, stock field and state actions;
- MEMBER: category filter, keyword search, product cards and detail panel.

Do not introduce a new router structure in this stage.

- [ ] **Step 5: Verify UI**

Run:

```bash
CI=true pnpm --filter @novamall/web test -- src/pages/role-page.test.tsx
CI=true pnpm --filter @novamall/web typecheck
```

Expected: PASS.

## Task 6: E2E Catalog Journey

**Files:**
- Modify: `tests/e2e/auth.spec.ts`

- [ ] **Step 1: Write failing E2E journey**

Extend the existing journey:

1. login as `demo_admin`;
2. create category `新鲜水果`;
3. login as `demo_owner`;
4. upload a tiny PNG and create product `高山苹果`;
5. publish the product;
6. login/register as a member or visit member workspace;
7. search keyword `苹果`;
8. assert product card and detail show product name, category, shop and price.

- [ ] **Step 2: Verify RED**

Run:

```bash
CI=true pnpm test:e2e
```

Expected: FAIL before the Stage 3 UI/API implementation is complete.

- [ ] **Step 3: Adjust selectors only after UI exists**

Use accessible names and scoped locators. Avoid ambiguous text-only assertions if the same status appears in multiple panels.

- [ ] **Step 4: Verify E2E**

Run:

```bash
CI=true pnpm test:e2e
```

If pnpm wrapper or port reuse blocks the run after Docker services are confirmed healthy, run:

```bash
./node_modules/.bin/playwright test
```

Expected: PASS.

## Task 7: Search Evidence and Final Gate

**Files:**
- Create: `docs/evidence/database/catalog-search.md`

- [ ] **Step 1: Capture database evidence**

Use real SQL on the test or local database:

- `SELECT VERSION();`
- row counts for `categories`, `shops`, `products`;
- category filter query with `EXPLAIN ANALYZE`;
- FULLTEXT query using `MATCH(name, description) AGAINST (? IN NATURAL LANGUAGE MODE)` with `EXPLAIN ANALYZE`;
- LIKE comparison query with `EXPLAIN ANALYZE`.

- [ ] **Step 2: Write evidence document**

Record the exact SQL, database version, data scale, observed plan snippets and limitations. If the dataset is small, say it is small; do not claim performance gains that the run does not prove.

- [ ] **Step 3: Run final quality gate**

Run:

```bash
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm test
docker compose -f docker-compose.test.yml up -d mysql-test
TEST_DATABASE_URL='mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test' CI=true pnpm db:test:migrate
TEST_DATABASE_URL='mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test' CI=true pnpm test:integration
CI=true pnpm build
docker compose config
git diff --check
```

Run E2E as described in Task 6.

- [ ] **Step 4: Report results**

Summarize changed files, tests run, any skipped commands, and residual risks. Do not commit, push or open a PR unless the user explicitly authorizes Git writes.
