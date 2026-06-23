import { z } from "zod";

export const apiErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "CSRF_INVALID",
  "INVALID_CREDENTIALS",
  "AUTH_REQUIRED",
  "ACCOUNT_DISABLED",
  "FORBIDDEN",
  "USERNAME_TAKEN",
  "SERVICE_NOT_READY",
  "INTERNAL_ERROR"
]);

export const fieldErrorSchema = z.object({
  field: z.string(),
  message: z.string()
});

export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    requestId: z.string(),
    fields: z.array(fieldErrorSchema).optional()
  })
});

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
