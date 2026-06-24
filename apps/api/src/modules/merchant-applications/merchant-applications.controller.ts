import type { RequestHandler } from "express";

import { AppError } from "../../errors/app-error.js";
import type { MerchantApplicationsService } from "./merchant-applications.service.js";

export class MerchantApplicationsController {
  constructor(private readonly service: MerchantApplicationsService) {}

  getMine: RequestHandler = async (request, response, next) => {
    try {
      response.json({
        success: true,
        data: await this.service.getMine(currentUserId(request))
      });
    } catch (error) {
      next(error);
    }
  };

  submitMine: RequestHandler = async (request, response, next) => {
    try {
      response.json({
        success: true,
        data: await this.service.submit(currentUserId(request), request.body)
      });
    } catch (error) {
      next(error);
    }
  };

  listForAdmin: RequestHandler = async (request, response, next) => {
    try {
      const result = await this.service.listForAdmin(request.query);
      response.json({
        success: true,
        data: result.data,
        meta: result.meta
      });
    } catch (error) {
      next(error);
    }
  };

  approve: RequestHandler = async (request, response, next) => {
    try {
      response.json({
        success: true,
        data: await this.service.approve(pathParam(request.params.id), currentUserId(request), request.requestId)
      });
    } catch (error) {
      next(error);
    }
  };

  reject: RequestHandler = async (request, response, next) => {
    try {
      response.json({
        success: true,
        data: await this.service.reject(
          pathParam(request.params.id),
          currentUserId(request),
          request.requestId,
          request.body
        )
      });
    } catch (error) {
      next(error);
    }
  };

  getOwnerShop: RequestHandler = async (request, response, next) => {
    try {
      response.json({
        success: true,
        data: await this.service.getOwnerShop(currentUserId(request))
      });
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
