import { describe, expect, it } from "vitest";

import {
  categoryInputSchema,
  categorySchema,
  ownerProductInputSchema,
  ownerProductSchema,
  productSearchQuerySchema,
  publicProductListSchema,
  uploadProductImageResponseSchema
} from "../src/catalog.contract.js";
import { apiErrorCodeSchema } from "../src/errors.js";

describe("商品目录合同", () => {
  it("校验分类输入和输出", () => {
    expect(categoryInputSchema.parse({
      name: "生鲜水果",
      description: "当季水果与社区精选"
    })).toEqual({
      name: "生鲜水果",
      description: "当季水果与社区精选"
    });
    expect(categorySchema.parse({
      id: "1",
      name: "生鲜水果",
      description: "当季水果与社区精选",
      status: "ACTIVE",
      createdAt: "2026-06-24T01:00:00.000Z",
      updatedAt: "2026-06-24T01:00:00.000Z"
    }).status).toBe("ACTIVE");
  });

  it("校验店主商品输入和输出", () => {
    expect(ownerProductInputSchema.parse({
      categoryId: "1",
      name: "四川脆桃",
      description: "当季现摘，适合家庭分享",
      price: "29.90",
      stock: 30,
      mainImagePath: "/uploads/products/2026/06/example.webp"
    }).price).toBe("29.90");
    expect(ownerProductSchema.parse({
      id: "10",
      shopId: "3",
      categoryId: "1",
      categoryName: "生鲜水果",
      name: "四川脆桃",
      description: "当季现摘，适合家庭分享",
      price: "29.90",
      stock: 30,
      mainImagePath: "/uploads/products/2026/06/example.webp",
      status: "DRAFT",
      version: 1,
      createdAt: "2026-06-24T01:00:00.000Z",
      updatedAt: "2026-06-24T01:00:00.000Z"
    }).status).toBe("DRAFT");
  });

  it("校验公开搜索查询和分页响应", () => {
    expect(productSearchQuerySchema.parse({
      page: "1",
      pageSize: "12",
      categoryId: "1",
      keyword: "桃",
      sort: "relevance"
    }).sort).toBe("relevance");
    expect(publicProductListSchema.parse({
      data: [{
        id: "10",
        name: "Stage6性能商品",
        description: "阶段六性能测试商品",
        price: "19.90",
        stock: 20,
        mainImagePath: "/uploads/products/stage6-performance.png",
        category: { id: "1", name: "性能分类" },
        shop: { id: "1", name: "共享商品池" },
        createdAt: "2026-06-24T01:00:00.000Z",
        updatedAt: "2026-06-24T01:00:00.000Z"
      }],
      meta: { page: 1, pageSize: 12, total: 0 }
    }).data[0]?.mainImagePath).toBe("/uploads/products/stage6-performance.png");
  });

  it("校验上传响应和阶段 3 错误码", () => {
    expect(uploadProductImageResponseSchema.parse({
      path: "/uploads/products/2026/06/image.webp"
    }).path).toContain("/uploads/products/");
    expect(apiErrorCodeSchema.parse("CATEGORY_NAME_TAKEN")).toBe("CATEGORY_NAME_TAKEN");
    expect(apiErrorCodeSchema.parse("PRODUCT_STATE_CONFLICT")).toBe("PRODUCT_STATE_CONFLICT");
    expect(apiErrorCodeSchema.parse("PRODUCT_VERSION_CONFLICT")).toBe("PRODUCT_VERSION_CONFLICT");
    expect(apiErrorCodeSchema.parse("INVALID_IMAGE_FILE")).toBe("INVALID_IMAGE_FILE");
    expect(apiErrorCodeSchema.parse("IMAGE_TOO_LARGE")).toBe("IMAGE_TOO_LARGE");
    expect(apiErrorCodeSchema.parse("IMAGE_TOO_SMALL")).toBe("IMAGE_TOO_SMALL");
  });
});
