import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.js";
import { csrfProtection } from "../../middleware/csrf.js";
import type { AuthRepository } from "../auth/auth.repository.js";
import { MerchantApplicationsController } from "./merchant-applications.controller.js";
import type { MerchantApplicationsRepository } from "./merchant-applications.repository.js";
import { MerchantApplicationsService } from "./merchant-applications.service.js";

export function createMerchantApplicationsRouter(
  authRepository: AuthRepository,
  merchantApplicationsRepository: MerchantApplicationsRepository
): Router {
  const router = Router();
  const controller = new MerchantApplicationsController(
    new MerchantApplicationsService(merchantApplicationsRepository)
  );

  router.get(
    "/merchant-applications/me",
    requireAuth(authRepository),
    requireRole("MEMBER"),
    controller.getMine
  );
  router.put(
    "/merchant-applications/me",
    requireAuth(authRepository),
    requireRole("MEMBER"),
    csrfProtection,
    controller.submitMine
  );
  router.get(
    "/admin/merchant-applications",
    requireAuth(authRepository),
    requireRole("ADMIN"),
    controller.listForAdmin
  );
  router.post(
    "/admin/merchant-applications/:id/approve",
    requireAuth(authRepository),
    requireRole("ADMIN"),
    csrfProtection,
    controller.approve
  );
  router.post(
    "/admin/merchant-applications/:id/reject",
    requireAuth(authRepository),
    requireRole("ADMIN"),
    csrfProtection,
    controller.reject
  );
  router.get(
    "/owner/shop",
    requireAuth(authRepository),
    requireRole("OWNER"),
    controller.getOwnerShop
  );

  return router;
}
