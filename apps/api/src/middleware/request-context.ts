import { randomUUID } from "node:crypto";

import type { RequestHandler } from "express";

export const requestContext: RequestHandler = (request, response, next) => {
  const requestId = request.header("X-Request-Id") ?? randomUUID();
  request.requestId = requestId;
  response.setHeader("X-Request-Id", requestId);
  next();
};
