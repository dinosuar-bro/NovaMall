import {
  adminMerchantApplicationSchema,
  authSessionDataSchema,
  categoryInputSchema,
  categorySchema,
  loginInputSchema,
  merchantApplicationInputSchema,
  merchantApplicationRejectInputSchema,
  merchantApplicationSchema,
  ownerProductInputSchema,
  ownerProductSchema,
  paginatedCategoriesSchema,
  paginatedMerchantApplicationsSchema,
  paginatedOwnerProductsSchema,
  publicProductListSchema,
  publicProductSchema,
  registerInputSchema,
  shopSummarySchema,
  successResponseSchema,
  type AdminMerchantApplication,
  type AuthSessionData,
  type Category,
  type CategoryInput,
  type LoginInput,
  type MerchantApplication,
  type MerchantApplicationInput,
  type MerchantApplicationRejectInput,
  type OwnerProduct,
  type OwnerProductInput,
  type PaginatedCategories,
  type PaginatedMerchantApplications,
  type PaginatedOwnerProducts,
  type PublicProductList,
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

export async function listPublicCategories(): Promise<Category[]> {
  const response = await request("/categories", { method: "GET" });
  return successResponseSchema(z.array(categorySchema)).parse(response).data;
}

export async function listPublicProducts(params: {
  keyword?: string;
  categoryId?: string;
  sort?: string;
} = {}): Promise<PublicProductList> {
  const searchParams = new URLSearchParams();
  if (params.keyword !== undefined && params.keyword.trim().length > 0) {
    searchParams.set("keyword", params.keyword.trim());
  }
  if (params.categoryId !== undefined && params.categoryId.length > 0) {
    searchParams.set("categoryId", params.categoryId);
  }
  if (params.sort !== undefined) {
    searchParams.set("sort", params.sort);
  }
  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : "";
  const response = await request(`/products${suffix}`, { method: "GET" });
  const parsed = successResponseSchema(z.array(publicProductSchema))
    .extend({ meta: publicProductListSchema.shape.meta })
    .parse(response);
  return { data: parsed.data, meta: parsed.meta };
}

export async function listAdminCategories(): Promise<PaginatedCategories> {
  const response = await request("/admin/categories", { method: "GET" });
  const parsed = successResponseSchema(z.array(categorySchema))
    .extend({ meta: paginatedCategoriesSchema.shape.meta })
    .parse(response);
  return { data: parsed.data, meta: parsed.meta };
}

export async function createCategory(input: CategoryInput, csrfToken: string): Promise<Category> {
  const response = await writeJson("/admin/categories", "POST", categoryInputSchema.parse(input), csrfToken);
  return successResponseSchema(categorySchema).parse(response).data;
}

export async function listOwnerProducts(): Promise<PaginatedOwnerProducts> {
  const response = await request("/owner/products", { method: "GET" });
  const parsed = successResponseSchema(z.array(ownerProductSchema))
    .extend({ meta: paginatedOwnerProductsSchema.shape.meta })
    .parse(response);
  return { data: parsed.data, meta: parsed.meta };
}

export async function createOwnerProduct(input: OwnerProductInput, csrfToken: string): Promise<OwnerProduct> {
  const response = await writeJson("/owner/products", "POST", ownerProductInputSchema.parse(input), csrfToken);
  return successResponseSchema(ownerProductSchema).parse(response).data;
}

export async function publishOwnerProduct(productId: string, csrfToken: string): Promise<OwnerProduct> {
  const response = await writeJson(`/owner/products/${productId}/publish`, "POST", {}, csrfToken);
  return successResponseSchema(ownerProductSchema).parse(response).data;
}

export async function uploadProductImage(file: File, csrfToken: string): Promise<string> {
  const formData = new FormData();
  formData.set("image", file);
  const response = await request("/uploads/products", {
    method: "POST",
    headers: {
      "X-CSRF-Token": csrfToken
    },
    body: formData
  });
  return successResponseSchema(z.object({ path: z.string() })).parse(response).data.path;
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
