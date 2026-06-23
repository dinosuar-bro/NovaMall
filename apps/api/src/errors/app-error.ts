import type { ApiErrorCode } from "@novamall/shared";

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}
