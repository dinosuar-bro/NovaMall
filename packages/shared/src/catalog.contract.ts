import { z } from "zod";

const idStringSchema = z.string().regex(/^\d+$/);
const moneyStringSchema = z.string().regex(/^\d+\.\d{2}$/);
const uploadPathSchema = z.string().regex(/^\/uploads\/products\/\d{4}\/\d{2}\/[^/]+\.(jpg|jpeg|png|webp)$/);

export const categoryStatusSchema = z.enum(["ACTIVE", "DISABLED"]);
export const productStatusSchema = z.enum(["DRAFT", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"]);
export const productSortSchema = z.enum(["newest", "priceAsc", "priceDesc", "relevance"]);

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(2).max(255)
}).strict();

export const categorySchema = z.object({
  id: idStringSchema,
  name: z.string(),
  description: z.string(),
  status: categoryStatusSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const paginatedCategoriesSchema = z.object({
  data: z.array(categorySchema),
  meta: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative()
  })
});

export const ownerProductInputSchema = z.object({
  categoryId: idStringSchema,
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10).max(1000),
  price: moneyStringSchema,
  stock: z.number().int().nonnegative().max(999999),
  mainImagePath: uploadPathSchema.nullable().optional()
}).strict();

export const ownerProductStockInputSchema = z.object({
  stock: z.number().int().nonnegative().max(999999),
  version: z.number().int().positive()
}).strict();

export const ownerProductSchema = z.object({
  id: idStringSchema,
  shopId: idStringSchema,
  categoryId: idStringSchema,
  categoryName: z.string(),
  name: z.string(),
  description: z.string(),
  price: moneyStringSchema,
  stock: z.number().int().nonnegative(),
  mainImagePath: uploadPathSchema.nullable(),
  status: productStatusSchema,
  version: z.number().int().positive(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const paginatedOwnerProductsSchema = z.object({
  data: z.array(ownerProductSchema),
  meta: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative()
  })
});

export const publicProductSchema = z.object({
  id: idStringSchema,
  name: z.string(),
  description: z.string(),
  price: moneyStringSchema,
  stock: z.number().int().nonnegative(),
  mainImagePath: uploadPathSchema,
  category: z.object({
    id: idStringSchema,
    name: z.string()
  }),
  shop: z.object({
    id: idStringSchema,
    name: z.string()
  }),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const productDetailSchema = publicProductSchema;

export const publicProductListSchema = z.object({
  data: z.array(publicProductSchema),
  meta: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative()
  })
});

export const productSearchQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(60).default(20),
  categoryId: idStringSchema.optional(),
  keyword: z.string().trim().min(1).max(80).optional(),
  sort: productSortSchema.default("newest")
}).strict().superRefine((value, context) => {
  if (value.sort === "relevance" && value.keyword === undefined) {
    context.addIssue({
      code: "custom",
      path: ["sort"],
      message: "相关度排序需要关键词"
    });
  }
});

export const productPriceHistorySchema = z.object({
  id: idStringSchema,
  productId: idStringSchema,
  oldPrice: moneyStringSchema,
  newPrice: moneyStringSchema,
  changedBy: idStringSchema.nullable(),
  requestId: z.string().nullable(),
  changedAt: z.string().min(1)
});

export const uploadProductImageResponseSchema = z.object({
  path: uploadPathSchema
});

export type CategoryStatus = z.infer<typeof categoryStatusSchema>;
export type ProductStatus = z.infer<typeof productStatusSchema>;
export type ProductSort = z.infer<typeof productSortSchema>;
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type Category = z.infer<typeof categorySchema>;
export type PaginatedCategories = z.infer<typeof paginatedCategoriesSchema>;
export type OwnerProductInput = z.infer<typeof ownerProductInputSchema>;
export type OwnerProductStockInput = z.infer<typeof ownerProductStockInputSchema>;
export type OwnerProduct = z.infer<typeof ownerProductSchema>;
export type PaginatedOwnerProducts = z.infer<typeof paginatedOwnerProductsSchema>;
export type PublicProduct = z.infer<typeof publicProductSchema>;
export type ProductDetail = z.infer<typeof productDetailSchema>;
export type PublicProductList = z.infer<typeof publicProductListSchema>;
export type ProductSearchQuery = z.infer<typeof productSearchQuerySchema>;
export type ProductPriceHistory = z.infer<typeof productPriceHistorySchema>;
export type UploadProductImageResponse = z.infer<typeof uploadProductImageResponseSchema>;
