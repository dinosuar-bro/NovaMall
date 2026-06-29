# Stage 6：阶段证据与交付准备闭环规格（已完成）

## 1. 阶段目标

在 Stage 5 最小业务演示闭环已完成的基础上，Stage 6 已补齐课程交付所需的真实证据、报告素材、演示脚本和阶段验收记录。本阶段不扩展新的电商业务能力，重点证明现有实现可复现、可解释、可验收。

Stage 6 是当前计划中的最后一个既定开发阶段，但不是项目终结；后续补充需求仍按“先判断是否服务课程验收，再补文档和最小实现”的规则继续推进。

## 2. 成功标准

- `docs/evidence/database/` 按 9 项高阶数据库技术拆分保存真实命令、SQL、输出和结论；
- 索引和全文检索证据包含数据规模、执行计划、计时和语义差异说明；
- 事务证据包含两连接并发抢最后库存；
- 审计证据证明成功 DML 自动记录、失败或回滚不留下虚假成功日志，并且敏感字段脱敏；
- AES 证据证明密文不可直接读取、正确密钥可授权解密、错误密钥不可得到有效手机号；
- README、API、部署、课程报告指南和验收文档与当前实现一致；
- 阶段演示脚本能从空环境启动并完成三角色主线和数据库技术展示；
- 全量质量门禁通过，未运行项必须明确标注原因。

## 3. 非目标

- 不新增优惠券、评价、推荐、真实支付、真实物流或复杂售后；
- 不新增第十项必做数据库技术；
- 不引入 ORM、Redis、Elasticsearch、消息队列或微服务；
- 不把数据库实验做成可输入任意 SQL 的前端控制台；
- 不虚构性能数字或用预期结果替代真实输出；
- 不把本阶段文档写成项目不再继续演进的终局说明。

## 4. 证据文件

证据文件固定为：

- `docs/evidence/database/01-存储过程.md`
- `docs/evidence/database/02-触发器.md`
- `docs/evidence/database/03-视图.md`
- `docs/evidence/database/04-索引优化.md`
- `docs/evidence/database/05-事务与并发控制.md`
- `docs/evidence/database/06-窗口函数.md`
- `docs/evidence/database/07-审计日志.md`
- `docs/evidence/database/08-全文检索.md`
- `docs/evidence/database/09-AES数据加密.md`

每个文件必须包含：环境、数据规模、命令或 SQL、实际输出、结论和限制。截图只能作为补充，不能替代可复制的文本证据。

## 5. 高阶数据库技术边界

本阶段继续围绕既定 9 项高阶数据库技术收集证据：

| 技术 | 业务落点 | 阶段 6 证据要求 |
|---|---|---|
| 存储过程 | 统一购物车结算 `sp_checkout_cart` | 输入、输出、回滚、幂等 |
| 触发器 | 价格历史、开店审核、商品、订单、角色审计 | 直接 DML 自动生成历史和审计 |
| 视图 | 会员订单明细、有效销量、履约汇总 | 与基础表查询结果一致 |
| 索引优化 | 商品、订单、审计和全文检索查询 | 数据规模、执行计划、计时 |
| 事务与并发控制 | 结算、支付、取消、履约、退款相关事务 | 两连接并发、回滚、无负库存 |
| 窗口函数 | 有效销量 Top 10 | 并列销量稳定排序 |
| 审计日志 | `audit_logs` | 成功记录、失败不伪记、敏感字段脱敏 |
| 全文检索 | 中文商品搜索 | ngram FULLTEXT 与 LIKE 对照 |
| AES 数据加密 | 用户、地址、订单手机号密文和 IV | 密文、授权解密、错误密钥 |

数据库用户权限、备份恢复、分区表和事件调度只作为报告扩展说明，不作为本阶段新增必做技术。

## 6. 验收命令

```bash
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm test
TEST_DATABASE_URL='mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test' CI=true pnpm test:integration
env -u CI ./node_modules/.bin/playwright test
CI=true pnpm build
docker compose config
git diff --check
```

涉及前端静态资源或后端镜像内容变化时，验证后需要执行：

```bash
docker compose up --build -d
```

## 7. 文档同步范围

阶段完成时至少同步：

- `docs/development-plan.md` 的 Stage 6 状态；
- `docs/testing-and-acceptance.md` 的阶段验收与最终演示说明；
- `docs/course-report-guide.md` 的证据引用；
- `docs/api.md` 的最终演示相关 API；
- `docs/deployment.md` 的启动、种子、备份和演示说明；
- `README.md` 的当前阶段能力说明；
- `docs/final-demo-script.md` 的阶段演示脚本。

## 8. 完成状态

- `docs/evidence/database/` 已按 9 项高阶数据库技术拆分证据，并保留环境、数据规模、SQL、输出、结论和限制；
- `docs/final-demo-script.md` 已覆盖三角色主线、购物车确认结算、订单履约和数据库证据展示；
- README、API、部署、课程报告指南、UI 设计、验收文档和阶段文档已同步当前实现；
- 阶段门禁已完成 lint、typecheck、单元测试、集成测试、Playwright E2E、构建、Docker 重建和健康检查。
