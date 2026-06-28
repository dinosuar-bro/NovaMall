import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createPoolFromEnv } from "./db/pool.js";
import { MysqlSessionStore } from "./db/session-store.js";
import { AuthRepository } from "./modules/auth/auth.repository.js";
import { CatalogRepository } from "./modules/catalog/catalog.repository.js";
import { CheckoutRepository } from "./modules/checkout/checkout.repository.js";
import { MysqlHealthRepository } from "./modules/health/health.repository.js";
import { MerchantApplicationsRepository } from "./modules/merchant-applications/merchant-applications.repository.js";

const env = loadEnv();
const pool = createPoolFromEnv(env);
const authRepository = new AuthRepository(pool, env.PHONE_AES_KEY);
const merchantApplicationsRepository = new MerchantApplicationsRepository(pool);
const catalogRepository = new CatalogRepository(pool, env.UPLOAD_ROOT);
const checkoutRepository = new CheckoutRepository(pool, env.PHONE_AES_KEY);

const app = createApp({
  healthRepository: new MysqlHealthRepository(pool),
  authRepository,
  merchantApplicationsRepository,
  catalogRepository,
  checkoutRepository,
  sessionStore: new MysqlSessionStore(pool),
  sessionSecret: env.SESSION_SECRET,
  uploadRoot: env.UPLOAD_ROOT
});

const server = app.listen(env.API_PORT, () => {
  console.log(`NovaMall API 已启动：http://localhost:${env.API_PORT}`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`收到 ${signal}，正在关闭 NovaMall API`);
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
