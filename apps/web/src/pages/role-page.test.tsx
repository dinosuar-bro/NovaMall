import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiClientError,
  addCartItem,
  checkoutCart,
  confirmShopOrder,
  createAddress,
  fetchCsrf,
  getCart,
  getMyMerchantApplication,
  getOwnerShop,
  getPrivateProfile,
  listAddresses,
  listAuditLogs,
  listAdminCategories,
  listMemberOrders,
  listMemberShopOrders,
  listOwnerProducts,
  listOwnerShopOrders,
  listTopProducts,
  listPublicCategories,
  listPublicProducts,
  listMerchantApplications,
  payOrder,
  createCategory,
  createOwnerProduct,
  rejectMerchantApplication,
  shipShopOrder,
  submitMerchantApplication,
  uploadProductImage
} from "../api/client.js";
import { MemberMerchantApplicationPanel, RolePage } from "./role-page.js";

vi.mock("../api/client.js", () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(readonly code: string, message: string, readonly requestId?: string) {
      super(message);
      this.name = "ApiClientError";
    }
  },
  addCartItem: vi.fn(),
  checkoutCart: vi.fn(),
  confirmShopOrder: vi.fn(),
  createAddress: vi.fn(),
  fetchCsrf: vi.fn(),
  getCart: vi.fn(),
  getMyMerchantApplication: vi.fn(),
  getOwnerShop: vi.fn(),
  getPrivateProfile: vi.fn(),
  listAddresses: vi.fn(),
  listAuditLogs: vi.fn(),
  listAdminCategories: vi.fn(),
  listMemberOrders: vi.fn(),
  listMemberShopOrders: vi.fn(),
  listOwnerProducts: vi.fn(),
  listOwnerShopOrders: vi.fn(),
  listTopProducts: vi.fn(),
  listPublicCategories: vi.fn(),
  listPublicProducts: vi.fn(),
  listMerchantApplications: vi.fn(),
  createCategory: vi.fn(),
  createOwnerProduct: vi.fn(),
  payOrder: vi.fn(),
  publishOwnerProduct: vi.fn(),
  shipShopOrder: vi.fn(),
  submitMerchantApplication: vi.fn(),
  uploadProductImage: vi.fn(),
  approveMerchantApplication: vi.fn(),
  rejectMerchantApplication: vi.fn()
}));

const mockedAddCartItem = vi.mocked(addCartItem);
const mockedCheckoutCart = vi.mocked(checkoutCart);
const mockedConfirmShopOrder = vi.mocked(confirmShopOrder);
const mockedCreateAddress = vi.mocked(createAddress);
const mockedFetchCsrf = vi.mocked(fetchCsrf);
const mockedGetCart = vi.mocked(getCart);
const mockedGetMyMerchantApplication = vi.mocked(getMyMerchantApplication);
const mockedGetOwnerShop = vi.mocked(getOwnerShop);
const mockedGetPrivateProfile = vi.mocked(getPrivateProfile);
const mockedListAddresses = vi.mocked(listAddresses);
const mockedListAuditLogs = vi.mocked(listAuditLogs);
const mockedListAdminCategories = vi.mocked(listAdminCategories);
const mockedListMemberOrders = vi.mocked(listMemberOrders);
const mockedListMemberShopOrders = vi.mocked(listMemberShopOrders);
const mockedListOwnerProducts = vi.mocked(listOwnerProducts);
const mockedListOwnerShopOrders = vi.mocked(listOwnerShopOrders);
const mockedListTopProducts = vi.mocked(listTopProducts);
const mockedListPublicCategories = vi.mocked(listPublicCategories);
const mockedListPublicProducts = vi.mocked(listPublicProducts);
const mockedListMerchantApplications = vi.mocked(listMerchantApplications);
const mockedCreateCategory = vi.mocked(createCategory);
const mockedCreateOwnerProduct = vi.mocked(createOwnerProduct);
const mockedPayOrder = vi.mocked(payOrder);
const mockedShipShopOrder = vi.mocked(shipShopOrder);
const mockedUploadProductImage = vi.mocked(uploadProductImage);
const mockedSubmitMerchantApplication = vi.mocked(submitMerchantApplication);
const mockedRejectMerchantApplication = vi.mocked(rejectMerchantApplication);

describe("RolePage 商户入驻区块", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchCsrf.mockResolvedValue("csrf-token");
    mockedGetPrivateProfile.mockResolvedValue({
      id: "1",
      username: "member01",
      displayName: "会员一",
      phone: "13800138000",
      roles: ["MEMBER"]
    });
    mockedListAddresses.mockResolvedValue([]);
    mockedGetCart.mockResolvedValue({ items: [], totalAmount: "0.00" });
    mockedListPublicCategories.mockResolvedValue([]);
    mockedListPublicProducts.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
    mockedListAdminCategories.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
    mockedListAuditLogs.mockResolvedValue([]);
    mockedListMemberOrders.mockResolvedValue([]);
    mockedListMemberShopOrders.mockResolvedValue([]);
    mockedListOwnerProducts.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
    mockedListOwnerShopOrders.mockResolvedValue([]);
    mockedListTopProducts.mockResolvedValue([]);
    mockedUploadProductImage.mockResolvedValue("/uploads/products/2026/06/test.png");
  });

  afterEach(() => {
    cleanup();
  });

  it("会员无申请时显示开店申请表", async () => {
    mockedGetMyMerchantApplication.mockResolvedValue(null);

    renderMemberApplication();

    expect(await screen.findByRole("heading", { name: "开店申请" })).toBeInTheDocument();
    expect(screen.getByLabelText("店铺名称")).toBeInTheDocument();
    expect(screen.getByLabelText("店铺简介")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交开店申请" })).toBeInTheDocument();
  });

  it("会员页侧边栏只显示会员入口", async () => {
    mockedGetMyMerchantApplication.mockResolvedValue(null);

    renderRole("MEMBER");

    expect(await screen.findByRole("heading", { name: "商品目录" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "会员首页" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "开店申请" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "店主后台" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "管理员后台" })).not.toBeInTheDocument();
  });

  it("会员申请表输入不合法时不发起提交请求", async () => {
    mockedGetMyMerchantApplication.mockResolvedValue(null);

    renderMemberApplication();
    await screen.findByRole("heading", { name: "开店申请" });
    fireEvent.change(screen.getByLabelText("店铺名称"), { target: { value: "星" } });
    fireEvent.change(screen.getByLabelText("店铺简介"), { target: { value: "太短" } });
    fireEvent.click(screen.getByRole("button", { name: "提交开店申请" }));

    expect(mockedSubmitMerchantApplication).not.toHaveBeenCalled();
    expect(screen.getByText("店铺名称至少 2 个字，店铺简介至少 10 个字。")).toBeInTheDocument();
  });

  it("提交失败时展示友好提示而不是 requestId", async () => {
    mockedGetMyMerchantApplication.mockResolvedValue(null);
    mockedSubmitMerchantApplication.mockRejectedValue(new ApiClientError(
      "VALIDATION_ERROR",
      "开店申请参数不合法",
      "request-123"
    ));

    renderMemberApplication();
    await screen.findByRole("heading", { name: "开店申请" });
    fireEvent.change(screen.getByLabelText("店铺名称"), { target: { value: "星选鲜果铺" } });
    fireEvent.change(screen.getByLabelText("店铺简介"), { target: { value: "主营当季水果和社区精选礼盒" } });
    fireEvent.click(screen.getByRole("button", { name: "提交开店申请" }));

    expect(await screen.findByText("提交失败，请检查店铺名称和简介后再试。")).toBeInTheDocument();
    expect(screen.queryByText(/request-123/)).not.toBeInTheDocument();
    expect(screen.queryByText(/开店申请参数不合法/)).not.toBeInTheDocument();
  });

  it("会员待审核时显示状态且不显示重复提交按钮", async () => {
    mockedGetMyMerchantApplication.mockResolvedValue({
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

    renderMemberApplication();

    expect(await screen.findByText("等待管理员审核")).toBeInTheDocument();
    expect(screen.getByText("星选鲜果铺")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "提交开店申请" })).not.toBeInTheDocument();
  });

  it("会员被拒绝后显示原因和重新提交表单", async () => {
    mockedGetMyMerchantApplication.mockResolvedValue({
      id: "13",
      shopName: "星选简餐铺",
      shopDescription: "主营社区工作日简餐和轻食套餐",
      status: "REJECTED",
      rejectReason: "店铺简介需要补充主营品类",
      reviewedBy: "1",
      reviewedAt: "2026-06-23T08:10:00.000Z",
      submittedAt: "2026-06-23T08:00:00.000Z",
      updatedAt: "2026-06-23T08:10:00.000Z"
    });

    renderMemberApplication();

    expect(await screen.findByText("店铺简介需要补充主营品类")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新提交申请" })).toBeInTheDocument();
  });

  it("管理员页面显示待审核申请和审核操作", async () => {
    mockedListMerchantApplications.mockResolvedValue({
      data: [{
        id: "12",
        user: {
          id: "5",
          username: "member01",
          displayName: "会员一"
        },
        shopName: "星选鲜果铺",
        shopDescription: "主营当季水果和社区精选礼盒",
        status: "PENDING",
        rejectReason: null,
        reviewedBy: null,
        reviewedAt: null,
        submittedAt: "2026-06-23T08:00:00.000Z",
        updatedAt: "2026-06-23T08:00:00.000Z"
      }],
      meta: {
        page: 1,
        pageSize: 20,
        total: 1
      }
    });

    renderRole("ADMIN");

    expect(await screen.findByRole("heading", { name: "开店审核" })).toBeInTheDocument();
    expect(screen.getByText("会员一")).toBeInTheDocument();
    expect(screen.getByLabelText("审核状态")).toBeInTheDocument();
    expect(screen.getByLabelText("拒绝原因：星选鲜果铺")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "批准" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "拒绝" })).toBeInTheDocument();
  });

  it("管理员可按状态筛选申请", async () => {
    mockedListMerchantApplications.mockResolvedValue({
      data: [],
      meta: {
        page: 1,
        pageSize: 20,
        total: 0
      }
    });

    renderRole("ADMIN");
    await screen.findByRole("heading", { name: "开店审核" });
    fireEvent.change(screen.getByLabelText("审核状态"), { target: { value: "PENDING" } });

    await waitFor(() => {
      expect(mockedListMerchantApplications).toHaveBeenCalledWith("PENDING");
    });
  });

  it("管理员拒绝申请时提交输入的拒绝原因", async () => {
    mockedListMerchantApplications.mockResolvedValue({
      data: [{
        id: "12",
        user: {
          id: "5",
          username: "member01",
          displayName: "会员一"
        },
        shopName: "星选鲜果铺",
        shopDescription: "主营当季水果和社区精选礼盒",
        status: "PENDING",
        rejectReason: null,
        reviewedBy: null,
        reviewedAt: null,
        submittedAt: "2026-06-23T08:00:00.000Z",
        updatedAt: "2026-06-23T08:00:00.000Z"
      }],
      meta: {
        page: 1,
        pageSize: 20,
        total: 1
      }
    });
    mockedRejectMerchantApplication.mockResolvedValue({
      id: "12",
      shopName: "星选鲜果铺",
      shopDescription: "主营当季水果和社区精选礼盒",
      status: "REJECTED",
      rejectReason: "请补充主营品类和服务范围",
      reviewedBy: "1",
      reviewedAt: "2026-06-23T08:10:00.000Z",
      submittedAt: "2026-06-23T08:00:00.000Z",
      updatedAt: "2026-06-23T08:10:00.000Z"
    });

    renderRole("ADMIN");
    await screen.findByRole("heading", { name: "开店审核" });
    fireEvent.change(screen.getByLabelText("拒绝原因：星选鲜果铺"), {
      target: { value: "请补充主营品类和服务范围" }
    });
    fireEvent.click(screen.getByRole("button", { name: "拒绝" }));

    await waitFor(() => {
      expect(mockedRejectMerchantApplication).toHaveBeenCalledWith(
        "12",
        { reason: "请补充主营品类和服务范围" },
        "csrf-token"
      );
    });
  });

  it("管理员未填写拒绝原因时不提交拒绝请求", async () => {
    mockedListMerchantApplications.mockResolvedValue({
      data: [{
        id: "12",
        user: {
          id: "5",
          username: "member01",
          displayName: "会员一"
        },
        shopName: "星选鲜果铺",
        shopDescription: "主营当季水果和社区精选礼盒",
        status: "PENDING",
        rejectReason: null,
        reviewedBy: null,
        reviewedAt: null,
        submittedAt: "2026-06-23T08:00:00.000Z",
        updatedAt: "2026-06-23T08:00:00.000Z"
      }],
      meta: {
        page: 1,
        pageSize: 20,
        total: 1
      }
    });

    renderRole("ADMIN");
    await screen.findByRole("heading", { name: "开店审核" });
    fireEvent.click(screen.getByRole("button", { name: "拒绝" }));

    expect(mockedRejectMerchantApplication).not.toHaveBeenCalled();
    expect(screen.getByText("拒绝原因至少 2 个字。")).toBeInTheDocument();
  });

  it("管理员页侧边栏只显示管理员入口", async () => {
    mockedListMerchantApplications.mockResolvedValue({
      data: [],
      meta: {
        page: 1,
        pageSize: 20,
        total: 0
      }
    });

    renderRole("ADMIN");

    expect(await screen.findByRole("heading", { name: "开店审核" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "管理员后台" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "会员首页" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "店主后台" })).not.toBeInTheDocument();
  });

  it("店主页面显示已创建店铺摘要", async () => {
    mockedGetOwnerShop.mockResolvedValue({
      id: "3",
      name: "星选烘焙铺",
      description: "主营社区烘焙和礼盒",
      status: "ACTIVE"
    });

    renderRole("OWNER");

    expect(await screen.findByRole("heading", { name: "店铺资料" })).toBeInTheDocument();
    expect(screen.getByText("星选烘焙铺")).toBeInTheDocument();
    expect(screen.getByText("主营社区烘焙和礼盒")).toBeInTheDocument();
  });

  it("会员页面显示商品搜索和公开商品卡片", async () => {
    mockedGetMyMerchantApplication.mockResolvedValue(null);
    mockedListPublicCategories.mockResolvedValue([{
      id: "1",
      name: "新鲜水果",
      description: "当季水果",
      status: "ACTIVE",
      createdAt: "2026-06-24T01:00:00.000Z",
      updatedAt: "2026-06-24T01:00:00.000Z"
    }]);
    mockedListPublicProducts.mockResolvedValue({
      data: [{
        id: "10",
        name: "高山苹果",
        description: "现摘现发，适合家庭分享",
        price: "19.90",
        stock: 20,
        mainImagePath: "/uploads/products/2026/06/apple.png",
        category: { id: "1", name: "新鲜水果" },
        shop: { id: "3", name: "水果公开店" },
        createdAt: "2026-06-24T01:00:00.000Z",
        updatedAt: "2026-06-24T01:00:00.000Z"
      }],
      meta: { page: 1, pageSize: 20, total: 1 }
    });

    renderRole("MEMBER");

    expect(await screen.findByRole("heading", { name: "商品目录" })).toBeInTheDocument();
    expect(screen.getByLabelText("商品关键词")).toBeInTheDocument();
    expect(screen.getByText("高山苹果")).toBeInTheDocument();
    expect(screen.getByText("水果公开店")).toBeInTheDocument();
    expect(screen.getByText("¥19.90")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "高山苹果" })).toHaveAttribute(
      "src",
      "/api/v1/uploads/products/2026/06/apple.png"
    );
  });

  it("会员可从商品卡片加入购物车", async () => {
    mockedGetMyMerchantApplication.mockResolvedValue(null);
    mockedListPublicProducts.mockResolvedValue({
      data: [{
        id: "10",
        name: "高山苹果",
        description: "现摘现发，适合家庭分享",
        price: "19.90",
        stock: 20,
        mainImagePath: "/uploads/products/2026/06/apple.png",
        category: { id: "1", name: "新鲜水果" },
        shop: { id: "3", name: "水果公开店" },
        createdAt: "2026-06-24T01:00:00.000Z",
        updatedAt: "2026-06-24T01:00:00.000Z"
      }],
      meta: { page: 1, pageSize: 20, total: 1 }
    });
    mockedAddCartItem.mockResolvedValue({ items: [], totalAmount: "0.00" });

    renderRole("MEMBER");
    expect(await screen.findByText("高山苹果")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "加入购物车：高山苹果" }));

    await waitFor(() => {
      expect(mockedAddCartItem).toHaveBeenCalledWith({ productId: "10", quantity: 1 }, "csrf-token");
    });
    expect(await screen.findByText("已加入购物车。")).toBeInTheDocument();
  });

  it("会员购物车与订单面板可创建地址、结算、支付和确认收货", async () => {
    mockedGetMyMerchantApplication.mockResolvedValue(null);
    mockedListAddresses.mockResolvedValue([{
      id: "1",
      receiverName: "张三",
      maskedPhone: "139****0000",
      province: "广东省",
      city: "深圳市",
      district: "南山区",
      detail: "科技园 1 号",
      isDefault: true,
      createdAt: "2026-06-24T01:00:00.000Z",
      updatedAt: "2026-06-24T01:00:00.000Z"
    }]);
    mockedGetCart.mockResolvedValue({
      items: [{
        id: "8",
        productId: "10",
        productName: "高山苹果",
        shopId: "3",
        shopName: "水果公开店",
        unitPrice: "19.90",
        quantity: 2,
        lineAmount: "39.80",
        stock: 20,
        mainImagePath: null,
        available: true
      }],
      totalAmount: "39.80"
    });
    mockedListMemberOrders.mockResolvedValue([{
      orderNo: "MO6f5a1954726111f193440afda4b47e66",
      status: "PENDING_PAYMENT",
      totalAmount: "39.80",
      shopOrderCount: 1,
      createdAt: "2026-06-24T01:00:00.000Z"
    }]);
    mockedListMemberShopOrders.mockResolvedValue([{
      shopOrderNo: "SO6f5a251a726111f193440afda4b47e66",
      masterOrderNo: "MO6f5a1954726111f193440afda4b47e66",
      status: "SHIPPED",
      subtotalAmount: "39.80",
      itemCount: 2,
      createdAt: "2026-06-24T01:00:00.000Z"
    }]);
    mockedCreateAddress.mockResolvedValue({
      id: "2",
      receiverName: "李四",
      maskedPhone: "138****0000",
      province: "广东省",
      city: "深圳市",
      district: "南山区",
      detail: "软件园 2 号",
      isDefault: true,
      createdAt: "2026-06-24T01:00:00.000Z",
      updatedAt: "2026-06-24T01:00:00.000Z"
    });
    mockedCheckoutCart.mockResolvedValue({ orderNo: "MO6f5a1954726111f193440afda4b47e66" });
    mockedPayOrder.mockResolvedValue({
      orderNo: "MO6f5a1954726111f193440afda4b47e66",
      status: "PAID",
      totalAmount: "39.80",
      shopOrderCount: 1,
      createdAt: "2026-06-24T01:00:00.000Z"
    });
    mockedConfirmShopOrder.mockResolvedValue({
      shopOrderNo: "SO6f5a251a726111f193440afda4b47e66",
      masterOrderNo: "MO6f5a1954726111f193440afda4b47e66",
      status: "COMPLETED",
      subtotalAmount: "39.80",
      itemCount: 2,
      createdAt: "2026-06-24T01:00:00.000Z"
    });

    renderRole("MEMBER");
    expect(await screen.findByRole("heading", { name: "购物车与订单" })).toBeInTheDocument();
    expect(screen.getByLabelText("收货手机号")).toHaveValue("13800138000");
    expect(screen.getByLabelText("省份").tagName).toBe("SELECT");
    expect(screen.getByLabelText("城市").tagName).toBe("SELECT");
    expect(screen.getByLabelText("区县").tagName).toBe("SELECT");
    fireEvent.change(screen.getByLabelText("省份"), { target: { value: "新疆维吾尔自治区" } });
    expect(screen.getByLabelText("城市")).toHaveValue("乌鲁木齐市");
    expect(screen.getByLabelText("区县")).toHaveValue("天山区");
    fireEvent.change(screen.getByLabelText("收货人"), { target: { value: "李四" } });
    fireEvent.change(screen.getByLabelText("收货手机号"), { target: { value: "13800000000" } });
    fireEvent.change(screen.getByLabelText("省份"), { target: { value: "广东省" } });
    fireEvent.change(screen.getByLabelText("城市"), { target: { value: "深圳市" } });
    fireEvent.change(screen.getByLabelText("区县"), { target: { value: "南山区" } });
    fireEvent.change(screen.getByLabelText("详细地址"), { target: { value: "软件园 2 号" } });
    fireEvent.click(screen.getByRole("button", { name: "保存地址" }));
    await waitFor(() => {
      expect(mockedCreateAddress).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole("button", { name: "提交结算" }));
    await waitFor(() => {
      expect(mockedCheckoutCart).toHaveBeenCalledWith(expect.objectContaining({ addressId: "2" }), "csrf-token");
    });
    fireEvent.click(screen.getByRole("button", { name: "去支付" }));
    await waitFor(() => {
      expect(mockedPayOrder).toHaveBeenCalledWith("MO6f5a1954726111f193440afda4b47e66", "csrf-token");
    });
    expect(screen.getByText("主订单 B47E66")).toBeInTheDocument();
    expect(screen.getByText("子订单 B47E66")).toBeInTheDocument();
    expect(screen.queryByText("MO6f5a1954726111f193440afda4b47e66")).not.toBeInTheDocument();
    expect(screen.queryByText("SO6f5a251a726111f193440afda4b47e66")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认收货" }));

    await waitFor(() => {
      expect(mockedConfirmShopOrder).toHaveBeenCalledWith("SO6f5a251a726111f193440afda4b47e66", "csrf-token");
    });
  });

  it("公开商品图片加载失败时显示统一占位图", async () => {
    mockedGetMyMerchantApplication.mockResolvedValue(null);
    mockedListPublicProducts.mockResolvedValue({
      data: [{
        id: "10",
        name: "高山苹果",
        description: "现摘现发，适合家庭分享",
        price: "19.90",
        stock: 20,
        mainImagePath: "/uploads/products/2026/06/missing.png",
        category: { id: "1", name: "新鲜水果" },
        shop: { id: "3", name: "水果公开店" },
        createdAt: "2026-06-24T01:00:00.000Z",
        updatedAt: "2026-06-24T01:00:00.000Z"
      }],
      meta: { page: 1, pageSize: 20, total: 1 }
    });

    renderRole("MEMBER");
    const image = await screen.findByRole("img", { name: "高山苹果" });
    fireEvent.error(image);

    expect(image).toHaveAttribute("src", "/product-placeholder.png");
  });

  it("公开商品图片尺寸过小时显示统一占位图", async () => {
    mockedGetMyMerchantApplication.mockResolvedValue(null);
    mockedListPublicProducts.mockResolvedValue({
      data: [{
        id: "10",
        name: "高山苹果",
        description: "现摘现发，适合家庭分享",
        price: "19.90",
        stock: 20,
        mainImagePath: "/uploads/products/2026/06/tiny.png",
        category: { id: "1", name: "新鲜水果" },
        shop: { id: "3", name: "水果公开店" },
        createdAt: "2026-06-24T01:00:00.000Z",
        updatedAt: "2026-06-24T01:00:00.000Z"
      }],
      meta: { page: 1, pageSize: 20, total: 1 }
    });

    renderRole("MEMBER");
    const image = await screen.findByRole("img", { name: "高山苹果" });
    Object.defineProperty(image, "complete", { configurable: true, value: true });
    Object.defineProperty(image, "naturalWidth", { configurable: true, value: 1 });
    Object.defineProperty(image, "naturalHeight", { configurable: true, value: 1 });
    fireEvent.load(image);

    expect(image).toHaveAttribute("src", "/product-placeholder.png");
  });


  it("管理员页面可创建分类", async () => {
    mockedListMerchantApplications.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
    mockedCreateCategory.mockResolvedValue({
      id: "1",
      name: "新鲜水果",
      description: "当季水果",
      status: "ACTIVE",
      createdAt: "2026-06-24T01:00:00.000Z",
      updatedAt: "2026-06-24T01:00:00.000Z"
    });

    renderRole("ADMIN");
    expect(await screen.findByRole("heading", { name: "分类管理" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("分类名称"), { target: { value: "新鲜水果" } });
    fireEvent.change(screen.getByLabelText("分类简介"), { target: { value: "当季水果与社区精选" } });
    fireEvent.click(screen.getByRole("button", { name: "创建分类" }));

    await waitFor(() => {
      expect(mockedCreateCategory).toHaveBeenCalledWith({
        name: "新鲜水果",
        description: "当季水果与社区精选"
      }, "csrf-token");
    });
  });

  it("店主页面可创建草稿商品", async () => {
    mockedGetOwnerShop.mockResolvedValue({
      id: "3",
      name: "星选烘焙铺",
      description: "主营社区烘焙和礼盒",
      status: "ACTIVE"
    });
    mockedListPublicCategories.mockResolvedValue([{
      id: "1",
      name: "新鲜水果",
      description: "当季水果",
      status: "ACTIVE",
      createdAt: "2026-06-24T01:00:00.000Z",
      updatedAt: "2026-06-24T01:00:00.000Z"
    }]);
    mockedCreateOwnerProduct.mockResolvedValue({
      id: "10",
      shopId: "3",
      categoryId: "1",
      categoryName: "新鲜水果",
      name: "高山苹果",
      description: "现摘现发，适合家庭分享",
      price: "19.90",
      stock: 20,
      mainImagePath: null,
      status: "DRAFT",
      version: 1,
      createdAt: "2026-06-24T01:00:00.000Z",
      updatedAt: "2026-06-24T01:00:00.000Z"
    });

    renderRole("OWNER");
    expect(await screen.findByRole("heading", { name: "商品管理" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("商品名称"), { target: { value: "高山苹果" } });
    fireEvent.change(screen.getByLabelText("商品简介"), { target: { value: "现摘现发，适合家庭分享" } });
    fireEvent.change(screen.getByLabelText("商品价格"), { target: { value: "19.90" } });
    fireEvent.change(screen.getByLabelText("商品库存"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "创建草稿商品" }));

    await waitFor(() => {
      expect(mockedCreateOwnerProduct).toHaveBeenCalledWith({
        categoryId: "1",
        name: "高山苹果",
        description: "现摘现发，适合家庭分享",
        price: "19.90",
        stock: 20,
        mainImagePath: null
      }, "csrf-token");
    });
  });

  it("店主订单履约面板只对待发货子订单显示发货按钮", async () => {
    mockedGetOwnerShop.mockResolvedValue({
      id: "3",
      name: "星选烘焙铺",
      description: "主营社区烘焙和礼盒",
      status: "ACTIVE"
    });
    mockedListOwnerShopOrders.mockResolvedValue([
      {
        shopOrderNo: "SO202606280001",
        masterOrderNo: "MO202606280001",
        status: "PENDING_SHIPMENT",
        subtotalAmount: "39.80",
        itemCount: 2,
        createdAt: "2026-06-24T01:00:00.000Z"
      },
      {
        shopOrderNo: "SO202606280002",
        masterOrderNo: "MO202606280002",
        status: "SHIPPED",
        subtotalAmount: "19.90",
        itemCount: 1,
        createdAt: "2026-06-24T01:00:00.000Z"
      }
    ]);
    mockedShipShopOrder.mockResolvedValue({
      shopOrderNo: "SO202606280001",
      masterOrderNo: "MO202606280001",
      status: "SHIPPED",
      subtotalAmount: "39.80",
      itemCount: 2,
      createdAt: "2026-06-24T01:00:00.000Z"
    });

    renderRole("OWNER");
    expect(await screen.findByRole("heading", { name: "订单履约" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "标记发货" })).toBeInTheDocument();
    expect(screen.getByText("子订单 280002")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "标记发货" }));

    await waitFor(() => {
      expect(mockedShipShopOrder).toHaveBeenCalledWith("SO202606280001", "csrf-token");
    });
  });

  it("管理员数据库证据面板只读展示审计日志和 Top 10", async () => {
    mockedListMerchantApplications.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
    mockedListAuditLogs.mockResolvedValue([{
      id: "1",
      actorUserId: "2",
      requestId: "req-1",
      tableName: "shop_orders",
      recordId: "5",
      action: "STATUS_CHANGE",
      createdAt: "2026-06-24T01:00:00.000Z"
    }]);
    mockedListTopProducts.mockResolvedValue([{
      productId: "10",
      productName: "高山苹果",
      soldQuantity: 8,
      salesAmount: "159.20",
      salesRank: 1
    }]);

    renderRole("ADMIN");

    expect(await screen.findByRole("heading", { name: "数据库证据总览" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "审计日志" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "有效销量 Top 10" })).toBeInTheDocument();
    expect(screen.getByText("shop_orders")).toBeInTheDocument();
    expect(screen.getByText("高山苹果")).toBeInTheDocument();
    expect(screen.queryByLabelText(/SQL/i)).not.toBeInTheDocument();
  });
});

function renderRole(role: "MEMBER" | "OWNER" | "ADMIN", csrfToken = "csrf-token"): void {
  render(
    <MemoryRouter>
      <RolePage role={role} csrfToken={csrfToken} />
    </MemoryRouter>
  );
}

function renderMemberApplication(): void {
  render(
    <MemoryRouter>
      <MemberMerchantApplicationPanel />
    </MemoryRouter>
  );
}
