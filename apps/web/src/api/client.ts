import {
  authSessionDataSchema,
  loginInputSchema,
  registerInputSchema,
  successResponseSchema,
  type AuthSessionData,
  type LoginInput,
  type RegisterInput
} from "@novamall/shared";

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

async function writeAuth(path: string, body: RegisterInput | LoginInput, csrfToken: string): Promise<AuthSessionData> {
  const response = await request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken
    },
    body: JSON.stringify(body)
  });
  return successResponseSchema(authSessionDataSchema).parse(response).data;
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
