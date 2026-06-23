import { describe, expect, it } from "vitest";

import { parseEnv } from "../../src/config/env.js";

const validEnv = {
  NODE_ENV: "test",
  API_PORT: "3000",
  DATABASE_URL: "mysql://novamall:password@localhost:3306/novamall_test",
  SESSION_SECRET: "session-secret-with-at-least-32-characters",
  PHONE_AES_KEY: "phone-key-with-at-least-32-characters",
  WEB_ORIGIN: "http://localhost:5173"
} as const;

describe("环境变量解析", () => {
  it("解析有效配置并转换端口", () => {
    const env = parseEnv(validEnv);
    expect(env.API_PORT).toBe(3000);
    expect(env.NODE_ENV).toBe("test");
  });

  it("缺失敏感配置时只报告字段名", () => {
    const result = parseEnv({ ...validEnv, SESSION_SECRET: undefined }, { safe: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldNames).toContain("SESSION_SECRET");
      expect(JSON.stringify(result)).not.toContain(validEnv.PHONE_AES_KEY);
    }
  });

  it("拒绝过短密钥和非法来源地址", () => {
    const result = parseEnv({
      ...validEnv,
      SESSION_SECRET: "short",
      PHONE_AES_KEY: "short",
      WEB_ORIGIN: "not-a-url"
    }, { safe: true });
    expect(result.success).toBe(false);
  });
});
