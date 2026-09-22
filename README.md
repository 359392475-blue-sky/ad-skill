# 广告 Skill · Ad Skill

探索由广告赞助支持 Agent 推理的开源原型。用户主动接受赞助，受控宿主为后续模型请求分配有限预算，记录广告事件、授信和模型成本，最后显示透明收据。

本仓库公开可独立运行的**无密钥沙箱核心**，并保留在 DeepSeek Harness 上验证过的宿主与界面集成源码。它不是“装一个 Prompt Skill 就能把任意 AI 的账单转给广告商”，也没有接通广告平台的真实流量或结算。

## 运行

需要 Node.js 22+。

```sh
npm install
npm test
npm run typecheck
npm run demo
```

演示无需账号、密钥或付费服务，不发送模型请求。它会创建一个宿主报价、模拟广告展示、校验进程内签名回调，输出 `signatureVerified: true` 和 `externalRevenueMicros: 0`。演示时钟的推进不代表真实观看行为。

## 代码

- `src/reward-quote.ts`：使用整数金额计算不可变报价、输入预留、输出上限与有效期。
- `src/tencent-gdt-sandbox.ts`：本地广告生命周期与 HMAC 签名核验；不是腾讯官方 SDK。
- `src/types.ts`：报价、广告事件、授信、预算池和透明收据的数据类型。
- `reference/host/`：完整宿主集成参考，包括显式接受/拒绝、预算准入、路由与幂等核销。
- `reference/client/`：React 广告卡、透明收据和状态界面参考。
- `docs/architecture.md`：业务与生产接入边界。

`reference/` 依赖 DeepSeek Harness 的 Cordis 服务、会话事件、LLM 和 Token Meter，不能作为独立 npm 包安装。运行上面的命令只验证可移植核心，不代表完整宿主已独立打包。参考界面中的本地演示视频未公开，集成时应提供自己有权使用的素材。

## 生产接入还需要什么

1. 独立的赞助网关和服务端模型凭据；浏览器不能持有付费密钥。
2. 持久预算池、原子预留、金额上限、过期、幂等核销与限频。
3. 获准的广告平台接入和可信服务端验真；前端播放结束不等于广告收入到账。
4. 真实价格与用量计费、隐私披露和授权素材。

这里的费率是固定示例，不能当作当前模型或广告价格。模拟广告价值、授信核销和实际现金收入分别记录。原始模型上下文不应发送给广告平台；用户拒绝赞助时应保留原有请求和路由。

## 来源与许可

MIT。核心和集成代码来自基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的本地赞助推理原型，保留 DeepSeek 原有版权声明。公开快照只包含本项目相关源码与说明，不包含私人密钥、会话、商业申请材料、品牌概念广告视频或原仓库历史。具体来源见 [NOTICE.md](NOTICE.md)。
