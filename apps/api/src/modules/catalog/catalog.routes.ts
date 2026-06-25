import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.js";
import { csrfProtection } from "../../middleware/csrf.js";
import type { AuthRepository } from "../auth/auth.repository.js";
import { CatalogController } from "./catalog.controller.js";
import type { CatalogRepository } from "./catalog.repository.js";
import { CatalogService } from "./catalog.service.js";

export function createCatalogRouter(
  authRepository: AuthRepository,
  catalogRepository: CatalogRepository
): Router {
  const router = Router();
  const controller = new CatalogController(new CatalogService(catalogRepository));

  router.get("/categories", controller.listPublicCategories);
  router.get("/products", controller.listPublicProducts);
  router.get("/products/:productId", controller.getPublicProduct);

  router.get("/admin/categories", requireAuth(authRepository), requireRole("ADMIN"), controller.listCategoriesForAdmin);
  router.post("/admin/categories", requireAuth(authRepository), requireRole("ADMIN"), csrfProtection, controller.createCategory);
  router.patch("/admin/categories/:id", requireAuth(authRepository), requireRole("ADMIN"), csrfProtection, controller.updateCategory);
  router.post("/admin/categories/:id/disable", requireAuth(authRepository), requireRole("ADMIN"), csrfProtection, controller.disableCategory);
  router.post("/admin/categories/:id/enable", requireAuth(authRepository), requireRole("ADMIN"), csrfProtection, controller.enableCategory);

  router.get("/owner/products", requireAuth(authRepository), requireRole("OWNER"), controller.listOwnerProducts);
  router.post("/owner/products", requireAuth(authRepository), requireRole("OWNER"), csrfProtection, controller.createOwnerProduct);
  router.get("/owner/products/:productId", requireAuth(authRepository), requireRole("OWNER"), controller.getOwnerProduct);
  router.patch("/owner/products/:productId", requireAuth(authRepository), requireRole("OWNER"), csrfProtection, controller.updateOwnerProduct);
  router.patch("/owner/products/:productId/stock", requireAuth(authRepository), requireRole("OWNER"), csrfProtection, controller.setOwnerProductStock);
  router.post("/owner/products/:productId/publish", requireAuth(authRepository), requireRole("OWNER"), csrfProtection, controller.publishOwnerProduct);
  router.post("/owner/products/:productId/unpublish", requireAuth(authRepository), requireRole("OWNER"), csrfProtection, controller.unpublishOwnerProduct);
  router.post("/owner/products/:productId/archive", requireAuth(authRepository), requireRole("OWNER"), csrfProtection, controller.archiveOwnerProduct);
  router.get("/owner/products/:productId/price-history", requireAuth(authRepository), requireRole("OWNER"), controller.listPriceHistory);
  router.post("/uploads/products", requireAuth(authRepository), requireRole("OWNER"), csrfProtection, controller.uploadProductImage);

  return router;
}
