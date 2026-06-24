import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiClientError,
  fetchCsrf,
  getCurrentSession,
  getMyMerchantApplication,
  login,
  register
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
  getCurrentSession: vi.fn(),
  getMyMerchantApplication: vi.fn(),
  getOwnerShop: vi.fn(),
  listMerchantApplications: vi.fn(),
  submitMerchantApplication: vi.fn(),
  approveMerchantApplication: vi.fn(),
  rejectMerchantApplication: vi.fn(),
  login: vi.fn(),
  register: vi.fn()
}));

const mockedFetchCsrf = vi.mocked(fetchCsrf);
const mockedGetCurrentSession = vi.mocked(getCurrentSession);
const mockedGetMyMerchantApplication = vi.mocked(getMyMerchantApplication);
const mockedLogin = vi.mocked(login);
const mockedRegister = vi.mocked(register);

describe("App 路由守卫", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchCsrf.mockResolvedValue("csrf-token");
    mockedGetMyMerchantApplication.mockResolvedValue(null);
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

    expect(await screen.findByRole("heading", { name: "开店申请" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "登录星选" })).not.toBeInTheDocument();
  });

  it("未登录访问会员页时回到登录页且不读取开店申请", async () => {
    mockedGetCurrentSession.mockRejectedValue(new Error("未登录"));

    renderApp("/member");

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
    fireFormInput("展示名", "会员一");
    fireFormInput("手机号", "13800138000");
    fireFormInput("密码", "Password12345");
    fireEvent.click(screen.getByRole("button", { name: "注册并进入会员首页" }));

    expect(await screen.findByText("用户名已被占用，请换一个再试。")).toBeInTheDocument();
    expect(screen.queryByText(/request-789/)).not.toBeInTheDocument();
    expect(screen.queryByText(/用户名已存在/)).not.toBeInTheDocument();
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
