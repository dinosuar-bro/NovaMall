import { z } from "zod";

export const merchantApplicationStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);
export const shopStatusSchema = z.enum(["ACTIVE", "SUSPENDED"]);

export const merchantApplicationInputSchema = z.object({
  shopName: z.string().trim().min(2).max(100),
  shopDescription: z.string().trim().min(10).max(500)
}).strict();

export const merchantApplicationRejectInputSchema = z.object({
  reason: z.string().trim().min(2).max(500)
}).strict();

const nullableIsoStringSchema = z.string().min(1).nullable();

export const merchantApplicationSchema = z.object({
  id: z.string(),
  shopName: z.string(),
  shopDescription: z.string(),
  status: merchantApplicationStatusSchema,
  rejectReason: z.string().nullable(),
  reviewedBy: z.string().nullable(),
  reviewedAt: nullableIsoStringSchema,
  submittedAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const adminMerchantApplicationSchema = merchantApplicationSchema.extend({
  user: z.object({
    id: z.string(),
    username: z.string(),
    displayName: z.string()
  })
});

export const shopSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  status: shopStatusSchema
});

export const paginatedMerchantApplicationsSchema = z.object({
  data: z.array(adminMerchantApplicationSchema),
  meta: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative()
  })
});

export type MerchantApplicationStatus = z.infer<typeof merchantApplicationStatusSchema>;
export type ShopStatus = z.infer<typeof shopStatusSchema>;
export type MerchantApplicationInput = z.infer<typeof merchantApplicationInputSchema>;
export type MerchantApplicationRejectInput = z.infer<typeof merchantApplicationRejectInputSchema>;
export type MerchantApplication = z.infer<typeof merchantApplicationSchema>;
export type AdminMerchantApplication = z.infer<typeof adminMerchantApplicationSchema>;
export type ShopSummary = z.infer<typeof shopSummarySchema>;
export type PaginatedMerchantApplications = z.infer<typeof paginatedMerchantApplicationsSchema>;
