# @deepseek-ai/dsh-sponsor-demo

[English](README.md) | 中文

这是封闭式 sponsored inference（赞助推理）试点的显式启用 Host plugin（宿主插件）。它会追加一张明确标注的测试邀请，但不会等待、改写或代替当前 Agent（智能体）请求。用户不操作时，原 Provider（提供方）、模型、凭据路径、Context（上下文）拼接和回答流程全部保持不变。只有用户明确接受，才会为后续真实 Agent 请求创建一个有边界、仅当前 Session（会话）可用的 provisional credit grant（临时信用额度）；插件自己绝不代答。

卡片使用 `疯狂星期四概念广告`，并注明 `AI 生成测试素材，非官方、非真实合作`。这张概念素材不暗示与肯德基或任何广告主存在合作。赞助文案和全部 `sponsorship-demo/*` 事件都在模型可见的 `messages`、`system`、工具 schema（结构）、工具输入和推理内容之外。本包不保存 API Key（接口密钥），也不注册 LLM adapter（大模型适配器）；部署方必须提供服务端赞助路由。

## 生命周期与路由

1. 每个 Turn（轮次）的第一次普通 `agent/request` 由 Host 创建 `RewardQuote`（奖励报价）并追加邀请，然后立即返回原调用配置的等价副本。
2. Host 用自己签发的 `runId` 做稳定 hash（哈希），选择一个沙箱价值场景。Client（客户端）不能选择场景、提交 Token 数、替换 `quoteId`，不能在 `expiresAt` 之后接受，也不能接受已经结束的历史邀请。只有当前尚未结束的邀请，或精确匹配的 active recovery offer（有效恢复邀请）可以被接受／拒绝。
3. 接受前，Host 先计算 `reservedCreditMicros = min(maxEstimatedCostMicros, fundedBudgetMicros + operatorInputSubsidyMicros)`。`operatorInputSubsidyMicros` 是部署方为任务提供的运营保障上限，不是广告价值或额外输出 Token；offer 只记录应用单任务费用上限后的实际运营承担额。封闭试点 profile（配置）把该保障设为 ¥0.50 的 `maxEstimatedCostMicros` 上限，使每个被接受的报价都可以预留完整的单任务上限。完整预留必须覆盖当前 Token 估算和一个输出粒度，有限的进程内 Sponsor Fund（赞助预算池）也必须能够原子锁定整笔金额。`grant-unaffordable`（额度不可承担）或 `operator-pool-exhausted`（预算池不足）都会在 accepted decision（接受决定）、预留、grant（额度）和广告事件之前返回。校验成功后，预留才会绑定到同一报价与 Session。Host deadline timer（宿主到期计时器）会主动撤销过期临时额度并释放未使用预留，即使之后没有新请求也不会无限锁池；已经在运行的原请求绝不会被原地切换。
4. 到下一次普通 Agent 请求时，Host 用 `tokenMeter`（Token 计量器）测量现有 Session，再乘配置的安全系数，只在剩余池信用、`maxEstimatedCostMicros`、`maxTotalTokens`、剩余奖励 Token、步骤和单次上限都允许时放行输出。插件复制原调用，仅改变 `provider`、`model` 和受限的 `maxTokens`；按集成契约，原有 `messages`、`system` 和 `tools` 顺序与内容完全保持不变。
5. 专用 `llm/stream` guard（流式调用守卫）只接受精确匹配的 Session/Turn/Step 许可。没有许可的赞助流会 fail closed（安全拒绝），绝不静默切回用户原 Key 继续扣费。
6. 已接受额度一旦过期、耗尽或触发预算边界，同一个尚未结束的 `agent/request` 会等待独立的 recovery `conversation-card`，而不是先结束 Turn。接受会原子预留新额度，让该请求在不改变已组装 Context 的情况下重新执行准入；只有明确拒绝才会解除等待并使用已保存的原路由。过期或取消会结束等待，但不会扣用户原路由。Turn 结束后不能再接受恢复报价，Host 也不会在运行中给现有预留动态加款。
7. 模型提供方上报 usage 后会追加 `token-grant-consumed` 和 `operator-pool-spent`，扣减该额度已预留的配置成本信用与输出额度；事件记录预计输入、实际上报用量、剩余信用、Token 和步骤。如果赞助模型流仍在途，即使额度到期或插件销毁，`operator-pool-released` 也必须等这次消费与支出持久化后再追加。
8. 本地视频和腾讯沙箱核销都必须达到 Host 计时的至少 `adDurationMs`；过早完成统一返回 `ad-duration-incomplete`。腾讯路径还必须匹配同一个 `quoteId` 和 Host 保留的广告身份。验真成功后核销同一额度。广告失败会先追加 `ad-failure-recorded` 并关闭后续路由；它不会取消已经在途的模型流，也不会提前释放该流占用的信用。实际上报用量入账后，Host 才撤销未使用额度，并由 `operator-pool-released` 只退回剩余信用。

腾讯兼容路径仍是本地 contract simulation（契约模拟）：HMAC 密钥只存在于进程内；重复完成保持幂等；过早完成返回 `ad-duration-incomplete`；伪造报价、请求、渲染或曝光身份都会被拒绝。腾讯测试广告在这里**不会产生媒体结算收入**，每条账本事件都明确记录 `externalRevenueMicros: 0`。

## Host 动态报价

非零价值字段是 `simulatedAdValueMicros`（模拟单次广告价值），并固定标注 `pricingBasis: 'market-benchmark-simulated-ecpm'`（市场基准模拟 eCPM）。它是部署方为了验证业务公式而配置的市场基准模拟，不是腾讯报价、填充结果、账单或结算承诺。

默认演示价格快照：

该快照使用 2026-08-21 核对的 DeepSeek V4 Flash 官方高峰时段缓存未命中输入价和输出价；为保守准入，不假设更低的闲时价或缓存命中价。参见 [DeepSeek 模型价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)。

- `modelPricingSnapshotId`：`deepseek-v4-flash-2026-08-21-peak-cache-miss-cny`
- 高峰时段缓存未命中输入估算：¥3 / 百万 Token
- 高峰时段输出估算：¥9 / 百万 Token
- 预算池预发比例：模拟单次广告价值的 80%
- 初始输入预留：512 Token
- 输出额度：按 64 Token 向下取整

每个 Host 所选场景按下式计算：

```text
simulatedAdValueMicros = floor(marketBenchmarkEcpmMicros / 1000)
fundedBudgetMicros = floor(simulatedAdValueMicros * advanceRatioBps / 10000)
reservedCreditMicros = min(maxEstimatedCostMicros,
                           fundedBudgetMicros + operatorInputSubsidyMicros)
inputReserveMicros = ceil(inputReserveTokens * inputPriceMicrosPerMillionTokens / 1000000)
rawRewardTokens = floor((fundedBudgetMicros - inputReserveMicros) * 1000000
                        / outputPriceMicrosPerMillionTokens)
rewardTokens = clamp-and-round-down(rawRewardTokens, rewardTokenQuantum, min/max policy)
```

| 场景 | 市场基准模拟 eCPM | 模拟单次广告价值 | 80% 预发预算 | 动态输出额度 |
|---|---:|---:|---:|---:|
| `native-low` | ¥6 | ¥0.006 | ¥0.0048 | 320 Tokens |
| `native-medium` | ¥20 | ¥0.020 | ¥0.0160 | 1,600 Tokens |
| `video-high` | ¥45 | ¥0.045 | ¥0.0360 | 3,776 Tokens |

报价会冻结场景、价值元数据、模型价格快照、换算参数、输出额度、签发时间和过期时间。不变量要求 offer（邀请）、grant（额度）、广告证据、验真、核销／撤销、消费和 receipt（收据）全链路使用同一个 `quoteId`。

## 配置

所有价格与风险参数都是经过校验的部署配置，不是 Client 输入，也不是藏在逻辑里的固定魔数。

| 配置键 | 含义 | 默认值 |
|---|---|---:|
| `sponsorProvider` | 服务端专用赞助 Provider 别名 | `sponsor-demo-funded` |
| `sponsorModel` | 赞助路由模型 | `deepseek-v4-flash` |
| `maxSteps` | 每份额度允许的真实 Agent 调用数 | `3` |
| `maxOutputTokensPerRequest` | 单次赞助输出上限 | `4096` |
| `maxTotalTokens` | 已上报赞助输入与输出安全上限 | `131072` |
| `maxEstimatedCostMicros` | 单任务配置成本估算安全上限；封闭试点为 ¥0.50 | `500000` |
| `inputPriceMicrosPerMillionTokens` | 报价与用量的高峰缓存未命中输入估算价 | `3000000` |
| `outputPriceMicrosPerMillionTokens` | 报价与用量高峰输出估算价 | `9000000` |
| `modelPricingSnapshotId` | 固化的模型价格快照身份 | `deepseek-v4-flash-2026-08-21-peak-cache-miss-cny` |
| `sandboxAdScenarios` | 至少三档非零市场基准模拟 eCPM | ¥6 / ¥20 / ¥45 eCPM |
| `advanceRatioBps` | 预算池预发比例 | `8000`（80%） |
| `inputReserveTokens` | 报价阶段的演示输入预留 | `512` |
| `inputEstimateSafetyBps` | 运行前 Token 估算安全倍数 | `15000`（1.5×） |
| `rewardTokenQuantum` | 输出 Token 向下取整粒度 | `64` |
| `minRewardTokens` / `maxRewardTokens` | 允许的报价范围 | `64` / `16384` |
| `quoteTtlMs` | 报价可接受时长 | `300000` |
| `operatorPoolId` | 进程内沙箱赞助预算池身份 | `sponsor-demo-local-sandbox-pool` |
| `operatorPoolBudgetMicros` | 有限本地池总上限 | `1000000`（¥1） |
| `operatorInputSubsidyMicros` | 应用硬上限前叠加的运营方任务保障上限；offer 只记录实际承担额 | `0`（试点 profile：`500000`） |
| `grantTtlMs` | 已接受 Session 额度有效期 | `900000`（15 分钟） |
| `presentation` | `conversation-card` 或 `reasoning-card` | `reasoning-card` |
| `fundingMode` | 独立赞助凭据，或披露后的当前凭据模拟 | `dedicated-sponsor-credential` |
| `adProvider` | `local-video` 或 `tencent-gdt-sandbox` | `local-video` |
| `adDurationMs` | 内置本地素材时长 | `6000` |

## 信用准入与透明收据

`rewardTokens` 继续表示由广告价值换算的输出 Token 额度；`fundedBudgetMicros` 仍只表示广告贡献。配置中的 `operatorInputSubsidyMicros` 是运营方对任务的最高保障，offer 和收据展示实际应用金额：`max(0, reservedCreditMicros - fundedBudgetMicros)`。`reservedCreditMicros` 是应用单任务费用上限后，从运营方预算池锁定的完整模型调用信用。Host 会在接受前和赞助路由前计算：

```text
projectedInputTokens = ceil(tokenMeter.measure(session).totalTokens * inputEstimateSafetyBps / 10000)
projectedInputCostMicros = ceil(projectedInputTokens * inputPrice / 1000000)
affordableOutputTokens = floor((remainingCreditMicros - projectedInputCostMicros)
                               * 1000000 / outputPrice)
```

接受时要求 `reservedCreditMicros` 至少覆盖预计输入和一个 `rewardTokenQuantum`（奖励 Token 粒度）；失败会返回 typed error（类型化错误），且不会产生接受决定、广告或额度副作用。后续最终请求上限取以下几项的最小值：可承担的输出、剩余配置成本、扣除预计输入后的剩余总 Token、剩余奖励 Token、单次策略上限、Agent 原请求上限。如果当前额度无法准入，请求会保持打开，直到用户接受一份单独预留的恢复额度，或明确拒绝并返回已保存的原路由。Host 不会在运行中给现有预留动态加款。流式请求结束后，再按报价冻结的价格快照和提供方上报的输入／输出用量，从 grant 的完整 `remainingCreditMicros` 扣减。`operator-pool-reserved`、`operator-pool-spent` 和 `operator-pool-released` 让完整信用的本地预留／消费／释放守恒且可审计；所有终止路径都会释放未使用金额。透明收据记录是否接受赞助、报价、额度状态、路由／模型、用量、广告贡献、实际运营承担额、预算上限和配置成本估算。`actualCostMicros` 保持 `null`，因为精确费用只能由模型提供方或赞助网关上报。

## 装配与凭据

Host 注入 `commands`、`llm`、`sessions` 和 `tokenMeter`；配套 invariant（不变量）插件注入 `invariants`，由其注册的 installer（安装器）声明 `sessions` 依赖。本包刻意不提供 `sponsor-demo-funded` 的 adapter。部署必须通过现有服务端 adapter profile（适配器配置）或 gateway（网关）注册这个别名，并绑定独立的 Secret（密钥）引用，例如 `SPONSOR_DEEPSEEK_API_KEY`。测试只使用 fake adapter（模拟适配器），不读取任何凭据。

`fundingMode: dedicated-sponsor-credential`（独立赞助凭据）是安全默认值。`current-credential-simulation`（当前凭据模拟）只能证明路由和状态流，仍可能扣当前凭据费用，因此 UI 和收据必须如实披露。

## 模型体验

### 赞助路由

#### 模型会看到什么

模型看到的仍是 Agent Loop 原本组装的请求：相同顺序的 `messages`、`system` 提示词和 `tools`。只有后续请求边界的 `provider`、`model` 和受限 `maxTokens` 改变；赞助与广告字段绝不会被加入。

#### Token 影响

`sponsorship-demo/*` 事件给模型增加 0 个输入 Token。赞助请求前，Host 用 Session 的 Token 估算值和 1.5 倍安全系数预留输入信用、限制输出；之后按提供方上报用量和同一报价的配置估算价扣减信用。

#### KV Cache 影响

即使逻辑 Context 不变，更换 Provider alias 或模型也可能无法复用提供方侧 KV Cache（键值缓存）。用户不操作邀请时，原请求与缓存键保持不变。

## 已知限制与暂缓事项

- 两种广告实现和可见时长门禁目前都是本地模拟，不能证明腾讯审核通过、广告填充、真实播放凭证、可结算收入或到账。真实接入需要腾讯支持的 SDK／契约、服务端验真、反作弊和财务对账。
- 报价中的 512 Token 预留只是演示策略，不能保护长 Context。运行前会测量完整 Session 并乘 1.5 倍安全系数；无法承担的初始报价会在接受前被拒绝，后续额度耗尽则让原请求等待恢复选择。`tokenMeter` 仍是启发式估算，不是模型提供方的精确 tokenizer（分词器）或账单。
- 生产必须把“输出额度池近似”升级为由赞助网关强制执行的 `sponsorCreditMicros`（赞助货币信用）账本，使用精确 tokenizer 或足够保守的预检，并设置账户级硬成本上限。否则单次在途调用的实际费用仍可能超过本地估算。
- 有限 Sponsor Fund、额度、报价密钥和许可都只存在进程内；进程重启会把 ¥1 演示池重置。生产需要独立 gateway／数据库提供持久化、事务化的原子预留／消费／释放账本与一次性回调状态。
- 赞助 Provider alias 必须保持专用；任何没有精确许可的请求都必须 fail closed（安全拒绝）。
