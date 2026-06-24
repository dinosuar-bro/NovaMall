import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiClientError,
  fetchCsrf,
  getMyMerchantApplication,
  getOwnerShop,
  listMerchantApplications,
  rejectMerchantApplication,
  submitMerchantApplication
} from "../api/client.js";
import { RolePage } from "./role-page.js";

vi.mock("../api/client.js", () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(readonly code: string, message: string, readonly requestId?: string) {
      super(message);
      this.name = "ApiClientError";
    }
  },
  fetchCsrf: vi.fn(),
  getMyMerchantApplication: vi.fn(),
  getOwnerShop: vi.fn(),
  listMerchantApplications: vi.fn(),
  submitMerchantApplication: vi.fn(),
  approveMerchantApplication: vi.fn(),
  rejectMerchantApplication: vi.fn()
}));

const mockedFetchCsrf = vi.mocked(fetchCsrf);
const mockedGetMyMerchantApplication = vi.mocked(getMyMerchantApplication);
const mockedGetOwnerShop = vi.mocked(getOwnerShop);
const mockedListMerchantApplications = vi.mocked(listMerchantApplications);
const mockedSubmitMerchantApplication = vi.mocked(submitMerchantApplication);
const mockedRejectMerchantApplication = vi.mocked(rejectMerchantApplication);

describe("RolePage 商户入驻区块", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchCsrf.mockResolvedValue("csrf-token");
  });

  afterEach(() => {
    cleanup();
  });

  it("会员无申请时显示开店申请表", async () => {
    mockedGetMyMerchantApplication.mockResolvedValue(null);

    renderRole("MEMBER");

    expect(await screen.findByRole("heading", { name: "开店申请" })).toBeInTheDocument();
    expect(screen.getByLabelText("店铺名称")).toBeInTheDocument();
    expect(screen.getByLabelText("店铺简介")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交开店申请" })).toBeInTheDocument();
  });

  it("会员页侧边栏只显示会员入口", async () => {
    mockedGetMyMerchantApplication.mockResolvedValue(null);

    renderRole("MEMBER");

    expect(await screen.findByRole("heading", { name: "开店申请" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "会员首页" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "店主后台" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "管理员后台" })).not.toBeInTheDocument();
  });

  it("会员申请表输入不合法时不发起提交请求", async () => {
    mockedGetMyMerchantApplication.mockResolvedValue(null);

    renderRole("MEMBER");
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

    renderRole("MEMBER");
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

    renderRole("MEMBER");

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

    renderRole("MEMBER");

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
});

function renderRole(role: "MEMBER" | "OWNER" | "ADMIN"): void {
  render(
    <MemoryRouter>
      <RolePage role={role} />
    </MemoryRouter>
  );
}
