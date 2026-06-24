import {
  merchantApplicationInputSchema,
  merchantApplicationRejectInputSchema,
  merchantApplicationStatusSchema
} from "@novamall/shared";
import { z } from "zod";

import { AppError } from "../../errors/app-error.js";
import type { MerchantApplicationsRepository } from "./merchant-applications.repository.js";

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: merchantApplicationStatusSchema.optional()
});

export class MerchantApplicationsService {
  constructor(private readonly repository: MerchantApplicationsRepository) {}

  async getMine(userId: string) {
    return this.repository.findMine(userId);
  }

  async submit(userId: string, input: unknown) {
    const parsed = merchantApplicationInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "开店申请参数不合法");
    }
    return this.repository.submitForUser(userId, parsed.data);
  }

  async listForAdmin(query: unknown) {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "申请列表查询参数不合法");
    }
    return this.repository.listForAdmin(parsed.data.status === undefined
      ? { page: parsed.data.page, pageSize: parsed.data.pageSize }
      : { page: parsed.data.page, pageSize: parsed.data.pageSize, status: parsed.data.status }
    );
  }

  async approve(applicationId: string, adminUserId: string, requestId: string) {
    assertNumericId(applicationId);
    return this.repository.approve(applicationId, adminUserId, requestId);
  }

  async reject(applicationId: string, adminUserId: string, requestId: string, input: unknown) {
    assertNumericId(applicationId);
    const parsed = merchantApplicationRejectInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "拒绝原因不合法");
    }
    return this.repository.reject(applicationId, adminUserId, requestId, parsed.data);
  }

  async getOwnerShop(ownerUserId: string) {
    const shop = await this.repository.findOwnerShop(ownerUserId);
    if (shop === null) {
      throw new AppError(404, "NOT_FOUND", "店铺不存在");
    }
    return shop;
  }
}

function assertNumericId(value: string): void {
  if (!/^\d+$/.test(value)) {
    throw new AppError(404, "NOT_FOUND", "开店申请不存在");
  }
}
