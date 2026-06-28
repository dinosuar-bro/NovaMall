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
  "RESOURCE_NOT_OWNED",
  "NOT_FOUND",
  "CATEGORY_NAME_TAKEN",
  "PRODUCT_STATE_CONFLICT",
  "PRODUCT_VERSION_CONFLICT",
  "INVALID_IMAGE_FILE",
  "IMAGE_TOO_LARGE",
  "IMAGE_TOO_SMALL",
  "EMPTY_CART",
  "ADDRESS_NOT_OWNED",
  "PRODUCT_UNAVAILABLE",
  "OUT_OF_STOCK",
  "ORDER_STATE_CONFLICT",
  "CHECKOUT_TOKEN_CONFLICT",
  "DUPLICATE_APPLICATION",
  "APPLICATION_STATE_CONFLICT",
  "SHOP_NAME_TAKEN",
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
