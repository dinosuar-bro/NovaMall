import type { ErrorRequestHandler } from "express";

import { AppError } from "./app-error.js";

export const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
  void next;
  const requestId = request.requestId;

  if (error instanceof AppError) {
    response.status(error.status).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        requestId
      }
    });
    return;
  }

  response.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "服务内部错误",
      requestId
    }
  });
};
