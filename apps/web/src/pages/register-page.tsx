import { Link } from "react-router-dom";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { ApiClientError, fetchCsrf, register } from "../api/client.js";
import { AuthShell } from "./auth-shell.js";
import { Button } from "../ui/button.js";
import { Field } from "../ui/field.js";
import { StatusMessage } from "../ui/status-message.js";

export function RegisterPage() {
  const navigate = useNavigate();
  const [csrfToken, setCsrfToken] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("正在准备安全会话…");
  const [password, setPassword] = useState("");
  const [confirmedPassword, setConfirmedPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmedPasswordTouched, setConfirmedPasswordTouched] = useState(false);
  const passwordError = passwordTouched && !isStrongPassword(password) ? passwordRuleMessage : undefined;
  const confirmedPasswordError = confirmedPasswordTouched && confirmedPassword !== password ? passwordMismatchMessage : undefined;

  useEffect(() => {
    let alive = true;
    void fetchCsrf()
      .then((token) => {
        if (alive) {
          setCsrfToken(token);
          setMessage("安全会话已准备好。");
        }
      })
      .catch(() => {
        if (alive) {
          setMessage("暂时无法获取安全令牌，请稍后重试。");
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (password !== confirmedPassword) {
      setConfirmedPasswordTouched(true);
      setMessage(passwordMismatchMessage);
      return;
    }
    if (!isStrongPassword(password)) {
      setPasswordTouched(true);
      setMessage(passwordRuleMessage);
      return;
    }
    setLoading(true);
    try {
      await register({
        username: formValue(formData, "username").trim(),
        password,
        phone: formValue(formData, "phone").trim()
      }, csrfToken);
      void navigate("/member/catalog");
    } catch (error) {
      setMessage(registerErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="成为星选会员" description="留下基础资料，系统会自动授予 MEMBER 角色。">
      <form className="form-stack" onSubmit={(event) => { void handleSubmit(event); }}>
        <Field label="用户名" name="username" help="3–50 位英文、数字或下划线" autoComplete="username" />
        <Field label="手机号" name="phone" inputMode="tel" autoComplete="tel" help="手机号将使用 AES 加密保存" />
        <Field
          label="密码"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => { setPassword(event.target.value); }}
          onBlur={() => { setPasswordTouched(true); }}
          help="至少 8 位，包含英文大写、小写和数字"
          error={passwordError}
        />
        <Field
          label="确认密码"
          name="confirmedPassword"
          type="password"
          autoComplete="new-password"
          value={confirmedPassword}
          onChange={(event) => { setConfirmedPassword(event.target.value); }}
          onBlur={() => { setConfirmedPasswordTouched(true); }}
          error={confirmedPasswordError}
        />
        <Button type="submit" loading={loading} disabled={csrfToken.length === 0}>注册并进入会员首页</Button>
        <StatusMessage>{message}</StatusMessage>
        <span>已有账号？<Link to="/login">返回登录</Link></span>
      </form>
    </AuthShell>
  );
}

const passwordRuleMessage = "密码至少 8 位，并包含英文大写、小写和数字。";
const passwordMismatchMessage = "两次输入的密码不一致。";

function registerErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "USERNAME_TAKEN" || isUsernameTakenMessage(error.message)) {
      return "用户名已被占用，请换一个再试。";
    }
    if (error.code === "VALIDATION_ERROR") {
      return "请检查用户名、手机号和密码格式。";
    }
    if (error.message.trim().length > 0) {
      return error.message;
    }
  }
  return "注册失败，请稍后重试。";
}

function isUsernameTakenMessage(message: string): boolean {
  return /用户名.*(占用|存在|使用)/.test(message);
}

function isStrongPassword(password: string): boolean {
  return password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
}

function formValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
