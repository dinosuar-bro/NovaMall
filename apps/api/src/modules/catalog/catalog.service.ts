import {
  categoryInputSchema,
  ownerProductInputSchema,
  ownerProductStockInputSchema,
  productSearchQuerySchema
} from "@novamall/shared";
import { z } from "zod";

import { AppError } from "../../errors/app-error.js";
import type { CatalogRepository } from "./catalog.repository.js";

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20)
});

export interface UploadedFileInput {
  filepath: string;
  mimetype: string | null;
  originalFilename: string | null;
  size: number;
}

export class CatalogService {
  constructor(private readonly repository: CatalogRepository) {}

  listPublicCategories() {
    return this.repository.listActiveCategories();
  }

  listPublicProducts(query: unknown) {
    const parsed = productSearchQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "商品查询参数不合法");
    }
    return this.repository.listPublicProducts(parsed.data);
  }

  async getPublicProduct(productId: string) {
    assertNumericId(productId, "商品不存在");
    const product = await this.repository.findPublicProduct(productId);
    if (product === null) {
      throw new AppError(404, "NOT_FOUND", "商品不存在");
    }
    return product;
  }

  listCategoriesForAdmin(query: unknown) {
    const parsed = paginationSchema.safeParse(query);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "分类查询参数不合法");
    }
    return this.repository.listCategoriesForAdmin(parsed.data);
  }

  createCategory(input: unknown) {
    const parsed = categoryInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "分类参数不合法");
    }
    return this.repository.createCategory(parsed.data);
  }

  updateCategory(categoryId: string, input: unknown) {
    assertNumericId(categoryId, "分类不存在");
    const parsed = categoryInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "分类参数不合法");
    }
    return this.repository.updateCategory(categoryId, parsed.data);
  }

  enableCategory(categoryId: string) {
    assertNumericId(categoryId, "分类不存在");
    return this.repository.setCategoryStatus(categoryId, "ACTIVE");
  }

  disableCategory(categoryId: string) {
    assertNumericId(categoryId, "分类不存在");
    return this.repository.setCategoryStatus(categoryId, "DISABLED");
  }

  listOwnerProducts(ownerUserId: string, query: unknown) {
    const parsed = paginationSchema.safeParse(query);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "商品查询参数不合法");
    }
    return this.repository.listOwnerProducts(ownerUserId, parsed.data);
  }

  createOwnerProduct(ownerUserId: string, input: unknown) {
    const parsed = ownerProductInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "商品参数不合法");
    }
    return this.repository.createOwnerProduct(ownerUserId, parsed.data);
  }

  async getOwnerProduct(ownerUserId: string, productId: string) {
    assertNumericId(productId, "商品不存在");
    const product = await this.repository.findOwnerProduct(ownerUserId, productId);
    if (product === null) {
      throw new AppError(404, "NOT_FOUND", "商品不存在");
    }
    return product;
  }

  updateOwnerProduct(ownerUserId: string, productId: string, input: unknown, requestId: string) {
    assertNumericId(productId, "商品不存在");
    const parsed = ownerProductInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "商品参数不合法");
    }
    return this.repository.updateOwnerProduct(ownerUserId, productId, parsed.data, requestId);
  }

  setOwnerProductStock(ownerUserId: string, productId: string, input: unknown, requestId: string) {
    assertNumericId(productId, "商品不存在");
    const parsed = ownerProductStockInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "库存参数不合法");
    }
    return this.repository.setOwnerProductStock(ownerUserId, productId, parsed.data, requestId);
  }

  publishOwnerProduct(ownerUserId: string, productId: string, requestId: string) {
    assertNumericId(productId, "商品不存在");
    return this.repository.transitionOwnerProductStatus(ownerUserId, productId, "PUBLISHED", requestId);
  }

  unpublishOwnerProduct(ownerUserId: string, productId: string, requestId: string) {
    assertNumericId(productId, "商品不存在");
    return this.repository.transitionOwnerProductStatus(ownerUserId, productId, "UNPUBLISHED", requestId);
  }

  archiveOwnerProduct(ownerUserId: string, productId: string, requestId: string) {
    assertNumericId(productId, "商品不存在");
    return this.repository.transitionOwnerProductStatus(ownerUserId, productId, "ARCHIVED", requestId);
  }

  listPriceHistory(ownerUserId: string, productId: string) {
    assertNumericId(productId, "商品不存在");
    return this.repository.listPriceHistory(ownerUserId, productId);
  }

  uploadProductImage(file: UploadedFileInput | null) {
    if (file === null) {
      throw new AppError(400, "INVALID_IMAGE_FILE", "请上传商品图片");
    }
    return this.repository.saveProductImage(file);
  }
}

function assertNumericId(value: string, message: string): void {
  if (!/^\d+$/.test(value)) {
    throw new AppError(404, "NOT_FOUND", message);
  }
}
