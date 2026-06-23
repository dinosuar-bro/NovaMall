import { z } from "zod";

export const roleCodeSchema = z.enum(["MEMBER", "OWNER", "ADMIN"]);

export const registerInputSchema = z.object({
  username: z.string().trim().min(3).max(50).regex(/^[A-Za-z0-9_]+$/),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(1).max(100),
  phone: z.string().regex(/^1[3-9]\d{9}$/)
}).strict();

export const loginInputSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(128)
}).strict();

export const authUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  roles: z.array(roleCodeSchema)
});

export const authSessionDataSchema = z.object({
  user: authUserSchema,
  csrfToken: z.string().min(1)
});

export const csrfDataSchema = z.object({
  csrfToken: z.string().min(1)
});

export const successResponseSchema = <T extends z.ZodType>(dataSchema: T) => z.object({
  success: z.literal(true),
  data: dataSchema
});

export type RoleCode = z.infer<typeof roleCodeSchema>;
export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthSessionData = z.infer<typeof authSessionDataSchema>;
