import { Link } from "react-router-dom";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import type {
  AdminMerchantApplication,
  MerchantApplication,
  MerchantApplicationStatus,
  ShopSummary
} from "@novamall/shared";

import { BrandMark } from "../ui/brand-mark.js";
import { Button } from "../ui/button.js";
import { StatusMessage } from "../ui/status-message.js";
import { RoleNav } from "../app/app.js";
import {
  ApiClientError,
  approveMerchantApplication,
  fetchCsrf,
  getMyMerchantApplication,
  getOwnerShop,
  listMerchantApplications,
  rejectMerchantApplication,
  submitMerchantApplication
} from "../api/client.js";

type RoleCode = "MEMBER" | "OWNER" | "ADMIN";

const roleCopy: Record<RoleCode, { title: string; body: string }> = {
  MEMBER: { title: "会员首页壳已就绪", body: "商品浏览、购物车和订单将在后续阶段接入。当前页面用于验证会员登录与权限边界。" },
  OWNER: { title: "店主后台壳已就绪", body: "店铺、商品、库存和履约功能将在 Stage 2 后开放。当前页面用于验证 OWNER 权限。" },
  ADMIN: { title: "管理员后台壳已就绪", body: "分类、审核、账号和审计管理将在后续阶段开放。当前页面用于验证 ADMIN 权限。" }
};

interface RolePageProps {
  role: RoleCode;
}

export function RolePage({ role }: RolePageProps) {
  return (
    <main className="app-frame">
      <aside className="side-nav">
        <BrandMark />
        <RoleNav role={role} />
      </aside>
      <section className="workspace" aria-labelledby="role-title">
        <div className="empty-state">
          <p>{role}</p>
          <h1 id="role-title">{roleCopy[role].title}</h1>
          <p>{roleCopy[role].body}</p>
        </div>
        <RoleStageTwoPanel role={role} />
      </section>
    </main>
  );
}

function RoleStageTwoPanel({ role }: RolePageProps) {
  if (role === "MEMBER") {
    return <MemberMerchantApplicationPanel />;
  }
  if (role === "ADMIN") {
    return <AdminMerchantApplicationsPanel />;
  }
  return <OwnerShopPanel />;
}

function MemberMerchantApplicationPanel() {
  const [csrfToken, setCsrfToken] = useState("");
  const [application, setApplication] = useState<MerchantApplication | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("正在读取开店申请…");
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([fetchCsrf(), getMyMerchantApplication()])
      .then(([token, nextApplication]) => {
        if (alive) {
          setCsrfToken(token);
          setApplication(nextApplication);
          setMessage(nextApplication === null ? "你还没有提交开店申请。" : "申请状态已同步。");
        }
      })
      .catch((error) => {
        if (alive) {
          setMessage(errorMessage(error, "暂时无法读取开店申请。"));
          setApplication(null);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const shopName = formValue(formData, "shopName").trim();
    const shopDescription = formValue(formData, "shopDescription").trim();
    if (shopName.length < 2 || shopDescription.length < 10) {
      setFieldError("店铺名称至少 2 个字，店铺简介至少 10 个字。");
      return;
    }
    setLoading(true);
    setFieldError(null);
    try {
      const nextApplication = await submitMerchantApplication({
        shopName,
        shopDescription
      }, csrfToken);
      setApplication(nextApplication);
      setMessage("开店申请已提交，等待管理员审核。");
    } catch (error) {
      setMessage(errorMessage(error, "提交失败，请检查店铺名称和简介后再试。"));
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = application === null || application?.status === "REJECTED";
  const buttonText = application?.status === "REJECTED" ? "重新提交申请" : "提交开店申请";

  return (
    <section className="stage-panel" aria-labelledby="merchant-application-title">
      <div className="section-heading">
        <h2 id="merchant-application-title">开店申请</h2>
        {application !== undefined && application !== null ? <StatusBadge status={application.status} /> : null}
      </div>
      {application === undefined ? <StatusMessage>{message}</StatusMessage> : null}
      {application !== null && application !== undefined ? (
        <div className="record-summary">
          <strong>{application.shopName}</strong>
          <p>{application.shopDescription}</p>
          {application.rejectReason !== null ? <StatusMessage>{application.rejectReason}</StatusMessage> : null}
          {application.status === "APPROVED" ? <Link to="/owner">进入店主后台</Link> : null}
        </div>
      ) : null}
      {canSubmit ? (
        <form className="form-stack stage-form" noValidate onSubmit={(event) => { void handleSubmit(event); }}>
          <label className="field">
            <span>店铺名称</span>
            <input aria-label="店铺名称" name="shopName" defaultValue={application?.shopName ?? ""} minLength={2} maxLength={100} required />
            <small>2-100 个字，审核通过后将作为店铺名称。</small>
          </label>
          <label className="field">
            <span>店铺简介</span>
            <textarea aria-label="店铺简介" name="shopDescription" defaultValue={application?.shopDescription ?? ""} rows={4} minLength={10} maxLength={500} required />
            <small>10-500 个字，说明主营品类和服务范围。</small>
          </label>
          {fieldError !== null ? <p className="field-error">{fieldError}</p> : null}
          <Button type="submit" loading={loading} disabled={csrfToken.length === 0}>{buttonText}</Button>
        </form>
      ) : null}
      <StatusMessage>{message}</StatusMessage>
    </section>
  );
}

function AdminMerchantApplicationsPanel() {
  const [csrfToken, setCsrfToken] = useState("");
  const [applications, setApplications] = useState<AdminMerchantApplication[]>([]);
  const [statusFilter, setStatusFilter] = useState<MerchantApplicationStatus | "ALL">("ALL");
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [message, setMessage] = useState("正在读取申请列表…");

  async function refresh(nextStatusFilter = statusFilter): Promise<void> {
    const result = await listMerchantApplications(nextStatusFilter === "ALL" ? undefined : nextStatusFilter);
    setApplications(result.data);
    setMessage(result.meta.total === 0 ? "暂无开店申请。" : `共 ${result.meta.total} 条开店申请。`);
  }

  useEffect(() => {
    let alive = true;
    void fetchCsrf()
      .then((token) => {
        if (alive) {
          setCsrfToken(token);
        }
      })
      .catch((error) => {
        if (alive) {
          setMessage(errorMessage(error, "暂时无法获取安全令牌。"));
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void listMerchantApplications(statusFilter === "ALL" ? undefined : statusFilter)
      .then((result) => {
        if (alive) {
          setApplications(result.data);
          setMessage(result.meta.total === 0 ? "暂无开店申请。" : `共 ${result.meta.total} 条开店申请。`);
        }
      })
      .catch((error) => {
        if (alive) {
          setMessage(errorMessage(error, "暂时无法读取申请列表。"));
        }
      });
    return () => {
      alive = false;
    };
  }, [statusFilter]);

  function updateStatusFilter(event: ChangeEvent<HTMLSelectElement>): void {
    const nextStatus = parseStatusFilter(event.target.value);
    setMessage("正在读取申请列表…");
    setStatusFilter(nextStatus);
  }

  function updateRejectReason(id: string, value: string): void {
    setRejectReasons((current) => ({
      ...current,
      [id]: value
    }));
  }

  async function approve(id: string): Promise<void> {
    setLoadingId(id);
    try {
      await approveMerchantApplication(id, csrfToken);
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error, "批准申请失败。"));
    } finally {
      setLoadingId(null);
    }
  }

  async function reject(id: string): Promise<void> {
    const reason = (rejectReasons[id] ?? "").trim();
    if (reason.length < 2) {
      setMessage("拒绝原因至少 2 个字。");
      return;
    }
    setLoadingId(id);
    try {
      await rejectMerchantApplication(id, { reason }, csrfToken);
      setRejectReasons((current) => {
        const nextReasons = { ...current };
        delete nextReasons[id];
        return nextReasons;
      });
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error, "拒绝申请失败。"));
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <section className="stage-panel" aria-labelledby="admin-applications-title">
      <div className="section-heading">
        <h2 id="admin-applications-title">开店审核</h2>
      </div>
      <label className="field filter-control">
        <span>审核状态</span>
        <select aria-label="审核状态" value={statusFilter} onChange={updateStatusFilter}>
          <option value="ALL">全部申请</option>
          <option value="PENDING">待审核</option>
          <option value="APPROVED">已通过</option>
          <option value="REJECTED">已拒绝</option>
        </select>
      </label>
      <div className="application-list">
        {applications.map((application) => (
          <article className="application-row" key={application.id}>
            <div>
              <strong>{application.shopName}</strong>
              <p>{application.shopDescription}</p>
              <span>{application.user.displayName}</span>
            </div>
            <StatusBadge status={application.status} />
            {application.status === "PENDING" ? (
              <div className="review-actions">
                <label className="field reject-reason-field">
                  <span>拒绝原因</span>
                  <input
                    aria-label={`拒绝原因：${application.shopName}`}
                    value={rejectReasons[application.id] ?? ""}
                    onChange={(event) => { updateRejectReason(application.id, event.target.value); }}
                    minLength={2}
                    maxLength={500}
                    placeholder="说明需要会员修改的内容"
                  />
                </label>
                <div className="row-actions">
                  <Button
                    loading={loadingId === application.id}
                    onClick={() => { void approve(application.id); }}
                  >
                    批准
                  </Button>
                  <Button
                    variant="secondary"
                    loading={loadingId === application.id}
                    onClick={() => { void reject(application.id); }}
                  >
                    拒绝
                  </Button>
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      <StatusMessage>{message}</StatusMessage>
    </section>
  );
}

function parseStatusFilter(value: string): MerchantApplicationStatus | "ALL" {
  if (value === "PENDING" || value === "APPROVED" || value === "REJECTED") {
    return value;
  }
  return "ALL";
}

function OwnerShopPanel() {
  const [shop, setShop] = useState<ShopSummary | null>(null);
  const [message, setMessage] = useState("正在读取店铺资料…");

  useEffect(() => {
    let alive = true;
    void getOwnerShop()
      .then((nextShop) => {
        if (alive) {
          setShop(nextShop);
          setMessage("店铺资料已同步。");
        }
      })
      .catch((error) => {
        if (alive) {
          setMessage(errorMessage(error, "暂时无法读取店铺资料。"));
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="stage-panel" aria-labelledby="owner-shop-title">
      <div className="section-heading">
        <h2 id="owner-shop-title">店铺资料</h2>
        {shop !== null ? <StatusBadge status={shop.status} /> : null}
      </div>
      {shop !== null ? (
        <div className="record-summary">
          <strong>{shop.name}</strong>
          <p>{shop.description}</p>
          <span>商品功能将在下一阶段开放。</span>
        </div>
      ) : null}
      <StatusMessage>{message}</StatusMessage>
    </section>
  );
}

function StatusBadge({ status }: { status: MerchantApplication["status"] | ShopSummary["status"] }) {
  return <span className="status-badge">{statusLabel(status)}</span>;
}

function statusLabel(status: MerchantApplication["status"] | ShopSummary["status"]): string {
  if (status === "PENDING") {
    return "等待管理员审核";
  }
  if (status === "APPROVED") {
    return "已通过";
  }
  if (status === "REJECTED") {
    return "已拒绝";
  }
  if (status === "ACTIVE") {
    return "营业中";
  }
  return "已暂停";
}

function errorMessage(error: unknown, fallback: string): string {
  if (isApiClientErrorLike(error)) {
    if (error.code === "DUPLICATE_APPLICATION" || error.code === "APPLICATION_STATE_CONFLICT") {
      return "当前申请状态已经变化，请刷新后再试。";
    }
    if (error.code === "SHOP_NAME_TAKEN") {
      return "这个店铺名称已被使用，请换一个名称。";
    }
    if (error.code === "VALIDATION_ERROR") {
      return fallback;
    }
    return "操作没有成功，请稍后再试。";
  }
  return fallback;
}

function isApiClientErrorLike(error: unknown): error is Pick<ApiClientError, "code"> {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string";
}

function formValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
