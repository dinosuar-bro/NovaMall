import {
  addressInputSchema,
  cartItemInputSchema,
  cartItemUpdateSchema,
  checkoutInputSchema
} from "@novamall/shared";
import { z } from "zod";

import { AppError } from "../../errors/app-error.js";
import type { CheckoutRepository } from "./checkout.repository.js";

const orderNoSchema = z.string().min(1).max(40);

export class CheckoutService {
  constructor(private readonly repository: CheckoutRepository) {}

  createAddress(userId: string, input: unknown) {
    const parsed = addressInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "地址参数不合法");
    }
    return this.repository.createAddress(userId, parsed.data);
  }

  listAddresses(userId: string) {
    return this.repository.listAddresses(userId);
  }

  getCart(userId: string) {
    return this.repository.getCart(userId);
  }

  addCartItem(userId: string, input: unknown) {
    const parsed = cartItemInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "购物车参数不合法");
    }
    return this.repository.addCartItem(userId, parsed.data);
  }

  updateCartItem(userId: string, itemId: string, input: unknown) {
    assertNumericId(itemId, "购物车项不存在");
    const parsed = cartItemUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "购物车参数不合法");
    }
    return this.repository.updateCartItem(userId, itemId, parsed.data);
  }

  deleteCartItem(userId: string, itemId: string) {
    assertNumericId(itemId, "购物车项不存在");
    return this.repository.deleteCartItem(userId, itemId);
  }

  checkout(userId: string, input: unknown) {
    const parsed = checkoutInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError(400, "CHECKOUT_TOKEN_CONFLICT", "结算参数不合法");
    }
    return this.repository.checkout(userId, parsed.data);
  }

  listMemberOrders(userId: string) {
    return this.repository.listMemberOrders(userId);
  }

  listMemberShopOrders(userId: string) {
    return this.repository.listMemberShopOrders(userId);
  }

  payOrder(userId: string, orderNo: string, requestId: string) {
    assertOrderNo(orderNo);
    return this.repository.payOrder(userId, orderNo, requestId);
  }

  cancelOrder(userId: string, orderNo: string, requestId: string) {
    assertOrderNo(orderNo);
    return this.repository.cancelOrder(userId, orderNo, requestId);
  }

  confirmShopOrder(userId: string, shopOrderNo: string, requestId: string) {
    assertShopOrderNo(shopOrderNo);
    return this.repository.confirmShopOrder(userId, shopOrderNo, requestId);
  }

  listOwnerShopOrders(ownerUserId: string) {
    return this.repository.listOwnerShopOrders(ownerUserId);
  }

  shipShopOrder(ownerUserId: string, shopOrderNo: string, requestId: string) {
    assertShopOrderNo(shopOrderNo);
    return this.repository.shipShopOrder(ownerUserId, shopOrderNo, requestId);
  }

  listAuditLogs() {
    return this.repository.listAuditLogs();
  }

  listTopProducts() {
    return this.repository.listTopProducts();
  }
}

function assertNumericId(value: string, message: string): void {
  if (!/^\d+$/.test(value)) {
    throw new AppError(404, "NOT_FOUND", message);
  }
}

function assertOrderNo(value: string): void {
  const parsed = orderNoSchema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(404, "NOT_FOUND", "订单不存在");
  }
}

function assertShopOrderNo(value: string): void {
  const parsed = orderNoSchema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(404, "NOT_FOUND", "子订单不存在");
  }
}
