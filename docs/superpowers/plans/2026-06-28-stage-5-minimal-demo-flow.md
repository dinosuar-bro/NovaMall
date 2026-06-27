# Stage 5 Minimal Demo Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the smallest browser-usable NovaMall flow from product discovery through cart, checkout, payment, shipment, receipt confirmation, and read-only database evidence.

**Architecture:** Keep the existing Express layering: routes declare middleware, controllers handle HTTP, services validate state and inputs, repositories perform SQL. Reuse Stage 4 checkout tables and APIs; add only shipment and receipt confirmation actions, then wire focused React panels into the existing role shell.

**Tech Stack:** TypeScript, Express, mysql2, React, React Router, Zod, Vitest, Testing Library, Playwright, MySQL.

---

## File Structure

- Modify `docs/phases/05-minimal-demo-flow.md`: phase scope, API, UI and tests.
- Modify `docs/development-plan.md`: mark Stage 5 implementation details as the current phase contract.
- Modify `docs/api.md`: align checkout paths and add shipment/confirmation endpoints actually exposed by the app.
- Modify `docs/testing-and-acceptance.md`: Stage 5 E2E and verification notes.
- Modify `packages/shared/src/checkout.contract.ts`: add operation result type if needed by shipment and confirmation responses.
- Modify `apps/api/tests/integration/checkout-api.test.ts`: add failing tests for shipment and receipt confirmation.
- Modify `apps/api/src/modules/checkout/checkout.repository.ts`: add transactional `shipShopOrder` and `confirmShopOrder`.
- Modify `apps/api/src/modules/checkout/checkout.service.ts`: validate path params and delegate new operations.
- Modify `apps/api/src/modules/checkout/checkout.controller.ts`: expose new handlers.
- Modify `apps/api/src/modules/checkout/checkout.routes.ts`: add owner shipment and member confirmation routes.
- Modify `apps/web/src/api/client.ts`: add checkout client functions and response validation.
- Modify `apps/web/src/pages/role-page.tsx`: add member cart/orders, owner orders and admin database evidence panels.
- Modify `apps/web/src/app/app.tsx`: add role navigation and routes.
- Modify `apps/web/src/pages/role-page.test.tsx` and `apps/web/src/app/app.test.tsx`: add frontend tests for Stage 5 panels and navigation.
- Modify `tests/e2e/auth.spec.ts`: extend or add one final demo E2E path.

## Task 1: Documentation Contract

- [ ] Update `docs/api.md` so the checkout paths match the existing `/member/...`, `/owner/...` and `/admin/...` route layout.
- [ ] Add `POST /owner/shop-orders/:shopOrderNo/ship` and `POST /member/shop-orders/:shopOrderNo/confirm`.
- [ ] Update `docs/testing-and-acceptance.md` with the Stage 5 browser mainline and note that refund UI remains out of scope.
- [ ] Verify with `rg -n "Stage 5|阶段 5|shop-orders|confirm|ship" docs`.

## Task 2: API TDD for Fulfillment

- [ ] Add integration tests proving owner shipment and member receipt confirmation fail because routes are missing.
- [ ] Run:

```bash
TEST_DATABASE_URL='mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test' CI=true pnpm --filter @novamall/api test:integration -- tests/integration/checkout-api.test.ts
```

Expected: new tests fail with missing route or missing handler.

- [ ] Implement `shipShopOrder` with owner shop ownership, `PENDING_SHIPMENT -> SHIPPED`, audit context and state conflict handling.
- [ ] Implement `confirmShopOrder` with member order ownership, `SHIPPED -> COMPLETED`, master order completion when all child orders are complete, audit context and state conflict handling.
- [ ] Re-run the integration test and expect it to pass.

## Task 3: Frontend TDD for Stage 5 Panels

- [ ] Add tests for member cart/order actions, owner order shipment and admin database evidence.
- [ ] Run:

```bash
CI=true pnpm --filter @novamall/web test -- src/pages/role-page.test.tsx src/app/app.test.tsx
```

Expected: new tests fail because client functions, panels or routes are missing.

- [ ] Add typed API client functions for addresses, cart, checkout, orders, shipment, confirmation, audit logs and Top 10.
- [ ] Add `MemberCartOrdersPanel`, `OwnerOrdersPanel` and `AdminDatabaseEvidencePanel`.
- [ ] Wire `/member/orders`, `/owner/orders` and `/admin/database` into navigation.
- [ ] Add catalog `加入购物车` action.
- [ ] Re-run frontend tests and expect them to pass.

## Task 4: E2E Demo Mainline

- [ ] Add or extend an E2E test that creates/publishes products, adds them to cart, creates address, checks out, pays, ships, confirms receipt and views database evidence.
- [ ] Run:

```bash
CI=true pnpm test:e2e
```

Expected: the Stage 5 mainline passes in the Docker-backed local app.

## Task 5: Final Gate

- [ ] Run:

```bash
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm test
TEST_DATABASE_URL='mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test' CI=true pnpm test:integration
CI=true pnpm build
docker compose config
git diff --check
```

- [ ] If front-end assets or backend image contents changed, refresh local Docker with:

```bash
docker compose up --build -d
```

- [ ] Report exact commands run and any skipped verification.
