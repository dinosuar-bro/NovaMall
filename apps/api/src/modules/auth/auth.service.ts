import { loginInputSchema, registerInputSchema, type AuthSessionData, type AuthUser } from "@novamall/shared";

import { AppError } from "../../errors/app-error.js";
import { AuthRepository } from "./auth.repository.js";
import { hashPassword, verifyPassword } from "./password.js";

export class AuthService {
  constructor(private readonly repository: AuthRepository) {}

  async register(input: unknown): Promise<AuthUser> {
    const parsed = registerInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "注册参数不合法");
    }
    return this.repository.createMember({
      username: parsed.data.username,
      passwordHash: await hashPassword(parsed.data.password),
      displayName: parsed.data.displayName,
      phone: parsed.data.phone
    });
  }

  async login(input: unknown): Promise<AuthUser> {
    const parsed = loginInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "登录参数不合法");
    }
    const credential = await this.repository.findCredentialByUsername(parsed.data.username);
    if (credential === null || !await verifyPassword(parsed.data.password, credential.passwordHash)) {
      throw new AppError(401, "INVALID_CREDENTIALS", "用户名或密码错误");
    }
    if (credential.status === "DISABLED") {
      throw new AppError(401, "ACCOUNT_DISABLED", "账号已被禁用");
    }
    return {
      id: credential.id,
      username: credential.username,
      displayName: credential.displayName,
      roles: credential.roles
    };
  }

  sessionData(user: AuthUser, csrfToken: string): AuthSessionData {
    return { user, csrfToken };
  }
}
