import type { RequestHandler } from "express";

import { AppError } from "../../errors/app-error.js";
import type { CheckoutService } from "./checkout.service.js";

export class CheckoutController {
  constructor(private readonly service: CheckoutService) {}

  listAddresses: RequestHandler = async (request, response, next) => {
    try {
      response.json({ success: true, data: await this.service.listAddresses(currentUserId(request)) });
    } catch (error) {
      next(error);
    }
  };

  createAddress: RequestHandler = async (request, response, next) => {
    try {
      response.json({ success: true, data: await this.service.createAddress(currentUserId(request), request.body) });
    } catch (error) {
      next(error);
    }
  };

  getCart: RequestHandler = async (request, response, next) => {
    try {
      response.json({ success: true, data: await this.service.getCart(currentUserId(request)) });
    } catch (error) {
      next(error);
    }
  };

  addCartItem: RequestHandler = async (request, response, next) => {
    try {
      response.json({ success: true, data: await this.service.addCartItem(currentUserId(request), request.body) });
    } catch (error) {
      next(error);
    }
  };

  updateCartItem: RequestHandler = async (request, response, next) => {
    try {
      response.json({
        success: true,
        data: await this.service.updateCartItem(currentUserId(request), pathParam(request.params.itemId), request.body)
      });
    } catch (error) {
      next(error);
    }
  };

  deleteCartItem: RequestHandler = async (request, response, next) => {
    try {
      response.json({
        success: true,
        data: await this.service.deleteCartItem(currentUserId(request), pathParam(request.params.itemId))
      });
    } catch (error) {
      next(error);
    }
  };

  checkout: RequestHandler = async (request, response, next) => {
    try {
      response.json({ success: true, data: await this.service.checkout(currentUserId(request), request.body) });
    } catch (error) {
      next(error);
    }
  };

  listMemberOrders: RequestHandler = async (request, response, next) => {
    try {
      response.json({ success: true, data: await this.service.listMemberOrders(currentUserId(request)) });
    } catch (error) {
      next(error);
    }
  };

  listMemberShopOrders: RequestHandler = async (request, response, next) => {
    try {
      response.json({ success: true, data: await this.service.listMemberShopOrders(currentUserId(request)) });
    } catch (error) {
      next(error);
    }
  };

  payOrder: RequestHandler = async (request, response, next) => {
    try {
      response.json({
        success: true,
        data: await this.service.payOrder(currentUserId(request), pathParam(request.params.orderNo), request.requestId)
      });
    } catch (error) {
      next(error);
    }
  };

  cancelOrder: RequestHandler = async (request, response, next) => {
    try {
      response.json({
        success: true,
        data: await this.service.cancelOrder(currentUserId(request), pathParam(request.params.orderNo), request.requestId)
      });
    } catch (error) {
      next(error);
    }
  };

  confirmShopOrder: RequestHandler = async (request, response, next) => {
    try {
      response.json({
        success: true,
        data: await this.service.confirmShopOrder(
          currentUserId(request),
          pathParam(request.params.shopOrderNo),
          request.requestId
        )
      });
    } catch (error) {
      next(error);
    }
  };

  listOwnerShopOrders: RequestHandler = async (request, response, next) => {
    try {
      response.json({ success: true, data: await this.service.listOwnerShopOrders(currentUserId(request)) });
    } catch (error) {
      next(error);
    }
  };

  shipShopOrder: RequestHandler = async (request, response, next) => {
    try {
      response.json({
        success: true,
        data: await this.service.shipShopOrder(
          currentUserId(request),
          pathParam(request.params.shopOrderNo),
          request.requestId
        )
      });
    } catch (error) {
      next(error);
    }
  };

  listAuditLogs: RequestHandler = async (_request, response, next) => {
    try {
      response.json({ success: true, data: await this.service.listAuditLogs() });
    } catch (error) {
      next(error);
    }
  };

  listTopProducts: RequestHandler = async (_request, response, next) => {
    try {
      response.json({ success: true, data: await this.service.listTopProducts() });
    } catch (error) {
      next(error);
    }
  };
}

function currentUserId(request: Parameters<RequestHandler>[0]): string {
  const userId = request.currentUser?.id;
  if (userId === undefined) {
    throw new AppError(401, "AUTH_REQUIRED", "请先登录");
  }
  return userId;
}

function pathParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}
