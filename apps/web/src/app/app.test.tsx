import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiClientError,
  fetchCsrf,
  getCart,
  getCurrentSession,
  getMyMerchantApplication,
  getPrivateProfile,
  getOwnerShop,
  listAddresses,
  listAuditLogs,
  listMemberOrders,
  listMemberShopOrders,
  listOwnerShopOrders,
  listTopProducts,
  listPublicCategories,
  listPublicProducts,
  login,
  logout,
  register,
  updatePrivateProfile
} from "../api/client.js";
import { App } from "./app.js";

vi.mock("../api/client.js", () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(readonly code: string, message: string, readonly requestId?: string) {
      super(message);
      this.name = "ApiClientError";
    }
  },
  fetchCsrf: vi.fn(),
  getCart: vi.fn(),
  getCurrentSession: vi.fn(),
  getMyMerchantApplication: vi.fn(),
  getPrivateProfile: vi.fn(),
  getOwnerShop: vi.fn(),
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
  addCartItem: vi.fn(),
  checkoutCart: vi.fn(),
  confirmShopOrder: vi.fn(),
  createAddress: vi.fn(),
  createCategory: vi.fn(),
  createOwnerProduct: vi.fn(),
  payOrder: vi.fn(),
  publishOwnerProduct: vi.fn(),
  shipShopOrder: vi.fn(),
  uploadProductImage: vi.fn(),
  listMerchantApplications: vi.fn(),
  submitMerchantApplication: vi.fn(),
  approveMerchantApplication: vi.fn(),
  rejectMerchantApplication: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  updatePrivateProfile: vi.fn()
}));

const mockedFetchCsrf = vi.mocked(fetchCsrf);
const mockedGetCart = vi.mocked(getCart);
const mockedGetCurrentSession = vi.mocked(getCurrentSession);
const mockedGetMyMerchantApplication = vi.mocked(getMyMerchantApplication);
const mockedGetOwnerShop = vi.mocked(getOwnerShop);
const mockedGetPrivateProfile = vi.mocked(getPrivateProfile);
const mockedListAddresses = vi.mocked(listAddresses);
const mockedListAuditLogs = vi.mocked(listAuditLogs);
const mockedListMemberOrders = vi.mocked(listMemberOrders);
const mockedListMemberShopOrders = vi.mocked(listMemberShopOrders);
const mockedListOwnerShopOrders = vi.mocked(listOwnerShopOrders);
const mockedListTopProducts = vi.mocked(listTopProducts);
const mockedListPublicCategories = vi.mocked(listPublicCategories);
const mockedListPublicProducts = vi.mocked(listPublicProducts);
const mockedLogin = vi.mocked(login);
const mockedLogout = vi.mocked(logout);
const mockedRegister = vi.mocked(register);
const mockedUpdatePrivateProfile = vi.mocked(updatePrivateProfile);

describe("App 路由守卫", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchCsrf.mockResolvedValue("csrf-token");
    mockedGetCart.mockResolvedValue({ items: [], totalAmount: "0.00" });
    mockedGetMyMerchantApplication.mockResolvedValue(null);
    mockedGetOwnerShop.mockResolvedValue({
      id: "3",
      name: "星选烘焙铺",
      description: "主营社区烘焙和礼盒",
      status: "ACTIVE"
    });
    mockedGetPrivateProfile.mockResolvedValue({
      id: "1",
      username: "member01",
      displayName: "会员一",
      phone: "13800138000",
      roles: ["MEMBER"]
    });
    mockedListAddresses.mockResolvedValue([]);
    mockedListAuditLogs.mockResolvedValue([]);
    mockedListMemberOrders.mockResolvedValue([]);
    mockedListMemberShopOrders.mockResolvedValue([]);
    mockedListOwnerShopOrders.mockResolvedValue([]);
    mockedListTopProducts.mockResolvedValue([]);
    mockedListPublicCategories.mockResolvedValue([]);
    mockedListPublicProducts.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
  });

  afterEach(() => {
    cleanup();
  });

  it("已登录会员访问根路径时进入会员首页", async () => {
    mockedGetCurrentSession.mockResolvedValue({
      user: {
        id: "1",
        username: "member01",
        displayName: "会员一",
        roles: ["MEMBER"]
      },
      csrfToken: "csrf-token"
    });

    renderApp("/");

    expect(await screen.findByRole("heading", { level: 2, name: "商品目录" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "登录星选" })).not.toBeInTheDocument();
  });

  it("未登录访问会员页时回到登录页且不读取开店申请", async () => {
    mockedGetCurrentSession.mockRejectedValue(new Error("未登录"));

    renderApp("/member/applications");

    expect(await screen.findByRole("heading", { name: "登录星选" })).toBeInTheDocument();
    expect(mockedGetMyMerchantApplication).not.toHaveBeenCalled();
  });

  it("登录失败时不展示后端原始错误和请求编号", async () => {
    mockedLogin.mockRejectedValue(new ApiClientError("INVALID_CREDENTIALS", "认证失败", "request-456"));

    renderApp("/login");
    await screen.findByText("安全会话已准备好。");
    fireFormInput("用户名", "member01");
    fireFormInput("密码", "wrong-password");
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("用户名或密码不正确。")).toBeInTheDocument();
    expect(screen.queryByText(/request-456/)).not.toBeInTheDocument();
    expect(screen.queryByText(/认证失败/)).not.toBeInTheDocument();
  });

  it("注册失败时不展示后端原始错误和请求编号", async () => {
    mockedRegister.mockRejectedValue(new ApiClientError("USERNAME_TAKEN", "用户名已存在", "request-789"));

    renderApp("/register");
    await screen.findByText("安全会话已准备好。");
    fireFormInput("用户名", "member01");
    fireFormInput("手机号", "13800138000");
    fireFormInput("密码", "Password123");
    fireFormInput("确认密码", "Password123");
    fireEvent.click(screen.getByRole("button", { name: "注册并进入会员首页" }));

    expect(await screen.findByText("用户名已被占用，请换一个再试。")).toBeInTheDocument();
    expect(screen.queryByText(/request-789/)).not.toBeInTheDocument();
    expect(screen.queryByText(/用户名已存在/)).not.toBeInTheDocument();
  });

  it("注册页在服务端返回用户名重复文案时不退回通用失败提示", async () => {
    mockedRegister.mockRejectedValue(new ApiClientError("INTERNAL_ERROR", "用户名已被使用", "request-789"));

    renderApp("/register");
    await screen.findByText("安全会话已准备好。");
    fireFormInput("用户名", "member01");
    fireFormInput("手机号", "13800138000");
    fireFormInput("密码", "Password123");
    fireFormInput("确认密码", "Password123");
    fireEvent.click(screen.getByRole("button", { name: "注册并进入会员首页" }));

    expect(await screen.findByText("用户名已被占用，请换一个再试。")).toBeInTheDocument();
    expect(screen.queryByText("注册失败，请稍后重试。")).not.toBeInTheDocument();
    expect(screen.queryByText(/request-789/)).not.toBeInTheDocument();
  });

  it("注册页在手机号格式错误时立即标红并阻止提交", async () => {
    renderApp("/register");
    await screen.findByText("安全会话已准备好。");
    const phoneInput = screen.getByLabelText("手机号");

    fireFormInput("用户名", "test123");
    fireEvent.change(phoneInput, { target: { value: "12312341234" } });
    fireFormInput("密码", "Password123");
    fireFormInput("确认密码", "Password123");
    const registerButton = screen.getByRole("button", { name: "注册并进入会员首页" });

    expect(phoneInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("请输入 1 开头的 11 位有效手机号。")).toHaveClass("field-error");
    expect(registerButton).toBeDisabled();
    fireEvent.click(registerButton);
    expect(mockedRegister).not.toHaveBeenCalled();
    expect(screen.queryByText("注册失败，请稍后重试。")).not.toBeInTheDocument();
  });

  it("注册页不要求展示名，提交时只发送账号、手机号和密码", async () => {
    mockedRegister.mockResolvedValue({
      user: {
        id: "1",
        username: "member01",
        displayName: "新会员123456",
        roles: ["MEMBER"]
      },
      csrfToken: "rotated-token"
    });

    renderApp("/register");
    await screen.findByText("安全会话已准备好。");
    expect(screen.queryByLabelText("展示名")).not.toBeInTheDocument();
    fireFormInput("用户名", "member01");
    fireFormInput("手机号", "13800138000");
    fireFormInput("密码", "Password123");
    fireFormInput("确认密码", "Password123");
    fireEvent.click(screen.getByRole("button", { name: "注册并进入会员首页" }));

    await waitFor(() => {
      expect(mockedRegister).toHaveBeenCalledWith({
        username: "member01",
        phone: "13800138000",
        password: "Password123"
      }, "csrf-token");
    });
  });

  it("注册提交前会去除用户名和手机号两端空白", async () => {
    mockedRegister.mockResolvedValue({
      user: {
        id: "1",
        username: "member01",
        displayName: "新会员123456",
        roles: ["MEMBER"]
      },
      csrfToken: "rotated-token"
    });

    renderApp("/register");
    await screen.findByText("安全会话已准备好。");
    fireFormInput("用户名", " member01 ");
    fireFormInput("手机号", " 13800138000 ");
    fireFormInput("密码", "Password123");
    fireFormInput("确认密码", "Password123");
    fireEvent.click(screen.getByRole("button", { name: "注册并进入会员首页" }));

    await waitFor(() => {
      expect(mockedRegister).toHaveBeenCalledWith({
        username: "member01",
        phone: "13800138000",
        password: "Password123"
      }, "csrf-token");
    });
  });

  it("注册成功后进入会员商品目录", async () => {
    mockedRegister.mockResolvedValue({
      user: {
        id: "1",
        username: "member01",
        displayName: "新会员123456",
        roles: ["MEMBER"]
      },
      csrfToken: "rotated-token"
    });
    mockedGetCurrentSession.mockResolvedValue({
      user: {
        id: "1",
        username: "member01",
        displayName: "新会员123456",
        roles: ["MEMBER"]
      },
      csrfToken: "rotated-token"
    });

    renderApp("/register");
    await screen.findByText("安全会话已准备好。");
    fireFormInput("用户名", "member01");
    fireFormInput("手机号", "13800138000");
    fireFormInput("密码", "Password123");
    fireFormInput("确认密码", "Password123");
    fireEvent.click(screen.getByRole("button", { name: "注册并进入会员首页" }));

    expect(await screen.findByRole("heading", { level: 2, name: "商品目录" })).toBeInTheDocument();
  });

  it("注册页要求两次密码一致且密码包含大小写和数字", async () => {
    renderApp("/register");
    await screen.findByText("安全会话已准备好。");
    fireFormInput("用户名", "member01");
    fireFormInput("手机号", "13800138000");
    fireFormInput("密码", "password");
    fireFormInput("确认密码", "Password123");
    fireEvent.click(screen.getByRole("button", { name: "注册并进入会员首页" }));

    expect(mockedRegister).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("两次输入的密码不一致。");

    fireFormInput("确认密码", "password");
    fireEvent.click(screen.getByRole("button", { name: "注册并进入会员首页" }));

    expect(mockedRegister).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("密码至少 8 位，并包含英文大写、小写和数字。");
  });

  it("注册页第一遍密码输入结束后立即标红提示弱密码", async () => {
    renderApp("/register");
    await screen.findByText("安全会话已准备好。");
    const passwordInput = screen.getByLabelText("密码");

    fireEvent.change(passwordInput, { target: { value: "password" } });
    fireEvent.blur(passwordInput);

    expect(passwordInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("密码至少 8 位，并包含英文大写、小写和数字。")).toHaveClass("field-error");

    fireEvent.change(passwordInput, { target: { value: "Password123" } });

    expect(passwordInput).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByText("密码至少 8 位，并包含英文大写、小写和数字。")).not.toBeInTheDocument();
  });

  it("注册页确认密码输入结束后立即标红提示两次密码不同", async () => {
    renderApp("/register");
    await screen.findByText("安全会话已准备好。");
    const confirmedPasswordInput = screen.getByLabelText("确认密码");

    fireFormInput("密码", "Password123");
    fireEvent.change(confirmedPasswordInput, { target: { value: "Password456" } });
    fireEvent.blur(confirmedPasswordInput);

    expect(confirmedPasswordInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("两次输入的密码不一致。")).toHaveClass("field-error");

    fireEvent.change(confirmedPasswordInput, { target: { value: "Password123" } });

    expect(confirmedPasswordInput).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByText("两次输入的密码不一致。")).not.toBeInTheDocument();
  });

  it("会员开店申请入口在头像菜单中，不出现在左侧导航", async () => {
    mockedGetCurrentSession.mockResolvedValue({
      user: {
        id: "1",
        username: "member01",
        displayName: "会员一",
        roles: ["MEMBER"]
      },
      csrfToken: "csrf-token"
    });

    renderApp("/member/catalog");
    expect(await screen.findByRole("heading", { level: 2, name: "商品目录" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "开店申请" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "会员一" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "申请开店" }));

    expect(await screen.findByRole("heading", { level: 2, name: "开店申请" })).toBeInTheDocument();
  });

  it("会员侧边栏可分别进入购物车和订单列表", async () => {
    mockedGetCurrentSession.mockResolvedValue({
      user: {
        id: "1",
        username: "member01",
        displayName: "会员一",
        roles: ["MEMBER"]
      },
      csrfToken: "csrf-token"
    });

    renderApp("/member/catalog");
    expect(await screen.findByRole("heading", { level: 2, name: "商品目录" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "购物车" }));

    expect(await screen.findByRole("heading", { level: 2, name: "购物车" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "订单列表" }));

    expect(await screen.findByRole("heading", { level: 2, name: "订单列表" })).toBeInTheDocument();
  });

  it("店主和管理员侧边栏包含阶段 5 演示入口", async () => {
    mockedGetCurrentSession.mockResolvedValueOnce({
      user: {
        id: "2",
        username: "owner01",
        displayName: "店主一",
        roles: ["MEMBER", "OWNER"]
      },
      csrfToken: "csrf-token"
    });
    renderApp("/owner/products");
    expect(await screen.findByRole("link", { name: "订单履约" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "店铺资料" })).not.toBeInTheDocument();

    cleanup();
    mockedGetCurrentSession.mockResolvedValueOnce({
      user: {
        id: "3",
        username: "admin01",
        displayName: "管理员",
        roles: ["ADMIN"]
      },
      csrfToken: "csrf-token"
    });
    renderApp("/admin/categories");
    expect(await screen.findByRole("link", { name: "数据库证据" })).toBeInTheDocument();
  });

  it("头像菜单提供个人主页、会员申请入口和退出登录", async () => {
    mockedGetCurrentSession.mockResolvedValue({
      user: {
        id: "1",
        username: "member01",
        displayName: "会员一",
        roles: ["MEMBER"]
      },
      csrfToken: "csrf-token"
    });
    mockedLogout.mockResolvedValue(undefined);

    renderApp("/member/catalog");
    expect(await screen.findByRole("heading", { level: 2, name: "商品目录" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "会员一" }));
    expect(screen.getByRole("menuitem", { name: "个人主页" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "退出登录" }));

    await waitFor(() => {
      expect(mockedLogout).toHaveBeenCalledWith("csrf-token");
    });
    expect(await screen.findByRole("heading", { name: "登录星选" })).toBeInTheDocument();
  });

  it("个人主页可以修改展示名、手机号和密码", async () => {
    mockedGetCurrentSession.mockResolvedValue({
      user: {
        id: "1",
        username: "member01",
        displayName: "会员一",
        roles: ["MEMBER"]
      },
      csrfToken: "csrf-token"
    });
    mockedGetPrivateProfile.mockResolvedValue({
      id: "1",
      username: "member01",
      displayName: "会员一",
      phone: "13800138000",
      roles: ["MEMBER"]
    });
    mockedUpdatePrivateProfile.mockResolvedValue({
      id: "1",
      username: "member01",
      displayName: "会员二",
      phone: "13900139000",
      roles: ["MEMBER"]
    });

    renderApp("/profile");
    expect(await screen.findByRole("heading", { level: 2, name: "个人主页" })).toBeInTheDocument();
    fireFormInput("展示名", "会员二");
    fireFormInput("手机号", "13900139000");
    fireFormInput("当前密码", "StrongPass123!");
    fireFormInput("新密码", "NextPass123");
    fireFormInput("确认新密码", "NextPass123");
    fireEvent.click(screen.getByRole("button", { name: "保存个人信息" }));

    await waitFor(() => {
      expect(mockedUpdatePrivateProfile).toHaveBeenCalledWith({
        displayName: "会员二",
        phone: "13900139000",
        currentPassword: "StrongPass123!",
        newPassword: "NextPass123"
      }, "csrf-token");
    });
    expect(await screen.findByText("个人信息已更新。")).toBeInTheDocument();
  });

  it("个人主页允许旧资料手机号为空并在保存时不提交空手机号", async () => {
    mockedGetCurrentSession.mockResolvedValue({
      user: {
        id: "1",
        username: "member01",
        displayName: "会员一",
        roles: ["MEMBER"]
      },
      csrfToken: "csrf-token"
    });
    mockedGetPrivateProfile.mockResolvedValue({
      id: "1",
      username: "member01",
      displayName: "会员一",
      phone: "",
      roles: ["MEMBER"]
    });
    mockedUpdatePrivateProfile.mockResolvedValue({
      id: "1",
      username: "member01",
      displayName: "会员二",
      phone: "",
      roles: ["MEMBER"]
    });

    renderApp("/profile");
    expect(await screen.findByRole("heading", { level: 2, name: "个人主页" })).toBeInTheDocument();
    expect(screen.getByLabelText("手机号")).toHaveValue("");
    fireFormInput("展示名", "会员二");
    fireEvent.click(screen.getByRole("button", { name: "保存个人信息" }));

    await waitFor(() => {
      expect(mockedUpdatePrivateProfile).toHaveBeenCalledWith({
        displayName: "会员二"
      }, "csrf-token");
    });
  });

  it("个人主页修改密码时校验新密码强度和确认密码一致", async () => {
    mockedGetCurrentSession.mockResolvedValue({
      user: {
        id: "1",
        username: "member01",
        displayName: "会员一",
        roles: ["MEMBER"]
      },
      csrfToken: "csrf-token"
    });
    mockedGetPrivateProfile.mockResolvedValue({
      id: "1",
      username: "member01",
      displayName: "会员一",
      phone: "13800138000",
      roles: ["MEMBER"]
    });

    renderApp("/profile");
    expect(await screen.findByRole("heading", { level: 2, name: "个人主页" })).toBeInTheDocument();
    const newPasswordInput = screen.getByLabelText("新密码");
    const confirmedPasswordInput = screen.getByLabelText("确认新密码");

    fireEvent.change(newPasswordInput, { target: { value: "weakpass" } });
    fireEvent.blur(newPasswordInput);
    expect(newPasswordInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("密码至少 8 位，并包含英文大写、小写和数字。")).toHaveClass("field-error");

    fireEvent.change(newPasswordInput, { target: { value: "NextPass123" } });
    fireEvent.change(confirmedPasswordInput, { target: { value: "OtherPass123" } });
    fireEvent.blur(confirmedPasswordInput);
    expect(confirmedPasswordInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("两次输入的密码不一致。")).toHaveClass("field-error");

    fireEvent.click(screen.getByRole("button", { name: "保存个人信息" }));
    expect(mockedUpdatePrivateProfile).not.toHaveBeenCalled();
  });
});

function renderApp(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

function fireFormInput(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
