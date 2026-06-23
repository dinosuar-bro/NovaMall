import type { RequestHandler } from "express";
import type { RoleCode } from "@novamall/shared";

import { AppError } from "../errors/app-error.js";
import type { AuthRepository } from "../modules/auth/auth.repository.js";

export function requireAuth(repository: AuthRepository): RequestHandler {
  return async (request, _response, next) => {
    try {
      const userId = request.session.userId;
      if (userId === undefined) {
        next(new AppError(401, "AUTH_REQUIRED", "请先登录"));
        return;
      }
      const user = await repository.findAuthUserById(userId);
      if (user === null) {
        request.session.destroy(() => undefined);
        next(new AppError(401, "AUTH_REQUIRED", "请先登录"));
        return;
      }
      request.currentUser = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(role: RoleCode): RequestHandler {
  return (request, _response, next) => {
    if (request.currentUser?.roles.includes(role) !== true) {
      next(new AppError(403, "FORBIDDEN", "角色权限不足"));
      return;
    }
    next();
  };
}
