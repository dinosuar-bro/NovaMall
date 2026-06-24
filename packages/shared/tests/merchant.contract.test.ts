import { describe, expect, it } from "vitest";

import { apiErrorCodeSchema } from "../src/errors.js";
import {
  adminMerchantApplicationSchema,
  merchantApplicationInputSchema,
  merchantApplicationRejectInputSchema,
  merchantApplicationSchema,
  merchantApplicationStatusSchema,
  paginatedMerchantApplicationsSchema,
  shopSummarySchema
} from "../src/merchant.contract.js";

describe("开店申请输入合同", () => {
  it("接受合法的店铺申请输入", () => {
    expect(merchantApplicationInputSchema.safeParse({
      shopName: "星选鲜果铺",
      shopDescription: "主营当季水果和社区精选礼盒"
    }).success).toBe(true);
  });

  it("拒绝过短店铺名、过短简介和额外字段", () => {
    expect(merchantApplicationInputSchema.safeParse({
      shopName: "星",
      shopDescription: "太短",
      unexpected: "不允许"
    }).success).toBe(false);
  });

  it("拒绝空拒绝原因", () => {
    expect(merchantApplicationRejectInputSchema.safeParse({ reason: "店铺简介需要补充主营品类" }).success)
      .toBe(true);
    expect(merchantApplicationRejectInputSchema.safeParse({ reason: " " }).success).toBe(false);
  });
});

describe("开店申请输出合同", () => {
  it("申请状态只允许三种固定值", () => {
    expect(merchantApplicationStatusSchema.options).toEqual(["PENDING", "APPROVED", "REJECTED"]);
    expect(merchantApplicationStatusSchema.safeParse("DRAFT").success).toBe(false);
  });

  it("会员申请 DTO 使用字符串 ID 和可空审核字段", () => {
    const result = merchantApplicationSchema.safeParse({
      id: "12",
      shopName: "星选鲜果铺",
      shopDescription: "主营当季水果和社区精选礼盒",
      status: "PENDING",
      rejectReason: null,
      reviewedBy: null,
      reviewedAt: null,
      submittedAt: "2026-06-23T08:00:00.000Z",
      updatedAt: "2026-06-23T08:00:00.000Z"
    });

    expect(result.success).toBe(true);
  });

  it("管理员申请 DTO 包含申请人摘要", () => {
    expect(adminMerchantApplicationSchema.safeParse({
      id: "12",
      user: {
        id: "5",
        username: "member01",
        displayName: "会员一"
      },
      shopName: "星选鲜果铺",
      shopDescription: "主营当季水果和社区精选礼盒",
      status: "REJECTED",
      rejectReason: "店铺简介需要补充主营品类",
      reviewedBy: "1",
      reviewedAt: "2026-06-23T08:10:00.000Z",
      submittedAt: "2026-06-23T08:00:00.000Z",
      updatedAt: "2026-06-23T08:10:00.000Z"
    }).success).toBe(true);
  });

  it("分页申请列表包含 meta", () => {
    expect(paginatedMerchantApplicationsSchema.safeParse({
      data: [],
      meta: {
        page: 1,
        pageSize: 20,
        total: 0
      }
    }).success).toBe(true);
  });

  it("店铺摘要 DTO 使用字符串 ID", () => {
    expect(shopSummarySchema.safeParse({
      id: "3",
      name: "星选鲜果铺",
      description: "主营当季水果和社区精选礼盒",
      status: "ACTIVE"
    }).success).toBe(true);
  });
});

describe("阶段 2 稳定错误码", () => {
  it.each([
    "DUPLICATE_APPLICATION",
    "APPLICATION_STATE_CONFLICT",
    "SHOP_NAME_TAKEN",
    "RESOURCE_NOT_OWNED",
    "NOT_FOUND"
  ] as const)("包含商户入驻错误码 %s", (code) => {
    expect(apiErrorCodeSchema.safeParse(code).success).toBe(true);
  });
});
