import { randomBytes, timingSafeEqual } from "node:crypto";

import type { RequestHandler } from "express";

import { AppError } from "../errors/app-error.js";

export function generateCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export const csrfProtection: RequestHandler = (request, _response, next) => {
  const expectedToken = request.session.csrfToken;
  const receivedToken = request.header("X-CSRF-Token");
  if (expectedToken === undefined || receivedToken === undefined || !safeCompare(expectedToken, receivedToken)) {
    next(new AppError(403, "CSRF_INVALID", "CSRF Token 无效"));
    return;
  }
  next();
};

function safeCompare(expectedToken: string, receivedToken: string): boolean {
  const expected = Buffer.from(expectedToken, "base64url");
  const received = Buffer.from(receivedToken, "base64url");
  return expected.byteLength === received.byteLength && timingSafeEqual(expected, received);
}
