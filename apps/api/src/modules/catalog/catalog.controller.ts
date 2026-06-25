import type { Request, RequestHandler } from "express";
import formidable, { type File } from "formidable";

import { AppError } from "../../errors/app-error.js";
import type { CatalogService, UploadedFileInput } from "./catalog.service.js";

export class CatalogController {
  constructor(private readonly service: CatalogService) {}

  listPublicCategories: RequestHandler = async (_request, response, next) => {
    try {
      response.json({ success: true, data: await this.service.listPublicCategories() });
    } catch (error) {
      next(error);
    }
  };

  listPublicProducts: RequestHandler = async (request, response, next) => {
    try {
      const result = await this.service.listPublicProducts(request.query);
      response.json({ success: true, data: result.data, meta: result.meta });
    } catch (error) {
      next(error);
    }
  };

  getPublicProduct: RequestHandler = async (request, response, next) => {
    try {
      response.json({ success: true, data: await this.service.getPublicProduct(pathParam(request.params.productId)) });
    } catch (error) {
      next(error);
    }
  };

  listCategoriesForAdmin: RequestHandler = async (request, response, next) => {
    try {
      const result = await this.service.listCategoriesForAdmin(request.query);
      response.json({ success: true, data: result.data, meta: result.meta });
    } catch (error) {
      next(error);
    }
  };

  createCategory: RequestHandler = async (request, response, next) => {
    try {
      response.json({ success: true, data: await this.service.createCategory(request.body) });
    } catch (error) {
      next(error);
    }
  };

  updateCategory: RequestHandler = async (request, response, next) => {
    try {
      response.json({
        success: true,
        data: await this.service.updateCategory(pathParam(request.params.id), request.body)
      });
    } catch (error) {
      next(error);
    }
  };

  enableCategory: RequestHandler = async (request, response, next) => {
    try {
      response.json({ success: true, data: await this.service.enableCategory(pathParam(request.params.id)) });
    } catch (error) {
      next(error);
    }
  };

  disableCategory: RequestHandler = async (request, response, next) => {
    try {
      response.json({ success: true, data: await this.service.disableCategory(pathParam(request.params.id)) });
    } catch (error) {
      next(error);
    }
  };

  listOwnerProducts: RequestHandler = async (request, response, next) => {
    try {
      const result = await this.service.listOwnerProducts(currentUserId(request), request.query);
      response.json({ success: true, data: result.data, meta: result.meta });
    } catch (error) {
      next(error);
    }
  };

  createOwnerProduct: RequestHandler = async (request, response, next) => {
    try {
      response.json({ success: true, data: await this.service.createOwnerProduct(currentUserId(request), request.body) });
    } catch (error) {
      next(error);
    }
  };

  getOwnerProduct: RequestHandler = async (request, response, next) => {
    try {
      response.json({
        success: true,
        data: await this.service.getOwnerProduct(currentUserId(request), pathParam(request.params.productId))
      });
    } catch (error) {
      next(error);
    }
  };

  updateOwnerProduct: RequestHandler = async (request, response, next) => {
    try {
      response.json({
        success: true,
        data: await this.service.updateOwnerProduct(
          currentUserId(request),
          pathParam(request.params.productId),
          request.body,
          request.requestId
        )
      });
    } catch (error) {
      next(error);
    }
  };

  setOwnerProductStock: RequestHandler = async (request, response, next) => {
    try {
      response.json({
        success: true,
        data: await this.service.setOwnerProductStock(
          currentUserId(request),
          pathParam(request.params.productId),
          request.body,
          request.requestId
        )
      });
    } catch (error) {
      next(error);
    }
  };

  publishOwnerProduct: RequestHandler = async (request, response, next) => {
    try {
      response.json({
        success: true,
        data: await this.service.publishOwnerProduct(currentUserId(request), pathParam(request.params.productId), request.requestId)
      });
    } catch (error) {
      next(error);
    }
  };

  unpublishOwnerProduct: RequestHandler = async (request, response, next) => {
    try {
      response.json({
        success: true,
        data: await this.service.unpublishOwnerProduct(currentUserId(request), pathParam(request.params.productId), request.requestId)
      });
    } catch (error) {
      next(error);
    }
  };

  archiveOwnerProduct: RequestHandler = async (request, response, next) => {
    try {
      response.json({
        success: true,
        data: await this.service.archiveOwnerProduct(currentUserId(request), pathParam(request.params.productId), request.requestId)
      });
    } catch (error) {
      next(error);
    }
  };

  listPriceHistory: RequestHandler = async (request, response, next) => {
    try {
      response.json({
        success: true,
        data: await this.service.listPriceHistory(currentUserId(request), pathParam(request.params.productId))
      });
    } catch (error) {
      next(error);
    }
  };

  uploadProductImage: RequestHandler = async (request, response, next) => {
    try {
      const file = await parseImageFile(request);
      response.json({ success: true, data: await this.service.uploadProductImage(file) });
    } catch (error) {
      next(error);
    }
  };
}

async function parseImageFile(request: Request): Promise<UploadedFileInput | null> {
  const form = formidable({
    maxFileSize: 2 * 1024 * 1024,
    multiples: false,
    allowEmptyFiles: false
  });
  try {
    const [, files] = await form.parse(request);
    const image = firstFile(files.image);
    return image === null
      ? null
      : {
          filepath: image.filepath,
          mimetype: image.mimetype,
          originalFilename: image.originalFilename,
          size: image.size
        };
  } catch (error) {
    if (isFormidableSizeError(error)) {
      throw new AppError(400, "IMAGE_TOO_LARGE", "上传图片超过大小限制");
    }
    throw error;
  }
}

function firstFile(value: File | File[] | undefined): File | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function isFormidableSizeError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error.code === 1009 || error.code === "ETOOBIG");
}

function currentUserId(request: Parameters<RequestHandler>[0]): string {
  const userId = request.currentUser?.id;
  if (userId === undefined) {
    throw new AppError(401, "AUTH_REQUIRED", "请先登录");
  }
  return userId;
}

function pathParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}
