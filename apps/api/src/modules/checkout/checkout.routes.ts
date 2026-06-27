import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.js";
import { csrfProtection } from "../../middleware/csrf.js";
import type { AuthRepository } from "../auth/auth.repository.js";
import { CheckoutController } from "./checkout.controller.js";
import type { CheckoutRepository } from "./checkout.repository.js";
import { CheckoutService } from "./checkout.service.js";

export function createCheckoutRouter(
  authRepository: AuthRepository,
  checkoutRepository: CheckoutRepository
): Router {
  const router = Router();
  const controller = new CheckoutController(new CheckoutService(checkoutRepository));

  router.get("/member/addresses", requireAuth(authRepository), requireRole("MEMBER"), controller.listAddresses);
  router.post("/member/addresses", requireAuth(authRepository), requireRole("MEMBER"), csrfProtection, controller.createAddress);
  router.get("/member/cart", requireAuth(authRepository), requireRole("MEMBER"), controller.getCart);
  router.post("/member/cart/items", requireAuth(authRepository), requireRole("MEMBER"), csrfProtection, controller.addCartItem);
  router.patch("/member/cart/items/:itemId", requireAuth(authRepository), requireRole("MEMBER"), csrfProtection, controller.updateCartItem);
  router.delete("/member/cart/items/:itemId", requireAuth(authRepository), requireRole("MEMBER"), csrfProtection, controller.deleteCartItem);
  router.post("/member/checkout", requireAuth(authRepository), requireRole("MEMBER"), csrfProtection, controller.checkout);
  router.get("/member/orders", requireAuth(authRepository), requireRole("MEMBER"), controller.listMemberOrders);
  router.get("/member/shop-orders", requireAuth(authRepository), requireRole("MEMBER"), controller.listMemberShopOrders);
  router.post("/member/orders/:orderNo/pay", requireAuth(authRepository), requireRole("MEMBER"), csrfProtection, controller.payOrder);
  router.post("/member/orders/:orderNo/cancel", requireAuth(authRepository), requireRole("MEMBER"), csrfProtection, controller.cancelOrder);
  router.post("/member/shop-orders/:shopOrderNo/confirm", requireAuth(authRepository), requireRole("MEMBER"), csrfProtection, controller.confirmShopOrder);
  router.get("/owner/shop-orders", requireAuth(authRepository), requireRole("OWNER"), controller.listOwnerShopOrders);
  router.post("/owner/shop-orders/:shopOrderNo/ship", requireAuth(authRepository), requireRole("OWNER"), csrfProtection, controller.shipShopOrder);
  router.get("/admin/audit-logs", requireAuth(authRepository), requireRole("ADMIN"), controller.listAuditLogs);
  router.get("/admin/database/top-products", requireAuth(authRepository), requireRole("ADMIN"), controller.listTopProducts);

  return router;
}
