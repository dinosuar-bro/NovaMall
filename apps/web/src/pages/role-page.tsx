import { Link, NavLink } from "react-router-dom";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type {
  Address,
  AuditLog,
  Cart,
  Category,
  AdminMerchantApplication,
  MemberOrder,
  MerchantApplication,
  MerchantApplicationStatus,
  OwnerProduct,
  PublicProduct,
  ShopOrder,
  ShopSummary
} from "@novamall/shared";

import { BrandMark } from "../ui/brand-mark.js";
import { Button } from "../ui/button.js";
import { StatusMessage } from "../ui/status-message.js";
import { defaultRegion, listCities, listDistricts, listProvinces } from "../data/regions.js";
import {
  addCartItem,
  ApiClientError,
  approveMerchantApplication,
  checkoutCart,
  confirmShopOrder,
  createAddress,
  createCategory,
  createOwnerProduct,
  deleteCartItem,
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
  publishOwnerProduct,
  rejectMerchantApplication,
  shipShopOrder,
  submitMerchantApplication,
  updateCartItem,
  uploadProductImage
} from "../api/client.js";

type RoleCode = "MEMBER" | "OWNER" | "ADMIN";

const roleCopy: Record<RoleCode, { title: string; body: string }> = {
  MEMBER: { title: "会员首页壳已就绪", body: "商品浏览、购物车和订单将在后续阶段接入。当前页面用于验证会员登录与权限边界。" },
  OWNER: { title: "店主后台壳已就绪", body: "店铺、商品、库存和履约功能将在 Stage 2 后开放。当前页面用于验证 OWNER 权限。" },
  ADMIN: { title: "管理员后台壳已就绪", body: "分类、审核、账号和审计管理将在后续阶段开放。当前页面用于验证 ADMIN 权限。" }
};

interface RolePageProps {
  role: RoleCode;
  csrfToken: string;
}

export function RolePage({ role, csrfToken }: RolePageProps) {
  return (
    <main className="app-frame">
      <aside className="side-nav">
        <BrandMark />
        <LegacyRoleNav role={role} />
      </aside>
      <section className="workspace" aria-labelledby="role-title">
        <div className="empty-state">
          <p>{role}</p>
          <h1 id="role-title">{roleCopy[role].title}</h1>
          <p>{roleCopy[role].body}</p>
        </div>
        <RoleStageTwoPanel role={role} csrfToken={csrfToken} />
      </section>
    </main>
  );
}

function LegacyRoleNav({ role }: { role: RoleCode }) {
  return (
    <nav aria-label="角色导航">
      {role === "MEMBER" ? <NavLink to="/member/catalog">会员首页</NavLink> : null}
      {role === "OWNER" ? <NavLink to="/owner/products">店主后台</NavLink> : null}
      {role === "ADMIN" ? <NavLink to="/admin/categories">管理员后台</NavLink> : null}
    </nav>
  );
}

function RoleStageTwoPanel({ role, csrfToken }: RolePageProps) {
  if (role === "MEMBER") {
    return (
      <>
        <MemberCatalogPanel csrfToken={csrfToken} />
        <MemberCartOrdersPanel csrfToken={csrfToken} />
      </>
    );
  }
  if (role === "ADMIN") {
    return (
      <>
        <AdminCategoryPanel />
        <AdminMerchantApplicationsPanel />
        <AdminDatabaseEvidencePanel />
      </>
    );
  }
  return (
    <>
      <OwnerShopPanel />
      <OwnerProductPanel />
      <OwnerOrdersPanel csrfToken={csrfToken} />
    </>
  );
}

export function MemberCatalogPanel({ csrfToken: initialCsrfToken = "" }: { csrfToken?: string }) {
  const [csrfToken, setCsrfToken] = useState(initialCsrfToken);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [keyword, setKeyword] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [message, setMessage] = useState("正在读取商品目录…");
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [addedProductId, setAddedProductId] = useState<string | null>(null);
  const addedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function refresh(nextKeyword = keyword, nextCategoryId = categoryId): Promise<void> {
    const productResult = await listPublicProducts({
      keyword: nextKeyword,
      categoryId: nextCategoryId,
      sort: nextKeyword.trim().length > 0 ? "relevance" : "newest"
    });
    setProducts(productResult.data);
    setMessage(productResult.meta.total === 0 ? "暂无可展示商品。" : `共 ${productResult.meta.total} 件商品。`);
    try {
      const nextCategories = await listPublicCategories();
      setCategories(nextCategories);
    } catch {
      setMessage(productResult.meta.total === 0 ? "暂无可展示商品。" : `共 ${productResult.meta.total} 件商品。`);
    }
  }

  useEffect(() => {
    let alive = true;
    const tokenPromise = initialCsrfToken.length > 0 ? Promise.resolve(initialCsrfToken) : fetchCsrf();
    void tokenPromise
      .then((token) => {
        if (alive) {
          setCsrfToken(token);
        }
      })
      .catch((error) => {
        if (alive) {
          setMessage(errorMessage(error, "暂时无法读取安全令牌。"));
        }
      });
    void listPublicProducts({ sort: "newest" })
      .then((productResult) => {
        if (alive) {
          setProducts(productResult.data);
          setMessage(productResult.meta.total === 0 ? "暂无可展示商品。" : `共 ${productResult.meta.total} 件商品。`);
        }
      })
      .catch((error) => {
        if (alive) {
          setMessage(errorMessage(error, "暂时无法读取商品目录。"));
        }
      });
    void listPublicCategories()
      .then((nextCategories) => {
        if (alive) {
          setCategories(nextCategories);
        }
      })
      .catch((error) => {
        if (alive) {
          setMessage(errorMessage(error, "暂时无法读取分类。"));
        }
      });
    return () => {
      alive = false;
    };
  }, [initialCsrfToken]);

  useEffect(() => {
    return () => {
      if (addedResetTimerRef.current !== null) {
        clearTimeout(addedResetTimerRef.current);
      }
    };
  }, []);

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void refresh(keyword, categoryId);
  }

  async function addProduct(product: PublicProduct): Promise<void> {
    if (csrfToken.length === 0) {
      setMessage("安全令牌未准备好，请稍后再试。");
      return;
    }
    setAddingProductId(product.id);
    try {
      await addCartItem({ productId: product.id, quantity: 1 }, csrfToken);
      setMessage(`已加入购物车：${product.name} x1`);
      setAddedProductId(product.id);
      if (addedResetTimerRef.current !== null) {
        clearTimeout(addedResetTimerRef.current);
      }
      addedResetTimerRef.current = setTimeout(() => {
        setAddedProductId(null);
        addedResetTimerRef.current = null;
      }, 900);
    } catch (error) {
      setMessage(errorMessage(error, "加入购物车失败。"));
    } finally {
      setAddingProductId(null);
    }
  }

  return (
    <section className="stage-panel" aria-labelledby="catalog-title">
      <div className="section-heading">
        <h2 id="catalog-title">商品目录</h2>
      </div>
      <form className="catalog-toolbar" onSubmit={submitSearch}>
        <label className="field">
          <span>商品关键词</span>
          <input aria-label="商品关键词" value={keyword} onChange={(event) => { setKeyword(event.target.value); }} placeholder="搜索苹果、咖啡、礼盒" />
        </label>
        <label className="field">
          <span>商品分类</span>
          <select aria-label="商品分类" value={categoryId} onChange={(event) => { setCategoryId(event.target.value); }}>
            <option value="">全部分类</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <Button type="submit">搜索商品</Button>
      </form>
      <div className="product-grid">
        {products.map((product) => (
          <article className={`product-card${addedProductId === product.id ? " product-card--added" : ""}`} key={product.id}>
            <img
              src={productImageSrc(product.mainImagePath)}
              alt={product.name}
              onError={(event) => {
                replaceWithProductPlaceholder(event.currentTarget);
              }}
              onLoad={(event) => {
                if (isTinyProductImage(event.currentTarget)) {
                  replaceWithProductPlaceholder(event.currentTarget);
                }
              }}
            />
            <div>
              <strong>{product.name}</strong>
              <p>{product.description}</p>
              <span>{product.shop.name}</span>
              <span>{product.category.name}</span>
              <b>¥{product.price}</b>
              <Button
                variant="secondary"
                loading={addingProductId === product.id}
                disabled={csrfToken.length === 0}
                onClick={() => { void addProduct(product); }}
              >
                加入购物车：{product.name}
              </Button>
            </div>
          </article>
        ))}
      </div>
      <StatusMessage>{message}</StatusMessage>
    </section>
  );
}

type MemberCartOrdersView = "cart" | "orders" | "all";

export function MemberCartOrdersPanel({ csrfToken: initialCsrfToken = "", view = "all" }: { csrfToken?: string; view?: MemberCartOrdersView }) {
  const initialRegion = defaultRegion();
  const [csrfToken, setCsrfToken] = useState(initialCsrfToken);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [cart, setCart] = useState<Cart>({ items: [], totalAmount: "0.00" });
  const [orders, setOrders] = useState<MemberOrder[]>([]);
  const [shopOrders, setShopOrders] = useState<ShopOrder[]>([]);
  const [quantityEdits, setQuantityEdits] = useState<Record<string, string>>({});
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [selectedProvince, setSelectedProvince] = useState(initialRegion.province);
  const [selectedCity, setSelectedCity] = useState(initialRegion.city);
  const [selectedDistrict, setSelectedDistrict] = useState(initialRegion.district);
  const [loading, setLoading] = useState(false);
  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const [message, setMessage] = useState("正在读取购物车与订单…");
  const provinceOptions = listProvinces();
  const cityOptions = listCities(selectedProvince);
  const districtOptions = listDistricts(selectedProvince, selectedCity);

  async function refresh(successMessage?: string): Promise<void> {
    const [nextAddresses, nextCart, nextOrders, nextShopOrders] = await Promise.all([
      listAddresses(),
      getCart(),
      listMemberOrders(),
      listMemberShopOrders()
    ]);
    setAddresses(nextAddresses);
    setCart(nextCart);
    setQuantityEdits(cartQuantityState(nextCart));
    setOrders(nextOrders);
    setShopOrders(nextShopOrders);
    setSelectedAddressId((current) => current || nextAddresses.find((address) => address.isDefault)?.id || nextAddresses[0]?.id || "");
    setMessage(successMessage ?? (nextCart.items.length === 0 ? "购物车为空，可先从商品目录加购。" : `购物车合计 ¥${nextCart.totalAmount}`));
  }

  useEffect(() => {
    let alive = true;
    const tokenPromise = initialCsrfToken.length > 0 ? Promise.resolve(initialCsrfToken) : fetchCsrf();
    void Promise.all([tokenPromise, getPrivateProfile(), listAddresses(), getCart(), listMemberOrders(), listMemberShopOrders()])
      .then(([token, profile, nextAddresses, nextCart, nextOrders, nextShopOrders]) => {
        if (alive) {
          setCsrfToken(token);
          setReceiverPhone(profile.phone);
          setAddresses(nextAddresses);
          setCart(nextCart);
          setQuantityEdits(cartQuantityState(nextCart));
          setOrders(nextOrders);
          setShopOrders(nextShopOrders);
          setSelectedAddressId(nextAddresses.find((address) => address.isDefault)?.id || nextAddresses[0]?.id || "");
          setMessage(nextCart.items.length === 0 ? "购物车为空，可先从商品目录加购。" : `购物车合计 ¥${nextCart.totalAmount}`);
        }
      })
      .catch((error) => {
        if (alive) {
          setMessage(errorMessage(error, "暂时无法读取购物车与订单。"));
        }
      });
    return () => {
      alive = false;
    };
  }, [initialCsrfToken]);

  async function handleAddressSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const input = {
      receiverName: formValue(formData, "receiverName").trim(),
      receiverPhone: receiverPhone.trim(),
      province: selectedProvince,
      city: selectedCity,
      district: selectedDistrict,
      detail: formValue(formData, "detail").trim(),
      isDefault: true
    };
    setLoading(true);
    try {
      const address = await createAddress(input, csrfToken);
      setAddresses((current) => [address, ...current.filter((item) => item.id !== address.id)]);
      setSelectedAddressId(address.id);
      setMessage("地址已保存。");
      form.reset();
    } catch (error) {
      setMessage(errorMessage(error, "地址保存失败。"));
    } finally {
      setLoading(false);
    }
  }

  async function submitCheckout(): Promise<void> {
    if (selectedAddressId.length === 0) {
      setMessage("请先保存或选择收货地址。");
      return;
    }
    setLoading(true);
    try {
      const result = await checkoutCart({ addressId: selectedAddressId, checkoutToken: newCheckoutToken() }, csrfToken);
      setCheckoutDialogOpen(false);
      await refresh(`结算成功，订单 ${displayOrderCode("主订单", result.orderNo)} 已创建。`);
    } catch (error) {
      setMessage(errorMessage(error, "结算失败。"));
    } finally {
      setLoading(false);
    }
  }

  async function updateQuantity(item: Cart["items"][number]): Promise<void> {
    const itemId = item.id;
    const quantity = Number(quantityEdits[itemId]);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      setMessage("商品数量必须是 1 到 99 的整数。");
      setQuantityEdits(cartQuantityState(cart));
      return;
    }
    if (quantity > item.stock) {
      setMessage(`库存不足，${item.productName} 当前最多可购买 ${item.stock} 件。`);
      setQuantityEdits(cartQuantityState(cart));
      return;
    }
    if (quantity === item.quantity) {
      return;
    }
    setLoading(true);
    try {
      const nextCart = await updateCartItem(itemId, { quantity }, csrfToken);
      setCart(nextCart);
      setQuantityEdits(cartQuantityState(nextCart));
      setMessage(`${item.productName} 数量已更新。`);
    } catch (error) {
      setQuantityEdits(cartQuantityState(cart));
      setMessage(errorMessage(error, "数量更新失败，请确认库存是否充足后再试。"));
    } finally {
      setLoading(false);
    }
  }

  async function removeItem(itemId: string, productName: string): Promise<void> {
    setLoading(true);
    try {
      const nextCart = await deleteCartItem(itemId, csrfToken);
      setCart(nextCart);
      setQuantityEdits(cartQuantityState(nextCart));
      setMessage(`${productName} 已从购物车删除。`);
    } catch (error) {
      setMessage(errorMessage(error, "删除购物车商品失败。"));
    } finally {
      setLoading(false);
    }
  }

  function requestCheckout(): void {
    if (selectedAddressId.length === 0) {
      setMessage("请先保存或选择收货地址。");
      return;
    }
    setCheckoutDialogOpen(true);
  }

  async function pay(orderNo: string): Promise<void> {
    setLoading(true);
    try {
      await payOrder(orderNo, csrfToken);
      await refresh("模拟支付成功。");
    } catch (error) {
      setMessage(errorMessage(error, "模拟支付失败。"));
    } finally {
      setLoading(false);
    }
  }

  async function confirm(shopOrderNo: string): Promise<void> {
    setLoading(true);
    try {
      await confirmShopOrder(shopOrderNo, csrfToken);
      await refresh("已确认收货。");
    } catch (error) {
      setMessage(errorMessage(error, "确认收货失败。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="stage-panel" aria-labelledby="member-cart-orders-title">
      <div className="section-heading">
        <h2 id="member-cart-orders-title">{view === "orders" ? "订单列表" : "购物车"}</h2>
      </div>
      {view !== "orders" ? (
        <>
          <form className="form-grid" onSubmit={(event) => { void handleAddressSubmit(event); }}>
            <label className="field">
              <span>收货人</span>
              <input aria-label="收货人" name="receiverName" minLength={2} maxLength={80} required />
            </label>
            <label className="field">
              <span>收货手机号</span>
              <input
                aria-label="收货手机号"
                name="receiverPhone"
                inputMode="tel"
                value={receiverPhone}
                onChange={(event) => { setReceiverPhone(event.target.value); }}
                required
              />
            </label>
            <label className="field">
              <span>省份</span>
              <select
                aria-label="省份"
                name="province"
                value={selectedProvince}
                onChange={(event) => {
                  const nextProvince = event.target.value;
                  const nextCity = listCities(nextProvince)[0]?.name ?? "";
                  const nextDistrict = listDistricts(nextProvince, nextCity)[0]?.name ?? "";
                  setSelectedProvince(nextProvince);
                  setSelectedCity(nextCity);
                  setSelectedDistrict(nextDistrict);
                }}
                required
              >
                {provinceOptions.map((province) => <option key={province.code} value={province.name}>{province.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>城市</span>
              <select
                aria-label="城市"
                name="city"
                value={selectedCity}
                onChange={(event) => {
                  const nextCity = event.target.value;
                  setSelectedCity(nextCity);
                  setSelectedDistrict(listDistricts(selectedProvince, nextCity)[0]?.name ?? "");
                }}
                required
              >
                {cityOptions.map((city) => <option key={city.code} value={city.name}>{city.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>区县</span>
              <select
                aria-label="区县"
                name="district"
                value={selectedDistrict}
                onChange={(event) => { setSelectedDistrict(event.target.value); }}
                required
              >
                {districtOptions.map((district) => <option key={district.code} value={district.name}>{district.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>详细地址</span>
              <input aria-label="详细地址" name="detail" required />
            </label>
            <Button type="submit" loading={loading} disabled={csrfToken.length === 0}>保存地址</Button>
          </form>
          <label className="field filter-control">
            <span>结算地址</span>
            <select aria-label="结算地址" value={selectedAddressId} onChange={(event) => { setSelectedAddressId(event.target.value); }}>
              <option value="" disabled>请选择地址</option>
              {addresses.map((address) => (
                <option key={address.id} value={address.id}>
                  {address.receiverName} {address.maskedPhone} {address.city}{address.district}
                </option>
              ))}
            </select>
          </label>
          <div className="compact-list">
            {cart.items.map((item) => (
              <article className="compact-row compact-row--cart" key={item.id}>
                <strong>{item.productName}</strong>
                <span>{item.shopName}</span>
                <span>单价 ¥{item.unitPrice}</span>
                <label className="inline-field">
                  <span>数量</span>
                  <input
                    aria-label={`商品数量：${item.productName}`}
                    type="number"
                    min={1}
                    max={99}
                    value={quantityEdits[item.id] ?? String(item.quantity)}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setQuantityEdits((current) => ({ ...current, [item.id]: nextValue }));
                    }}
                    onBlur={() => { void updateQuantity(item); }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void updateQuantity(item);
                      }
                    }}
                  />
                </label>
                <span>小计 ¥{item.lineAmount}</span>
                <StatusBadge status={item.available ? "AVAILABLE" : "UNAVAILABLE"} />
                <button
                  className="icon-button cart-delete-button"
                  type="button"
                  aria-label={`删除商品：${item.productName}`}
                  title="删除商品"
                  disabled={loading}
                  onClick={() => { void removeItem(item.id, item.productName); }}
                >
                  ×
                </button>
              </article>
            ))}
          </div>
          <div className="row-actions">
            <strong>购物车合计 ¥{cart.totalAmount}</strong>
            <Button loading={loading} disabled={csrfToken.length === 0 || cart.items.length === 0} onClick={requestCheckout}>提交结算</Button>
          </div>
          {checkoutDialogOpen ? (
            <div className="dialog-backdrop">
              <div className="checkout-dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-dialog-title">
                <h3 id="checkout-dialog-title">确认结算明细</h3>
                <div className="checkout-lines">
                  {cart.items.map((item) => (
                    <div className="checkout-line" key={item.id}>
                      <strong>{item.productName}</strong>
                      <span>x {item.quantity}</span>
                      <span>¥{item.unitPrice}</span>
                      <span>¥{item.lineAmount}</span>
                    </div>
                  ))}
                </div>
                <div className="row-actions">
                  <strong>总价 ¥{cart.totalAmount}</strong>
                  <Button variant="secondary" onClick={() => { setCheckoutDialogOpen(false); }}>取消</Button>
                  <Button loading={loading} onClick={() => { void submitCheckout(); }}>确认结算</Button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      {view !== "cart" ? (
        <>
          {view === "all" ? <h2>订单列表</h2> : null}
          <div className="compact-list">
            {orders.map((order) => (
              <article className="compact-row compact-row--five order-row" key={order.orderNo}>
                <strong title={order.orderNo}>{displayOrderCode("主订单", order.orderNo)}</strong>
                <span>¥{order.totalAmount}</span>
                <span>{order.shopOrderCount} 个子订单</span>
                <StatusBadge status={order.status} />
                {order.status === "PENDING_PAYMENT" ? (
                  <Button variant="secondary" loading={loading} onClick={() => { void pay(order.orderNo); }}>去支付</Button>
                ) : null}
              </article>
            ))}
          </div>
          <div className="compact-list">
            {shopOrders.map((shopOrder) => (
              <article className="compact-row compact-row--five order-row" key={shopOrder.shopOrderNo}>
                <strong title={shopOrder.shopOrderNo}>{displayOrderCode("子订单", shopOrder.shopOrderNo)}</strong>
                <span title={shopOrder.masterOrderNo}>{displayOrderCode("所属主订单", shopOrder.masterOrderNo)}</span>
                <span>¥{shopOrder.subtotalAmount}</span>
                <StatusBadge status={shopOrder.status} />
                {shopOrder.status === "SHIPPED" ? (
                  <Button variant="secondary" loading={loading} onClick={() => { void confirm(shopOrder.shopOrderNo); }}>确认收货</Button>
                ) : null}
              </article>
            ))}
          </div>
        </>
      ) : null}
      <StatusMessage>{message}</StatusMessage>
    </section>
  );
}

function cartQuantityState(cart: Cart): Record<string, string> {
  return Object.fromEntries(cart.items.map((item) => [item.id, String(item.quantity)]));
}

const productPlaceholderSrc = "/product-placeholder.png";
const minimumProductImageSide = 32;

function productImageSrc(path: string | null): string | undefined {
  if (path === null) {
    return productPlaceholderSrc;
  }
  if (path.startsWith("/uploads/")) {
    return `/api/v1${path}`;
  }
  return path;
}

function replaceWithProductPlaceholder(image: HTMLImageElement): void {
  if (!image.src.endsWith(productPlaceholderSrc)) {
    image.src = productPlaceholderSrc;
  }
}

function isTinyProductImage(image: HTMLImageElement): boolean {
  return !image.src.endsWith(productPlaceholderSrc)
    && image.complete
    && image.naturalWidth > 0
    && image.naturalHeight > 0
    && (image.naturalWidth < minimumProductImageSide || image.naturalHeight < minimumProductImageSide);
}

export function MemberMerchantApplicationPanel() {
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
          {application.status === "APPROVED" ? <Link to="/owner/shop">进入店主后台</Link> : null}
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

export function AdminMerchantApplicationsPanel() {
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

export function AdminCategoryPanel() {
  const [csrfToken, setCsrfToken] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [message, setMessage] = useState("正在读取分类…");
  const [loading, setLoading] = useState(false);

  async function refresh(): Promise<void> {
    const result = await listAdminCategories();
    setCategories(result.data);
    setMessage(result.meta.total === 0 ? "暂无分类。" : `共 ${result.meta.total} 个分类。`);
  }

  useEffect(() => {
    let alive = true;
    void Promise.all([fetchCsrf(), listAdminCategories()])
      .then(([token, result]) => {
        if (alive) {
          setCsrfToken(token);
          setCategories(result.data);
          setMessage(result.meta.total === 0 ? "暂无分类。" : `共 ${result.meta.total} 个分类。`);
        }
      })
      .catch((error) => {
        if (alive) {
          setMessage(errorMessage(error, "暂时无法读取分类。"));
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = formValue(formData, "name").trim();
    const description = formValue(formData, "description").trim();
    if (name.length < 2 || description.length < 2) {
      setMessage("分类名称和简介至少 2 个字。");
      return;
    }
    setLoading(true);
    try {
      const category = await createCategory({ name, description }, csrfToken);
      setCategories((current) => [category, ...current.filter((item) => item.id !== category.id)]);
      setMessage("分类已创建。");
      event.currentTarget.reset();
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error, "分类创建失败。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="stage-panel" aria-labelledby="category-admin-title">
      <div className="section-heading">
        <h2 id="category-admin-title">分类管理</h2>
      </div>
      <form className="form-grid" onSubmit={(event) => { void handleSubmit(event); }}>
        <label className="field">
          <span>分类名称</span>
          <input aria-label="分类名称" name="name" minLength={2} maxLength={80} required />
        </label>
        <label className="field">
          <span>分类简介</span>
          <input aria-label="分类简介" name="description" minLength={2} maxLength={255} required />
        </label>
        <Button type="submit" loading={loading} disabled={csrfToken.length === 0}>创建分类</Button>
      </form>
      <div className="compact-list">
        {categories.map((category) => (
          <article className="compact-row" key={category.id}>
            <strong>{category.name}</strong>
            <span>{category.description}</span>
            <StatusBadge status={category.status} />
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

export function OwnerShopPanel() {
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

export function OwnerProductPanel() {
  const [csrfToken, setCsrfToken] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<OwnerProduct[]>([]);
  const [message, setMessage] = useState("正在读取商品…");
  const [loading, setLoading] = useState(false);

  async function refresh(): Promise<void> {
    const [nextCategories, productResult] = await Promise.all([listPublicCategories(), listOwnerProducts()]);
    setCategories(nextCategories);
    setProducts(productResult.data);
    setMessage(productResult.meta.total === 0 ? "暂无商品。" : `共 ${productResult.meta.total} 件商品。`);
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
          setMessage(errorMessage(error, "暂时无法读取安全令牌。"));
        }
      });
    void listPublicCategories()
      .then((nextCategories) => {
        if (alive) {
          setCategories(nextCategories);
        }
      })
      .catch((error) => {
        if (alive) {
          setMessage(errorMessage(error, "暂时无法读取分类。"));
        }
      });
    void (async () => {
      const productResult = await listOwnerProducts();
      if (alive) {
        setProducts(productResult.data);
        setMessage(productResult.meta.total === 0 ? "暂无商品。" : `共 ${productResult.meta.total} 件商品。`);
      }
    })()
      .catch((error) => {
        if (alive) {
          setMessage(errorMessage(error, "暂时无法读取商品。"));
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const categoryId = formValue(formData, "categoryId") || categories[0]?.id;
    const name = formValue(formData, "name").trim();
    const description = formValue(formData, "description").trim();
    const price = formValue(formData, "price").trim();
    const stock = Number(formValue(formData, "stock"));
    const imageFile = formData.get("image");
    if (categoryId === undefined || name.length < 2 || description.length < 10 || !/^\d+\.\d{2}$/.test(price) || !Number.isInteger(stock)) {
      setMessage("请填写有效的商品分类、名称、简介、价格和库存。");
      return;
    }
    setLoading(true);
    try {
      const mainImagePath = imageFile instanceof File && imageFile.size > 0
        ? await uploadProductImage(imageFile, csrfToken)
        : null;
      const product = await createOwnerProduct({ categoryId, name, description, price, stock, mainImagePath }, csrfToken);
      setProducts((current) => [product, ...current.filter((item) => item.id !== product.id)]);
      setMessage("商品草稿已创建。");
      event.currentTarget.reset();
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error, "商品创建失败。"));
    } finally {
      setLoading(false);
    }
  }

  async function publish(productId: string): Promise<void> {
    setLoading(true);
    try {
      const product = await publishOwnerProduct(productId, csrfToken);
      setProducts((current) => current.map((item) => item.id === product.id ? product : item));
      setMessage("商品已上架。");
      await refresh().catch(() => {
        setMessage("商品已上架，列表刷新失败。");
      });
    } catch (error) {
      setMessage(errorMessage(error, "商品上架失败。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="stage-panel" aria-labelledby="owner-products-title">
      <div className="section-heading">
        <h2 id="owner-products-title">商品管理</h2>
      </div>
      <form className="form-grid owner-product-form" onSubmit={(event) => { void handleSubmit(event); }}>
        <label className="field">
          <span>商品分类</span>
          <select aria-label="商品分类" name="categoryId" disabled={categories.length === 0}>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>商品名称</span>
          <input aria-label="商品名称" name="name" minLength={2} maxLength={120} required />
        </label>
        <label className="field field--wide">
          <span>商品简介</span>
          <textarea aria-label="商品简介" name="description" rows={3} minLength={10} maxLength={1000} required />
        </label>
        <label className="field">
          <span>商品价格</span>
          <input aria-label="商品价格" name="price" inputMode="decimal" placeholder="19.90" required />
        </label>
        <label className="field">
          <span>商品库存</span>
          <input aria-label="商品库存" name="stock" inputMode="numeric" placeholder="20" required />
        </label>
        <label className="field">
          <span>商品图片</span>
          <input aria-label="商品图片" name="image" type="file" accept="image/png,image/jpeg,image/webp" />
        </label>
        <div className="owner-product-form__actions">
          <Button type="submit" loading={loading} disabled={csrfToken.length === 0 || categories.length === 0}>创建草稿商品</Button>
        </div>
      </form>
      <div className="compact-list">
        {products.map((product) => (
          <article className="compact-row" key={product.id}>
            <strong>{product.name}</strong>
            <span>{product.categoryName}</span>
            <span>¥{product.price}</span>
            <StatusBadge status={product.status} />
            {product.status === "DRAFT" || product.status === "UNPUBLISHED" ? (
              <Button variant="secondary" loading={loading} onClick={() => { void publish(product.id); }}>上架</Button>
            ) : null}
          </article>
        ))}
      </div>
      <StatusMessage>{message}</StatusMessage>
    </section>
  );
}

export function OwnerOrdersPanel({ csrfToken: initialCsrfToken = "" }: { csrfToken?: string }) {
  const [csrfToken, setCsrfToken] = useState(initialCsrfToken);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loadingOrderNo, setLoadingOrderNo] = useState<string | null>(null);
  const [message, setMessage] = useState("正在读取子订单…");

  async function refresh(successMessage?: string): Promise<void> {
    const nextOrders = await listOwnerShopOrders();
    setOrders(nextOrders);
    setMessage(successMessage ?? (nextOrders.length === 0 ? "暂无子订单。" : `共 ${nextOrders.length} 个子订单。`));
  }

  useEffect(() => {
    let alive = true;
    const tokenPromise = initialCsrfToken.length > 0 ? Promise.resolve(initialCsrfToken) : fetchCsrf();
    void Promise.all([tokenPromise, listOwnerShopOrders()])
      .then(([token, nextOrders]) => {
        if (alive) {
          setCsrfToken(token);
          setOrders(nextOrders);
          setMessage(nextOrders.length === 0 ? "暂无子订单。" : `共 ${nextOrders.length} 个子订单。`);
        }
      })
      .catch((error) => {
        if (alive) {
          setMessage(errorMessage(error, "暂时无法读取子订单。"));
        }
      });
    return () => {
      alive = false;
    };
  }, [initialCsrfToken]);

  async function ship(shopOrderNo: string): Promise<void> {
    setLoadingOrderNo(shopOrderNo);
    try {
      await shipShopOrder(shopOrderNo, csrfToken);
      await refresh("子订单已发货。");
    } catch (error) {
      setMessage(errorMessage(error, "发货失败。"));
    } finally {
      setLoadingOrderNo(null);
    }
  }

  return (
    <section className="stage-panel" aria-labelledby="owner-orders-title">
      <div className="section-heading">
        <h2 id="owner-orders-title">订单履约</h2>
      </div>
      <div className="compact-list">
        {orders.map((order) => (
          <article className="compact-row compact-row--five order-row" key={order.shopOrderNo}>
            <strong title={order.shopOrderNo}>{displayOrderCode("子订单", order.shopOrderNo)}</strong>
            <span title={order.masterOrderNo}>{displayOrderCode("所属主订单", order.masterOrderNo)}</span>
            <span>¥{order.subtotalAmount}</span>
            <StatusBadge status={order.status} />
            {order.status === "PENDING_SHIPMENT" ? (
              <Button
                variant="secondary"
                loading={loadingOrderNo === order.shopOrderNo}
                disabled={csrfToken.length === 0}
                onClick={() => { void ship(order.shopOrderNo); }}
              >
                标记发货
              </Button>
            ) : null}
          </article>
        ))}
      </div>
      <StatusMessage>{message}</StatusMessage>
    </section>
  );
}

export function AdminDatabaseEvidencePanel() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [topProducts, setTopProducts] = useState<Awaited<ReturnType<typeof listTopProducts>>>([]);
  const [message, setMessage] = useState("正在读取数据库证据…");

  useEffect(() => {
    let alive = true;
    void Promise.all([listAuditLogs(), listTopProducts()])
      .then(([nextAuditLogs, nextTopProducts]) => {
        if (alive) {
          setAuditLogs(nextAuditLogs);
          setTopProducts(nextTopProducts);
          setMessage("数据库证据已同步。");
        }
      })
      .catch((error) => {
        if (alive) {
          setMessage(errorMessage(error, "暂时无法读取数据库证据。"));
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="stage-panel" aria-labelledby="admin-database-title">
      <div className="evidence-grid">
        <section aria-labelledby="admin-database-title">
          <h2 id="admin-database-title">审计日志</h2>
          <div className="compact-list">
            {auditLogs.map((log) => (
              <article className="compact-row compact-row--five" key={log.id}>
                <strong>{log.tableName}</strong>
                <span>{auditActionLabel(log.action)}</span>
                <span>记录 {log.recordId}</span>
                <span>{log.actorUserId === null ? "系统触发" : `用户 ${log.actorUserId}`}</span>
                <span>{formatDisplayDate(log.createdAt)}</span>
              </article>
            ))}
          </div>
        </section>
        <section aria-labelledby="top-product-title">
          <h2 id="top-product-title">有效销量 Top 10</h2>
          <div className="compact-list">
            {topProducts.map((product) => (
              <article className="compact-row" key={product.productId}>
                <strong>{product.productName}</strong>
                <span>第 {product.salesRank} 名</span>
                <span>{product.soldQuantity} 件</span>
                <span>¥{product.salesAmount}</span>
              </article>
            ))}
          </div>
        </section>
      </div>
      <StatusMessage>{message}</StatusMessage>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className="status-badge">{statusLabel(status)}</span>;
}

function statusLabel(status: string): string {
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
  if (status === "DISABLED") {
    return "已停用";
  }
  if (status === "DRAFT") {
    return "草稿";
  }
  if (status === "PUBLISHED") {
    return "已上架";
  }
  if (status === "UNPUBLISHED") {
    return "已下架";
  }
  if (status === "ARCHIVED") {
    return "已归档";
  }
  if (status === "AVAILABLE") {
    return "可结算";
  }
  if (status === "UNAVAILABLE") {
    return "不可结算";
  }
  if (status === "PENDING_PAYMENT") {
    return "待支付";
  }
  if (status === "PAID") {
    return "已支付";
  }
  if (status === "PENDING_SHIPMENT") {
    return "待发货";
  }
  if (status === "SHIPPED") {
    return "已发货";
  }
  if (status === "COMPLETED") {
    return "已完成";
  }
  if (status === "CANCELED") {
    return "已取消";
  }
  if (status === "REFUNDED") {
    return "已退款";
  }
  return "已暂停";
}

function newCheckoutToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "00000000-0000-4000-8000-000000000000";
}

function formatDisplayDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function displayOrderCode(label: string, orderNo: string): string {
  return `${label} ${orderNo.slice(-6).toUpperCase()}`;
}

function auditActionLabel(action: string): string {
  if (action === "STATUS_CHANGE") {
    return "状态变更";
  }
  if (action === "INSERT") {
    return "新增记录";
  }
  if (action === "UPDATE") {
    return "更新记录";
  }
  return action;
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
