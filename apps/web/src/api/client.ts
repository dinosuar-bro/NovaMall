import {
  adminMerchantApplicationSchema,
  addressInputSchema,
  addressSchema,
  authSessionDataSchema,
  auditLogSchema,
  cartItemInputSchema,
  cartItemUpdateSchema,
  cartSchema,
  categoryInputSchema,
  categorySchema,
  checkoutInputSchema,
  checkoutResultSchema,
  loginInputSchema,
  memberOrderSchema,
  merchantApplicationInputSchema,
  merchantApplicationRejectInputSchema,
  merchantApplicationSchema,
  ownerProductInputSchema,
  ownerProductSchema,
  paginatedCategoriesSchema,
  paginatedMerchantApplicationsSchema,
  paginatedOwnerProductsSchema,
  privateProfileSchema,
  publicProductListSchema,
  publicProductSchema,
  registerInputSchema,
  shopOrderSchema,
  shopSummarySchema,
  successResponseSchema,
  topProductSchema,
  updatePrivateProfileInputSchema,
  type Address,
  type AddressInput,
  type AdminMerchantApplication,
  type AuditLog,
  type AuthSessionData,
  type Cart,
  type CartItemInput,
  type CartItemUpdate,
  type Category,
  type CategoryInput,
  type CheckoutInput,
  type CheckoutResult,
  type LoginInput,
  type MemberOrder,
  type MerchantApplication,
  type MerchantApplicationInput,
  type MerchantApplicationRejectInput,
  type OwnerProduct,
  type OwnerProductInput,
  type PaginatedCategories,
  type PaginatedMerchantApplications,
  type PaginatedOwnerProducts,
  type PrivateProfile,
  type PublicProductList,
  type RegisterInput,
  type ShopOrder,
  type ShopSummary,
  type TopProduct,
  type UpdatePrivateProfileInput
} from "@novamall/shared";
import { z } from "zod";

const API_PREFIX = "/api/v1";
const csrfCacheTtlMs = 1000;

interface CsrfState {
  request: Promise<string> | null;
  tokenCache: { token: string; cachedAt: number } | null;
}

declare global {
  var __novamallCsrfState: CsrfState | undefined;
}

const csrfState = globalThis.__novamallCsrfState ??= {
  request: null,
  tokenCache: null
};

export class ApiClientError extends Error {
  constructor(readonly code: string, message: string, readonly requestId?: string) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function fetchCsrf(): Promise<string> {
  if (csrfState.tokenCache !== null && Date.now() - csrfState.tokenCache.cachedAt < csrfCacheTtlMs) {
    return csrfState.tokenCache.token;
  }
  csrfState.request ??= request("/auth/csrf", { method: "GET", cache: "no-store" })
    .then((response) => {
      const token = successResponseSchema(authSessionDataSchema.pick({ csrfToken: true })).parse(response).data.csrfToken;
      csrfState.tokenCache = { token, cachedAt: Date.now() };
      return token;
    })
    .finally(() => {
      csrfState.request = null;
    });
  return csrfState.request;
}

export async function register(input: RegisterInput, csrfToken: string): Promise<AuthSessionData> {
  return writeAuth("/auth/register", registerInputSchema.parse(input), csrfToken);
}

export async function login(input: LoginInput, csrfToken: string): Promise<AuthSessionData> {
  return writeAuth("/auth/login", loginInputSchema.parse(input), csrfToken);
}

export async function logout(csrfToken: string): Promise<void> {
  await writeJson("/auth/logout", "POST", {}, csrfToken);
}

export async function getCurrentSession(): Promise<AuthSessionData> {
  const response = await request("/auth/session", { method: "GET" });
  return successResponseSchema(authSessionDataSchema).parse(response).data;
}

export async function getPrivateProfile(): Promise<PrivateProfile> {
  const response = await request("/auth/profile", { method: "GET" });
  return successResponseSchema(privateProfileSchema).parse(response).data;
}

export async function updatePrivateProfile(
  input: UpdatePrivateProfileInput,
  csrfToken: string
): Promise<PrivateProfile> {
  const response = await writeJson("/auth/profile", "PATCH", updatePrivateProfileInputSchema.parse(input), csrfToken);
  return successResponseSchema(privateProfileSchema).parse(response).data;
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

export async function listAddresses(): Promise<Address[]> {
  const response = await request("/member/addresses", { method: "GET" });
  return successResponseSchema(z.array(addressSchema)).parse(response).data;
}

export async function createAddress(input: AddressInput, csrfToken: string): Promise<Address> {
  const response = await writeJson("/member/addresses", "POST", addressInputSchema.parse(input), csrfToken);
  return successResponseSchema(addressSchema).parse(response).data;
}

export async function getCart(): Promise<Cart> {
  const response = await request("/member/cart", { method: "GET" });
  return successResponseSchema(cartSchema).parse(response).data;
}

export async function addCartItem(input: CartItemInput, csrfToken: string): Promise<Cart> {
  const response = await writeJson("/member/cart/items", "POST", cartItemInputSchema.parse(input), csrfToken);
  return successResponseSchema(cartSchema).parse(response).data;
}

export async function updateCartItem(itemId: string, input: CartItemUpdate, csrfToken: string): Promise<Cart> {
  const response = await writeJson(
    `/member/cart/items/${itemId}`,
    "PATCH",
    cartItemUpdateSchema.parse(input),
    csrfToken
  );
  return successResponseSchema(cartSchema).parse(response).data;
}

export async function deleteCartItem(itemId: string, csrfToken: string): Promise<Cart> {
  const response = await writeJson(`/member/cart/items/${itemId}`, "DELETE", {}, csrfToken);
  return successResponseSchema(cartSchema).parse(response).data;
}

export async function checkoutCart(input: CheckoutInput, csrfToken: string): Promise<CheckoutResult> {
  const response = await writeJson("/member/checkout", "POST", checkoutInputSchema.parse(input), csrfToken);
  return successResponseSchema(checkoutResultSchema).parse(response).data;
}

export async function listMemberOrders(): Promise<MemberOrder[]> {
  const response = await request("/member/orders", { method: "GET" });
  return successResponseSchema(z.array(memberOrderSchema)).parse(response).data;
}

export async function listMemberShopOrders(): Promise<ShopOrder[]> {
  const response = await request("/member/shop-orders", { method: "GET" });
  return successResponseSchema(z.array(shopOrderSchema)).parse(response).data;
}

export async function payOrder(orderNo: string, csrfToken: string): Promise<MemberOrder> {
  const response = await writeJson(`/member/orders/${orderNo}/pay`, "POST", {}, csrfToken);
  return successResponseSchema(memberOrderSchema).parse(response).data;
}

export async function confirmShopOrder(shopOrderNo: string, csrfToken: string): Promise<ShopOrder> {
  const response = await writeJson(`/member/shop-orders/${shopOrderNo}/confirm`, "POST", {}, csrfToken);
  return successResponseSchema(shopOrderSchema).parse(response).data;
}

export async function listOwnerShopOrders(): Promise<ShopOrder[]> {
  const response = await request("/owner/shop-orders", { method: "GET" });
  return successResponseSchema(z.array(shopOrderSchema)).parse(response).data;
}

export async function shipShopOrder(shopOrderNo: string, csrfToken: string): Promise<ShopOrder> {
  const response = await writeJson(`/owner/shop-orders/${shopOrderNo}/ship`, "POST", {}, csrfToken);
  return successResponseSchema(shopOrderSchema).parse(response).data;
}

export async function listAuditLogs(): Promise<AuditLog[]> {
  const response = await request("/admin/audit-logs", { method: "GET" });
  return successResponseSchema(z.array(auditLogSchema)).parse(response).data;
}

export async function listTopProducts(): Promise<TopProduct[]> {
  const response = await request("/admin/database/top-products", { method: "GET" });
  return successResponseSchema(z.array(topProductSchema)).parse(response).data;
}

async function writeAuth(path: string, body: RegisterInput | LoginInput, csrfToken: string): Promise<AuthSessionData> {
  const response = await writeJson(path, "POST", body, csrfToken);
  const session = successResponseSchema(authSessionDataSchema).parse(response).data;
  csrfState.tokenCache = { token: session.csrfToken, cachedAt: Date.now() };
  return session;
}

async function writeJson(path: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body: object, csrfToken: string): Promise<unknown> {
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
