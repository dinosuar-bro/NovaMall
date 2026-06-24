import {
  adminMerchantApplicationSchema,
  authSessionDataSchema,
  loginInputSchema,
  merchantApplicationInputSchema,
  merchantApplicationRejectInputSchema,
  merchantApplicationSchema,
  paginatedMerchantApplicationsSchema,
  registerInputSchema,
  shopSummarySchema,
  successResponseSchema,
  type AdminMerchantApplication,
  type AuthSessionData,
  type LoginInput,
  type MerchantApplication,
  type MerchantApplicationInput,
  type MerchantApplicationRejectInput,
  type PaginatedMerchantApplications,
  type RegisterInput,
  type ShopSummary
} from "@novamall/shared";
import { z } from "zod";

const API_PREFIX = "/api/v1";

export class ApiClientError extends Error {
  constructor(readonly code: string, message: string, readonly requestId?: string) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function fetchCsrf(): Promise<string> {
  const response = await request("/auth/csrf", { method: "GET" });
  const parsed = successResponseSchema(authSessionDataSchema.pick({ csrfToken: true })).parse(response);
  return parsed.data.csrfToken;
}

export async function register(input: RegisterInput, csrfToken: string): Promise<AuthSessionData> {
  return writeAuth("/auth/register", registerInputSchema.parse(input), csrfToken);
}

export async function login(input: LoginInput, csrfToken: string): Promise<AuthSessionData> {
  return writeAuth("/auth/login", loginInputSchema.parse(input), csrfToken);
}

export async function getCurrentSession(): Promise<AuthSessionData> {
  const response = await request("/auth/session", { method: "GET" });
  return successResponseSchema(authSessionDataSchema).parse(response).data;
}

export async function getMyMerchantApplication(): Promise<MerchantApplication | null> {
  const response = await request("/merchant-applications/me", { method: "GET" });
  return successResponseSchema(merchantApplicationSchema.nullable()).parse(response).data;
}

export async function submitMerchantApplication(
  input: MerchantApplicationInput,
  csrfToken: string
): Promise<MerchantApplication> {
  const response = await writeJson(
    "/merchant-applications/me",
    "PUT",
    merchantApplicationInputSchema.parse(input),
    csrfToken
  );
  return successResponseSchema(merchantApplicationSchema).parse(response).data;
}

export async function listMerchantApplications(status?: AdminMerchantApplication["status"]): Promise<PaginatedMerchantApplications> {
  const params = new URLSearchParams();
  if (status !== undefined) {
    params.set("status", status);
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await request(`/admin/merchant-applications${suffix}`, { method: "GET" });
  const parsed = successResponseSchema(z.array(adminMerchantApplicationSchema))
    .extend({ meta: paginatedMerchantApplicationsSchema.shape.meta })
    .parse(response);
  return {
    data: parsed.data,
    meta: parsed.meta
  };
}

export async function approveMerchantApplication(id: string, csrfToken: string): Promise<{
  application: Pick<MerchantApplication, "id" | "status">;
  shop: ShopSummary;
}> {
  const response = await writeJson(`/admin/merchant-applications/${id}/approve`, "POST", {}, csrfToken);
  return successResponseSchema(z.object({
    application: merchantApplicationSchema.pick({ id: true, status: true }),
    shop: shopSummarySchema
  })).parse(response).data;
}

export async function rejectMerchantApplication(
  id: string,
  input: MerchantApplicationRejectInput,
  csrfToken: string
): Promise<MerchantApplication> {
  const response = await writeJson(
    `/admin/merchant-applications/${id}/reject`,
    "POST",
    merchantApplicationRejectInputSchema.parse(input),
    csrfToken
  );
  return successResponseSchema(merchantApplicationSchema).parse(response).data;
}

export async function getOwnerShop(): Promise<ShopSummary> {
  const response = await request("/owner/shop", { method: "GET" });
  return successResponseSchema(shopSummarySchema).parse(response).data;
}

async function writeAuth(path: string, body: RegisterInput | LoginInput, csrfToken: string): Promise<AuthSessionData> {
  const response = await writeJson(path, "POST", body, csrfToken);
  return successResponseSchema(authSessionDataSchema).parse(response).data;
}

async function writeJson(path: string, method: "POST" | "PUT", body: object, csrfToken: string): Promise<unknown> {
  return request(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken
    },
    body: JSON.stringify(body)
  });
}

async function request(path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${API_PREFIX}${path}`, {
    credentials: "include",
    ...init
  });
  const body = await response.json() as unknown;
  if (!response.ok) {
    throw parseApiError(body);
  }
  return body;
}

function parseApiError(body: unknown): ApiClientError {
  if (
    typeof body === "object"
    && body !== null
    && "error" in body
    && typeof body.error === "object"
    && body.error !== null
    && "code" in body.error
    && "message" in body.error
  ) {
    const code = typeof body.error.code === "string" ? body.error.code : "INTERNAL_ERROR";
    const message = typeof body.error.message === "string" ? body.error.message : "请求失败";
    const requestId = "requestId" in body.error && typeof body.error.requestId === "string"
      ? body.error.requestId
      : undefined;
    return new ApiClientError(code, message, requestId);
  }
  return new ApiClientError("INTERNAL_ERROR", "请求失败");
}
