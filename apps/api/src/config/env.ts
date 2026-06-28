import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  PHONE_AES_KEY: z.string().min(32),
  WEB_ORIGIN: z.string().url(),
  UPLOAD_ROOT: z.string().min(1).default("uploads")
});

export type Env = z.infer<typeof envSchema>;

type SafeEnvResult =
  | { success: true; data: Env }
  | { success: false; fieldNames: string[] };

interface ParseOptions {
  safe?: boolean;
}

export function parseEnv(input: NodeJS.ProcessEnv | Record<string, string | undefined>): Env;
export function parseEnv(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
  options: { safe: true }
): SafeEnvResult;
export function parseEnv(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
  options: ParseOptions = {}
): Env | SafeEnvResult {
  const parsed = envSchema.safeParse(input);
  if (parsed.success) {
    return options.safe === true ? { success: true, data: parsed.data } : parsed.data;
  }

  const fieldNames = parsed.error.issues.map((issue) => String(issue.path[0] ?? "ENV"));
  const uniqueFieldNames = [...new Set(fieldNames)];
  if (options.safe === true) {
    return { success: false, fieldNames: uniqueFieldNames };
  }

  throw new Error(`环境变量无效：${uniqueFieldNames.join(", ")}`);
}

export function loadEnv(): Env {
  return parseEnv(process.env);
}
