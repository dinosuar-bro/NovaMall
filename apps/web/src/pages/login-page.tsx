import { Link } from "react-router-dom";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { ApiClientError, fetchCsrf, login } from "../api/client.js";
import { AuthShell } from "./auth-shell.js";
import { Button } from "../ui/button.js";
import { Field } from "../ui/field.js";
import { StatusMessage } from "../ui/status-message.js";

export function LoginPage() {
  const navigate = useNavigate();
  const [csrfToken, setCsrfToken] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("正在准备安全会话…");

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
    setLoading(true);
    try {
      const session = await login({
        username: formValue(formData, "username"),
        password: formValue(formData, "password")
      }, csrfToken);
      void navigate(defaultRoute(session.user.roles));
    } catch (error) {
      setMessage(error instanceof ApiClientError
        ? `${error.message}${error.requestId !== undefined ? `（请求 ${error.requestId}）` : ""}`
        : "登录失败，请稍后重试。"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="登录星选" description="使用你的会员、店主或管理员账号进入对应工作区。">
      <form className="form-stack" onSubmit={(event) => { void handleSubmit(event); }}>
        <Field label="用户名" name="username" autoComplete="username" />
        <Field label="密码" name="password" type="password" autoComplete="current-password" />
        <Button type="submit" loading={loading} disabled={csrfToken.length === 0}>登录</Button>
        <StatusMessage>{message}</StatusMessage>
        <span>还没有账号？<Link to="/register">申请成为会员</Link></span>
      </form>
    </AuthShell>
  );
}

function defaultRoute(roles: string[]): string {
  if (roles.includes("ADMIN")) {
    return "/admin";
  }
  if (roles.includes("OWNER")) {
    return "/owner";
  }
  return "/member";
}

function formValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
