/**
 * Explicit, non-blocking sponsored-route pilot.
 *
 * The plugin owns consent, local ad evidence, a bounded session quota, and
 * request routing. It deliberately owns no model adapter and never constructs
 * model-visible text: a deployment supplies a dedicated provider alias whose
 * credential remains inside the existing Host credential boundary.
 *
 * @module @deepseek-ai/dsh-sponsor-demo
 */

import { randomUUID } from 'node:crypto'
import type { Context, Events } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { isAgentLoopRequest, LlmError } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmCallConfig,
  StreamChunk,
  TokenUsage,
} from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent, TurnEndReason } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-token-meter'
import type {
  SponsorDemoAdFailureRecordedData,
  SponsorDemoAdImpressionData,
  SponsorDemoAdFailureReason,
  SponsorDemoAdLoadedData,
  SponsorDemoAdProvider,
  SponsorDemoAdRenderedData,
  SponsorDemoAdRevenueData,
  SponsorDemoAdVerificationReceivedData,
  SponsorDemoControlResult,
  SponsorDemoControlState,
  SponsorDemoDecision,
  SponsorDemoOperatorPoolReleasedData,
  SponsorDemoOperatorPoolReleaseReason,
  SponsorDemoOperatorPoolReservedData,
  SponsorDemoOperatorPoolSpentData,
  SponsorDemoPlaybackStartedData,
  SponsorDemoReceiptData,
  SponsorDemoReceiptStatus,
  SponsorDemoRewardQuoteData,
  SponsorDemoRewardIssuedData,
  SponsorDemoTokenGrantConsumedData,
  SponsorDemoTokenGrantIssuedData,
  SponsorDemoTokenGrantRevocationReason,
  SponsorDemoTokenGrantRevokedData,
  SponsorDemoTokenGrantSettledData,
} from './types.ts'
import {
  DEFAULT_SANDBOX_AD_SCENARIOS,
  SponsorDemoRewardQuoteService,
} from './reward-quote.ts'
import type { SponsorDemoSandboxAdScenario } from './reward-quote.ts'
import {
  TENCENT_GDT_SANDBOX_CREATIVE_ID,
  TENCENT_GDT_SANDBOX_FORMAT,
  TENCENT_GDT_SANDBOX_PROVIDER,
  TencentGdtSandboxProvider,
} from './tencent-gdt-sandbox.ts'
import type { TencentGdtSandboxVerificationCallback } from './tencent-gdt-sandbox.ts'

export type * from './types.ts'
export * from './reward-quote.ts'

export const name = 'sponsor-demo'
export const inject = ['commands', 'llm', 'sessions', 'tokenMeter']

/** Dedicated example route. No adapter is registered by this package. */
export const SPONSOR_DEMO_PROVIDER = 'sponsor-demo-funded'
/** Example sponsored model served by the deployment-owned route. */
export const SPONSOR_DEMO_MODEL = 'deepseek-v4-flash'
/** Test brand required by the closed-pilot disclosure. */
export const SPONSOR_DEMO_NAME = '示例赞助广告'
/** Disclosure that prevents the test card from implying a real partnership. */
export const SPONSOR_DEMO_DISCLOSURE = '本地测试素材，不代表任何真实商业合作'
/** Packaged, network-free motion asset used by the browser pilot. */
export const SPONSOR_DEMO_ASSET_ID = 'sponsor-demo-motion-v1'

const CURRENCY = 'CNY' as const
const COMMAND = 'sponsor-demo'
const MICROS_PER_UNIT = 1_000_000

/** Deployment-owned consent, route, and quota limits. */
export interface Config {
  /** Dedicated server-side provider alias that owns the sponsor credential. */
  sponsorProvider?: string
  /** Model served by the dedicated sponsor provider alias. */
  sponsorModel?: string
  /** Maximum real Agent calls admitted by one provisional or redeemed grant. */
  maxSteps?: number
  /** Maximum output tokens admitted for any one sponsored request. */
  maxOutputTokensPerRequest?: number
  /** Maximum measured input plus output usage before the grant is retired. */
  maxTotalTokens?: number
  /** Maximum configured cost estimate before the grant is retired. */
  maxEstimatedCostMicros?: number
  /** Configured input price in one-millionth CNY per one million tokens. */
  inputPriceMicrosPerMillionTokens?: number
  /** Configured output price in one-millionth CNY per one million tokens. */
  outputPriceMicrosPerMillionTokens?: number
  /** Deployment-owned identity for the immutable model-price snapshot. */
  modelPricingSnapshotId?: string
  /** Browser surface used by the offer. */
  presentation?: 'conversation-card' | 'reasoning-card'
  /** Transparent funding disclosure; simulation mode may still bill the current credential. */
  fundingMode?: 'dedicated-sponsor-credential' | 'current-credential-simulation'
  /** Host-selected local advertising implementation. */
  adProvider?: SponsorDemoAdProvider
  /** At least three nonzero market-benchmark sandbox eCPM scenarios. */
  sandboxAdScenarios?: SponsorDemoSandboxAdScenario[]
  /** Simulated advertising value advanced from the operator pool, in basis points. */
  advanceRatioBps?: number
  /** Demonstration-only input reserve applied before output-token conversion. */
  inputReserveTokens?: number
  /** Safety multiplier applied to token-meter projected input, in basis points. */
  inputEstimateSafetyBps?: number
  /** Output-token rounding quantum applied downward. */
  rewardTokenQuantum?: number
  /** Minimum Host quote allowed for every configured sandbox scenario. */
  minRewardTokens?: number
  /** Maximum Host quote allowed for any configured sandbox scenario. */
  maxRewardTokens?: number
  /** Time during which a Host-issued quote may be accepted. */
  quoteTtlMs?: number
  /** Process-local finite sandbox Sponsor Fund identity. */
  operatorPoolId?: string
  /** Total process-local sandbox Sponsor Fund credit, in one-millionth CNY. */
  operatorPoolBudgetMicros?: number
  /** Maximum operator-funded run credit added before the per-run cost cap. */
  operatorInputSubsidyMicros?: number
  /** Lifetime of an accepted session-scoped grant. */
  grantTtlMs?: number
  /** Duration of the packaged local test video. */
  adDurationMs?: number
}

interface ResolvedConfig {
  sponsorProvider: string
  sponsorModel: string
  maxSteps: number
  maxOutputTokensPerRequest: number
  maxTotalTokens: number
  maxEstimatedCostMicros: number
  inputPriceMicrosPerMillionTokens: number
  outputPriceMicrosPerMillionTokens: number
  modelPricingSnapshotId: string
  presentation: 'conversation-card' | 'reasoning-card'
  fundingMode: 'dedicated-sponsor-credential' | 'current-credential-simulation'
  adProvider: SponsorDemoAdProvider
  sandboxAdScenarios: SponsorDemoSandboxAdScenario[]
  advanceRatioBps: number
  inputReserveTokens: number
  inputEstimateSafetyBps: number
  rewardTokenQuantum: number
  minRewardTokens: number
  maxRewardTokens: number
  quoteTtlMs: number
  operatorPoolId: string
  operatorPoolBudgetMicros: number
  operatorInputSubsidyMicros: number
  grantTtlMs: number
  adDurationMs: number
}

/** Loader schema for the closed-pilot route and limits. */
export const Config: z<Config> = z.object({
  sponsorProvider: z.string().default(SPONSOR_DEMO_PROVIDER),
  sponsorModel: z.string().default(SPONSOR_DEMO_MODEL),
  maxSteps: z.number().step(1).min(1).default(3),
  maxOutputTokensPerRequest: z.number().step(1).min(1).default(4_096),
  maxTotalTokens: z.number().step(1).min(1).default(131_072),
  maxEstimatedCostMicros: z.number().step(1).min(1).default(500_000),
  inputPriceMicrosPerMillionTokens: z.number().step(1).min(0).default(3_000_000),
  outputPriceMicrosPerMillionTokens: z.number().step(1).min(1).default(9_000_000),
  modelPricingSnapshotId: z.string().default(
    'deepseek-v4-flash-2026-08-21-peak-cache-miss-cny',
  ),
  presentation: z.union(['conversation-card', 'reasoning-card'] as const).default('reasoning-card'),
  fundingMode: z.union([
    'dedicated-sponsor-credential', 'current-credential-simulation',
  ] as const).default('dedicated-sponsor-credential'),
  adProvider: z.union(['local-video', 'tencent-gdt-sandbox'] as const).default('local-video'),
  sandboxAdScenarios: z.array(z.object({
    scenarioId: z.string(),
    marketBenchmarkEcpmMicros: z.number().step(1).min(1_000),
  })).default(DEFAULT_SANDBOX_AD_SCENARIOS.map(scenario => ({ ...scenario }))),
  advanceRatioBps: z.number().step(1).min(1).max(10_000).default(8_000),
  inputReserveTokens: z.number().step(1).min(0).default(512),
  inputEstimateSafetyBps: z.number().step(1).min(10_000).max(100_000).default(15_000),
  rewardTokenQuantum: z.number().step(1).min(1).default(64),
  minRewardTokens: z.number().step(1).min(1).default(64),
  maxRewardTokens: z.number().step(1).min(1).default(16_384),
  quoteTtlMs: z.number().step(1).min(1).default(300_000),
  operatorPoolId: z.string().default('sponsor-demo-local-sandbox-pool'),
  operatorPoolBudgetMicros: z.number().step(1).min(1).default(1_000_000),
  operatorInputSubsidyMicros: z.number().step(1).min(0).default(0),
  grantTtlMs: z.number().step(1).min(1).default(900_000),
  adDurationMs: z.number().step(1).min(1).default(6_000),
})

interface RunState {
  readonly runId: string
  readonly agent: Agent
  readonly turn: number
  readonly offerStep: number
  readonly baseline: LlmCallConfig
  readonly rewardQuote: SponsorDemoRewardQuoteData
  readonly baselineSteps: Set<number>
  readonly baselineUsage: Map<number, { inputTokens: number; outputTokens: number }>
  readonly sponsoredSteps: Set<number>
  decision?: SponsorDemoDecision
  decisionEventSeq?: number
  sponsorCalls: number
  baselineInputTokens: number
  baselineOutputTokens: number
  sponsorInputTokens: number
  sponsorOutputTokens: number
  capped: boolean
  receiptWritten: boolean
  /** Recovery offers remain actionable while the blocked request waits. */
  recovery: boolean
  playback?: SponsorDemoPlaybackStartedData
  reward?: SponsorDemoRewardIssuedData
  adLoaded?: SponsorDemoAdLoadedData
  adRendered?: SponsorDemoAdRenderedData
  adImpression?: SponsorDemoAdImpressionData
  adRevenue?: SponsorDemoAdRevenueData
  tokenGrant?: SponsorDemoTokenGrantIssuedData
  adVerification?: SponsorDemoAdVerificationReceivedData
  tokenSettlement?: SponsorDemoTokenGrantSettledData
  tokenRevocation?: SponsorDemoTokenGrantRevokedData
  adFailure?: SponsorDemoAdFailureRecordedData
  pendingRevocationReason?: SponsorDemoTokenGrantRevocationReason
}

interface QuotaGrant {
  readonly grantId: string
  readonly source: RunState
  readonly requestedLocations: Set<string>
  status: 'provisional' | 'redeemed' | 'revoked'
  routingClosed: boolean
  routingCloseReason?: SponsorDemoOperatorPoolReleaseReason
  poolReleased: boolean
  reservedCreditMicros: number
  spentCreditMicros: number
  remainingTokens: number
  remainingCreditMicros: number
  remainingSteps: number
  expiresAtMs: number
  expiryTimer?: ReturnType<typeof setTimeout>
}

interface OperatorPoolState {
  readonly poolId: string
  readonly budgetMicros: number
  availableMicros: number
}

interface RequestPermit {
  readonly grant: QuotaGrant
  readonly turn: number
  readonly step: number
  readonly projectedInputTokens: number
  readonly projectedInputCostMicros: number
  consumed: boolean
}

type RecoveryChoice = 'accepted' | 'declined' | 'expired' | 'cancelled'

interface PendingRecoveryChoice {
  readonly runId: string
  readonly promise: Promise<RecoveryChoice>
  readonly resolve: (choice: RecoveryChoice) => void
  readonly expiryTimer: ReturnType<typeof setTimeout>
}

interface PerSessionState {
  current?: RunState
  /** Recent runs remain addressable so accepted playback may finish after its task. */
  readonly runs: Map<string, RunState>
  /** Provisional or redeemed grants are queued and remain bound to this exact Agent session. */
  readonly grants: QuotaGrant[]
  /** All grant state remains addressable until advertising settlement or revocation. */
  readonly quotas: Map<string, QuotaGrant>
  readonly grantIds: Set<string>
  /** Once an accepted grant closes, baseline routing requires a new explicit choice. */
  requiresExplicitSponsorChoice: boolean
  /** Pending replacement offer presented while baseline routing is blocked. */
  blockedOfferRunId?: string
  /** One blocked Agent request waits on the exact replacement offer. */
  pendingRecoveryChoice?: PendingRecoveryChoice
  /** Pre-sponsor call configuration restored only at a later real request boundary. */
  restoreBaseline?: LlmCallConfig
  permit?: RequestPermit
}

type SponsorDemoControlAction =
  | 'accept'
  | 'decline'
  | 'start'
  | 'complete'
  | 'load-ad'
  | 'render-ad'
  | 'record-ad-impression'
  | 'fail-ad'

interface SponsorDemoControlDriver {
  perform(
    agent: Agent,
    action: SponsorDemoControlAction,
    runId: string,
    opaqueId?: string,
    failureReason?: SponsorDemoAdFailureReason,
  ): SponsorDemoControlResult
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host-owned control plane for one exact simulated sponsorship run. */
    sponsorDemo: SponsorDemoRemoteService
  }
}

/** Typed Host Remote exposing only fixed sponsorship state transitions. */
export class SponsorDemoRemoteService extends TypertRemoteService {
  constructor(ctx: Context, private readonly driver: SponsorDemoControlDriver) {
    super(ctx, 'sponsorDemo')
  }

  /**
   * Accept one pending offer and synchronously activate its provisional quota.
   * @param agent - Agent that owns the run; the Remote gateway resolves it from the Session identity.
   * @param runId - Host-issued run identity.
   * @returns The accepted transition or a typed refusal without changing another run.
   */
  @Remote
  accept(agent: Agent, runId: string): SponsorDemoControlResult {
    return this.driver.perform(agent, 'accept', runId)
  }

  /**
   * Decline one pending offer without changing the Agent's baseline route.
   * @param agent - Agent that owns the run; the Remote gateway resolves it from the Session identity.
   * @param runId - Host-issued run identity.
   * @returns The declined transition or a typed refusal without creating quota.
   */
  @Remote
  decline(agent: Agent, runId: string): SponsorDemoControlResult {
    return this.driver.perform(agent, 'decline', runId)
  }

  /**
   * Record admission of the packaged local-video playback after explicit consent.
   * @param agent - Agent that owns the run; the Remote gateway resolves it from the Session identity.
   * @param runId - Host-issued run identity.
   * @returns The idempotent playback transition or a typed refusal.
   */
  @Remote
  start(agent: Agent, runId: string): SponsorDemoControlResult {
    return this.driver.perform(agent, 'start', runId)
  }

  /**
   * Settle a completed packaged local video against its provisional quota.
   * @param agent - Agent that owns the run; the Remote gateway resolves it from the Session identity.
   * @param runId - Host-issued run identity.
   * @returns The idempotent reward transition or a typed refusal.
   */
  @Remote
  complete(agent: Agent, runId: string): SponsorDemoControlResult {
    return this.driver.perform(agent, 'complete', runId)
  }

  /**
   * Allocate Host-owned request and creative identities for the Tencent-compatible local sandbox.
   * @param agent - Agent that owns the run; the Remote gateway resolves it from the Session identity.
   * @param runId - Host-issued run identity.
   * @returns The load transition and opaque request identity, or a typed refusal.
   */
  @Remote
  loadAd(agent: Agent, runId: string): SponsorDemoControlResult {
    return this.driver.perform(agent, 'load-ad', runId)
  }

  /**
   * Admit rendering only for the opaque sandbox request allocated to this run.
   * @param agent - Agent that owns the run; the Remote gateway resolves it from the Session identity.
   * @param runId - Host-issued run identity.
   * @param requestId - Opaque request identity returned by {@link loadAd}.
   * @returns The idempotent render transition or a typed refusal.
   */
  @Remote
  renderAd(agent: Agent, runId: string, requestId: string): SponsorDemoControlResult {
    return this.driver.perform(agent, 'render-ad', runId, requestId)
  }

  /**
   * Record the sandbox impression, verify its simulated callback, and redeem provisional quota once.
   * @param agent - Agent that owns the run; the Remote gateway resolves it from the Session identity.
   * @param runId - Host-issued run identity.
   * @param requestId - Opaque request identity returned by {@link loadAd}.
   * @returns The idempotent impression and settlement transition, or a typed refusal.
   */
  @Remote
  recordAdImpression(agent: Agent, runId: string, requestId: string): SponsorDemoControlResult {
    return this.driver.perform(agent, 'record-ad-impression', runId, requestId)
  }

  /**
   * Report a fixed local advertising failure and revoke only unspent provisional quota.
   * @param agent - Agent that owns the run; the Remote gateway resolves it from the Session identity.
   * @param runId - Host-issued run identity.
   * @param reason - Host-recognized failure category; arbitrary Client text is never persisted.
   * @returns The idempotent revocation transition or a typed refusal.
   */
  @Remote
  failAd(agent: Agent, runId: string, reason: SponsorDemoAdFailureReason): SponsorDemoControlResult {
    return this.driver.perform(agent, 'fail-ad', runId, undefined, reason)
  }
}

function controlSuccess(
  state: SponsorDemoControlState,
  sourceEventSeq: number,
  opaqueId?: string,
): SponsorDemoControlResult {
  return Object.freeze({
    ok: true,
    state,
    sourceEventSeq,
    ...(opaqueId === undefined ? {} : { opaqueId }),
  })
}

function controlFailure(
  code: Extract<SponsorDemoControlResult, { ok: false }>['code'],
  message: string,
): SponsorDemoControlResult {
  return Object.freeze({ ok: false, code, message })
}

function commandSuccessText(state: SponsorDemoControlState): string {
  switch (state) {
    case 'accepted': return 'Local simulated sponsorship accepted and provisional quota issued; the current request remains unchanged.'
    case 'declined': return 'Simulated sponsorship declined; the original route remains unchanged.'
    case 'playback-started': return 'Local simulated rewarded playback started.'
    case 'playback-already-started': return 'That local test playback is already active.'
    case 'reward-issued': return 'Local playback verified and its provisional quota redeemed.'
    case 'reward-already-issued': return 'That local test reward was already issued.'
    case 'ad-loaded': return 'Tencent-compatible local sandbox ad loaded.'
    case 'ad-already-loaded': return 'That local sandbox ad is already loaded.'
    case 'ad-rendered': return 'Tencent-compatible local sandbox ad rendered.'
    case 'ad-already-rendered': return 'That local sandbox ad is already rendered.'
    case 'ad-impression-recorded': return 'Local sandbox impression verified and its provisional quota redeemed.'
    case 'ad-impression-already-recorded': return 'That local sandbox impression was already recorded.'
    case 'ad-failed': return 'The unspent provisional quota was revoked after a local advertising failure.'
    case 'ad-failure-already-recorded': return 'That local advertising failure was already recorded.'
    default: {
      const unreachable: never = state
      throw new TypeError(`sponsor-demo: unknown control state ${String(unreachable)}`)
    }
  }
}

function resolvedConfig(config: Config): ResolvedConfig {
  const allowed = new Set([
    'sponsorProvider', 'sponsorModel', 'maxSteps', 'maxOutputTokensPerRequest',
    'maxTotalTokens', 'maxEstimatedCostMicros', 'inputPriceMicrosPerMillionTokens',
    'outputPriceMicrosPerMillionTokens', 'modelPricingSnapshotId', 'presentation', 'fundingMode',
    'adProvider', 'sandboxAdScenarios', 'advanceRatioBps', 'inputReserveTokens',
    'inputEstimateSafetyBps', 'rewardTokenQuantum', 'minRewardTokens', 'maxRewardTokens',
    'quoteTtlMs', 'operatorPoolId', 'operatorPoolBudgetMicros',
    'operatorInputSubsidyMicros', 'grantTtlMs', 'adDurationMs',
  ])
  for (const key of Object.keys(config)) {
    if (!allowed.has(key)) throw new Error(`sponsor-demo: unknown config key "${key}"`)
  }
  const nonEmpty = (value: unknown, fallback: string, field: string): string => {
    const result = value ?? fallback
    if (typeof result !== 'string' || result.trim().length === 0) {
      throw new Error(`sponsor-demo: ${field} must be non-empty`)
    }
    return result
  }
  const integer = (value: unknown, fallback: number, field: string, min: number): number => {
    const result = value ?? fallback
    if (typeof result !== 'number' || !Number.isSafeInteger(result) || result < min) {
      throw new Error(`sponsor-demo: ${field} must be a safe integer >= ${min}`)
    }
    return result
  }
  const presentation = config.presentation ?? 'reasoning-card'
  const presentations: readonly unknown[] = ['conversation-card', 'reasoning-card']
  if (!presentations.includes(presentation)) {
    throw new Error('sponsor-demo: presentation must be conversation-card or reasoning-card')
  }
  const adProvider = config.adProvider ?? 'local-video'
  const adProviders: readonly unknown[] = ['local-video', TENCENT_GDT_SANDBOX_PROVIDER]
  if (!adProviders.includes(adProvider)) {
    throw new Error('sponsor-demo: adProvider must be local-video or tencent-gdt-sandbox')
  }
  const fundingMode = config.fundingMode ?? 'dedicated-sponsor-credential'
  const fundingModes: readonly unknown[] = [
    'dedicated-sponsor-credential', 'current-credential-simulation',
  ]
  if (!fundingModes.includes(fundingMode)) {
    throw new Error('sponsor-demo: fundingMode must be dedicated-sponsor-credential or current-credential-simulation')
  }
  const scenarioInput = config.sandboxAdScenarios ?? DEFAULT_SANDBOX_AD_SCENARIOS
  if (!Array.isArray(scenarioInput)) {
    throw new Error('sponsor-demo: sandboxAdScenarios must be an array')
  }
  const sandboxAdScenarios = scenarioInput
    .map((scenario: unknown, index): SponsorDemoSandboxAdScenario => {
      if (typeof scenario !== 'object' || scenario === null || Array.isArray(scenario)) {
        throw new Error(`sponsor-demo: sandboxAdScenarios[${String(index)}] must be an object`)
      }
      const fields = scenario as Record<string, unknown>
      return {
        scenarioId: nonEmpty(fields.scenarioId, '', `sandboxAdScenarios[${String(index)}].scenarioId`),
        marketBenchmarkEcpmMicros: integer(
          fields.marketBenchmarkEcpmMicros,
          0,
          `sandboxAdScenarios[${String(index)}].marketBenchmarkEcpmMicros`,
          1_000,
        ),
      }
    })
  const result: ResolvedConfig = {
    sponsorProvider: nonEmpty(config.sponsorProvider, SPONSOR_DEMO_PROVIDER, 'sponsorProvider'),
    sponsorModel: nonEmpty(config.sponsorModel, SPONSOR_DEMO_MODEL, 'sponsorModel'),
    maxSteps: integer(config.maxSteps, 3, 'maxSteps', 1),
    maxOutputTokensPerRequest: integer(
      config.maxOutputTokensPerRequest, 4_096, 'maxOutputTokensPerRequest', 1,
    ),
    maxTotalTokens: integer(config.maxTotalTokens, 131_072, 'maxTotalTokens', 1),
    maxEstimatedCostMicros: integer(
      config.maxEstimatedCostMicros, 500_000, 'maxEstimatedCostMicros', 1,
    ),
    inputPriceMicrosPerMillionTokens: integer(
      config.inputPriceMicrosPerMillionTokens, 3_000_000,
      'inputPriceMicrosPerMillionTokens', 0,
    ),
    outputPriceMicrosPerMillionTokens: integer(
      config.outputPriceMicrosPerMillionTokens, 9_000_000,
      'outputPriceMicrosPerMillionTokens', 1,
    ),
    modelPricingSnapshotId: nonEmpty(
      config.modelPricingSnapshotId,
      'deepseek-v4-flash-2026-08-21-peak-cache-miss-cny',
      'modelPricingSnapshotId',
    ),
    presentation,
    fundingMode,
    adProvider,
    sandboxAdScenarios,
    advanceRatioBps: integer(config.advanceRatioBps, 8_000, 'advanceRatioBps', 1),
    inputReserveTokens: integer(config.inputReserveTokens, 512, 'inputReserveTokens', 0),
    inputEstimateSafetyBps: integer(
      config.inputEstimateSafetyBps,
      15_000,
      'inputEstimateSafetyBps',
      10_000,
    ),
    rewardTokenQuantum: integer(config.rewardTokenQuantum, 64, 'rewardTokenQuantum', 1),
    minRewardTokens: integer(config.minRewardTokens, 64, 'minRewardTokens', 1),
    maxRewardTokens: integer(config.maxRewardTokens, 16_384, 'maxRewardTokens', 1),
    quoteTtlMs: integer(config.quoteTtlMs, 300_000, 'quoteTtlMs', 1),
    operatorPoolId: nonEmpty(
      config.operatorPoolId,
      'sponsor-demo-local-sandbox-pool',
      'operatorPoolId',
    ),
    operatorPoolBudgetMicros: integer(
      config.operatorPoolBudgetMicros,
      1_000_000,
      'operatorPoolBudgetMicros',
      1,
    ),
    operatorInputSubsidyMicros: integer(
      config.operatorInputSubsidyMicros,
      0,
      'operatorInputSubsidyMicros',
      0,
    ),
    grantTtlMs: integer(config.grantTtlMs, 900_000, 'grantTtlMs', 1),
    adDurationMs: integer(config.adDurationMs, 6_000, 'adDurationMs', 1),
  }
  if (result.advanceRatioBps > 10_000) {
    throw new Error('sponsor-demo: advanceRatioBps must not exceed 10000')
  }
  if (result.inputEstimateSafetyBps > 100_000) {
    throw new Error('sponsor-demo: inputEstimateSafetyBps must not exceed 100000')
  }
  if (result.minRewardTokens > result.maxRewardTokens) {
    throw new Error('sponsor-demo: minRewardTokens must not exceed maxRewardTokens')
  }
  if (result.maxRewardTokens > result.maxTotalTokens) {
    throw new Error('sponsor-demo: maxRewardTokens must not exceed maxTotalTokens')
  }
  return result
}

function cloneCallConfig(config: LlmCallConfig): LlmCallConfig {
  return structuredClone(config)
}

function estimateCostMicros(
  inputTokens: number,
  outputTokens: number,
  quote: SponsorDemoRewardQuoteData,
): number {
  return Math.ceil(inputTokens * quote.inputPriceMicrosPerMillionTokens / MICROS_PER_UNIT)
    + Math.ceil(outputTokens * quote.outputPriceMicrosPerMillionTokens / MICROS_PER_UNIT)
}

function statusFor(run: RunState, reason: TurnEndReason): SponsorDemoReceiptStatus {
  if (run.decision === 'declined') return 'declined'
  if (run.capped || reason.kind === 'max-tokens') return 'capped'
  if (run.decision === 'cancelled' || run.decision === 'expired' || reason.kind === 'aborted') return 'cancelled'
  if (reason.kind === 'error') return 'failed'
  return 'completed'
}

function receiptFor(
  run: RunState,
  reason: TurnEndReason,
  config: ResolvedConfig,
): SponsorDemoReceiptData {
  const sponsorshipUsed = run.sponsorCalls > 0
  const inputTokens = sponsorshipUsed ? run.sponsorInputTokens : run.baselineInputTokens
  const outputTokens = sponsorshipUsed ? run.sponsorOutputTokens : run.baselineOutputTokens
  const adLedger = run.adLoaded !== undefined
    && run.adRendered !== undefined
    && run.adImpression !== undefined
    && run.adRevenue !== undefined
    && run.tokenGrant !== undefined
    && run.adVerification !== undefined
    && run.tokenSettlement !== undefined
    ? {
      adProvider: run.adLoaded.adProvider,
      adFormat: run.adLoaded.adFormat,
      requestId: run.adLoaded.requestId,
      creativeId: run.adLoaded.creativeId,
      renderId: run.adRendered.renderId,
      impressionId: run.adImpression.impressionId,
      revenueEventId: run.adRevenue.revenueEventId,
      quoteId: run.adRevenue.quoteId,
      revenueKind: run.adRevenue.revenueKind,
      pricingBasis: run.adRevenue.pricingBasis,
      simulatedAdValueMicros: run.adRevenue.simulatedAdValueMicros,
      externalRevenueMicros: run.adRevenue.externalRevenueMicros,
      grantId: run.tokenGrant.grantId,
      grantedTokens: run.tokenGrant.grantedTokens,
      callbackId: run.adVerification.callbackId,
      signatureKind: run.adVerification.signatureKind,
      settlementStatus: run.tokenSettlement.settlementStatus,
    } as const
    : undefined
  const grantStatus = run.tokenSettlement !== undefined
    ? 'redeemed' as const
    : run.tokenRevocation !== undefined
      ? 'revoked' as const
      : run.tokenGrant !== undefined
        ? 'provisional' as const
        : 'not-issued' as const
  return {
    runId: run.runId,
    turn: run.turn,
    status: statusFor(run, reason),
    sponsorshipUsed,
    provider: sponsorshipUsed ? config.sponsorProvider : run.baseline.provider,
    model: sponsorshipUsed ? config.sponsorModel : run.baseline.model,
    stepsUsed: sponsorshipUsed ? run.sponsorCalls : run.baselineSteps.size,
    inputTokens,
    outputTokens,
    maxSteps: config.maxSteps,
    maxOutputTokensPerRequest: config.maxOutputTokensPerRequest,
    maxTotalTokens: config.maxTotalTokens,
    maxEstimatedCostMicros: config.maxEstimatedCostMicros,
    estimatedCostMicros: sponsorshipUsed
      ? estimateCostMicros(inputTokens, outputTokens, run.rewardQuote)
      : 0,
    actualCostMicros: null,
    currency: CURRENCY,
    costKind: sponsorshipUsed ? 'configured-estimate' : 'unavailable',
    fundingMode: config.fundingMode,
    rewardQuote: run.rewardQuote,
    rewardTokenCap: run.rewardQuote.rewardTokens,
    rewardIssued: run.reward !== undefined,
    watchedMs: run.reward?.watchedMs ?? 0,
    grantedTokens: run.tokenGrant?.grantedTokens ?? 0,
    grantStatus,
    redeemedTokens: run.tokenSettlement?.redeemedTokens ?? 0,
    revokedTokens: run.tokenRevocation?.revokedTokens ?? 0,
    ...(adLedger === undefined ? {} : { adLedger }),
  }
}

function settleDecision(
  run: RunState,
  decision: SponsorDemoDecision,
): SessionEvent<'sponsorship-demo/decision'> | undefined {
  if (run.decision !== undefined) return undefined
  const event = run.agent.session.append('sponsorship-demo/decision', {
    runId: run.runId,
    turn: run.turn,
    decision,
  })
  run.decision = decision
  run.decisionEventSeq = event.seq
  return event
}

function recordBaselineUsage(run: RunState, step: number, usage: TokenUsage): void {
  const previous = run.baselineUsage.get(step) ?? { inputTokens: 0, outputTokens: 0 }
  const next = {
    inputTokens: usage.inputTokens
      + (usage.cacheReadTokens ?? 0)
      + (usage.cacheWriteTokens ?? 0),
    outputTokens: usage.outputTokens,
  }
  run.baselineInputTokens += next.inputTokens - previous.inputTokens
  run.baselineOutputTokens += next.outputTokens - previous.outputTokens
  run.baselineUsage.set(step, next)
  run.baselineSteps.add(step)
}

function openLocation(session: Session): { turn: number; step: number } | undefined {
  const turnBoundary = session.events.findLast(event =>
    event.type === 'turn/start' || event.type === 'turn/end')
  const stepBoundary = session.events.findLast(event =>
    event.type === 'step/start' || event.type === 'step/end')
  if (turnBoundary?.type !== 'turn/start' || stepBoundary?.type !== 'step/start') return undefined
  if (turnBoundary.data.turn !== stepBoundary.data.turn) return undefined
  return { turn: stepBoundary.data.turn, step: stepBoundary.data.step }
}

function deniedStream(message: string, code: string): AsyncIterable<StreamChunk> {
  return (async function* (): AsyncIterable<StreamChunk> {
    await Promise.resolve()
    yield { type: 'finish', reason: { kind: 'error', failure: { message, code } } }
  })()
}

/** Register consent, provisional quota routing, verification controls, and transparent accounting. */
export function apply(ctx: Context, rawConfig: Config = {}): void {
  const config = resolvedConfig(rawConfig)
  const hostNow = (): number => Date.now()
  const hostTimestamp = (): string => new Date(hostNow()).toISOString()
  const quoteService = new SponsorDemoRewardQuoteService({
    sandboxAdScenarios: config.sandboxAdScenarios,
    advanceRatioBps: config.advanceRatioBps,
    inputReserveTokens: config.inputReserveTokens,
    inputEstimateSafetyBps: config.inputEstimateSafetyBps,
    inputPriceMicrosPerMillionTokens: config.inputPriceMicrosPerMillionTokens,
    outputPriceMicrosPerMillionTokens: config.outputPriceMicrosPerMillionTokens,
    modelPricingSnapshotId: config.modelPricingSnapshotId,
    rewardTokenQuantum: config.rewardTokenQuantum,
    minRewardTokens: config.minRewardTokens,
    maxRewardTokens: config.maxRewardTokens,
    quoteTtlMs: config.quoteTtlMs,
  }, hostNow)
  const adSandbox = new TencentGdtSandboxProvider(hostNow)
  const operatorPool: OperatorPoolState = {
    poolId: config.operatorPoolId,
    budgetMicros: config.operatorPoolBudgetMicros,
    availableMicros: config.operatorPoolBudgetMicros,
  }
  const states = new Map<string, PerSessionState>()
  let disposed = false

  const reservationCreditMicros = (run: RunState): number => Number(
    BigInt(config.maxEstimatedCostMicros) < BigInt(run.rewardQuote.fundedBudgetMicros)
      + BigInt(config.operatorInputSubsidyMicros)
      ? BigInt(config.maxEstimatedCostMicros)
      : BigInt(run.rewardQuote.fundedBudgetMicros) + BigInt(config.operatorInputSubsidyMicros),
  )

  const appliedOperatorInputSubsidyMicros = (run: RunState): number =>
    Math.max(0, reservationCreditMicros(run) - run.rewardQuote.fundedBudgetMicros)

  const projectedInputFor = (
    session: Session,
    quote: SponsorDemoRewardQuoteData,
  ): { projectedInputTokens: number; projectedInputCostMicros: number } => {
    const measuredInputTokens = ctx.tokenMeter.measure(session).totalTokens
    const projectedInputTokens = Number(
      (BigInt(measuredInputTokens) * BigInt(quote.inputEstimateSafetyBps) + 9_999n) / 10_000n,
    )
    return {
      projectedInputTokens,
      projectedInputCostMicros: estimateCostMicros(projectedInputTokens, 0, quote),
    }
  }

  const cancelGrantExpiry = (quota: QuotaGrant): void => {
    if (quota.expiryTimer === undefined) return
    clearTimeout(quota.expiryTimer)
    delete quota.expiryTimer
  }

  const stateFor = (agent: Agent): PerSessionState => {
    const key = String(agent.id)
    let state = states.get(key)
    if (state === undefined) {
      state = {
        runs: new Map(),
        grants: [],
        quotas: new Map(),
        grantIds: new Set(),
        requiresExplicitSponsorChoice: false,
      }
      states.set(key, state)
    }
    return state
  }

  const resolveRecoveryChoice = (
    state: PerSessionState,
    runId: string,
    choice: RecoveryChoice,
  ): void => {
    const pending = state.pendingRecoveryChoice
    if (pending === undefined || pending.runId !== runId) return
    clearTimeout(pending.expiryTimer)
    delete state.pendingRecoveryChoice
    pending.resolve(choice)
  }

  const waitForRecoveryChoice = (
    state: PerSessionState,
    run: RunState,
  ): Promise<RecoveryChoice> => {
    const existing = state.pendingRecoveryChoice
    if (existing?.runId === run.runId) return existing.promise
    if (existing !== undefined) resolveRecoveryChoice(state, existing.runId, 'cancelled')
    const deferred = Promise.withResolvers<RecoveryChoice>()
    const expiresAtMs = Date.parse(run.rewardQuote.expiresAt)
    const delayMs = Math.max(0, Math.min(2_147_483_647, expiresAtMs - hostNow()))
    const expiryTimer = setTimeout(() => {
      if (run.decision === undefined) settleDecision(run, 'expired')
      if (state.blockedOfferRunId === run.runId) delete state.blockedOfferRunId
      resolveRecoveryChoice(state, run.runId, 'expired')
    }, delayMs)
    state.pendingRecoveryChoice = {
      runId: run.runId,
      promise: deferred.promise,
      resolve: deferred.resolve,
      expiryTimer,
    }
    return deferred.promise
  }

  const activateGrant = (state: PerSessionState, run: RunState, grant: SponsorDemoTokenGrantIssuedData): QuotaGrant => {
    const existing = state.grants.find(candidate => candidate.grantId === grant.grantId)
    if (existing !== undefined) return existing
    if (state.grantIds.has(grant.grantId)) {
      throw new Error('sponsor-demo: activated grant identity is missing its quota state')
    }
    state.grantIds.add(grant.grantId)
    const quota: QuotaGrant = {
      grantId: grant.grantId,
      source: run,
      requestedLocations: new Set(),
      status: 'provisional',
      routingClosed: false,
      poolReleased: false,
      reservedCreditMicros: grant.reservedCreditMicros,
      spentCreditMicros: 0,
      remainingTokens: grant.grantedTokens,
      remainingCreditMicros: grant.reservedCreditMicros,
      remainingSteps: config.maxSteps,
      expiresAtMs: Date.parse(grant.expiresAt),
    }
    state.quotas.set(grant.grantId, quota)
    state.grants.push(quota)
    scheduleGrantExpiry(state, quota)
    return quota
  }

  const quotaFor = (state: PerSessionState, grantId: string): QuotaGrant | undefined =>
    state.quotas.get(grantId)

  const releasePoolReservation = (
    quota: QuotaGrant,
    reason: SponsorDemoOperatorPoolReleaseReason,
    forceAfterInFlight = false,
  ): SessionEvent<'sponsorship-demo/operator-pool-released'> | undefined => {
    cancelGrantExpiry(quota)
    if (quota.poolReleased) return undefined
    const quotaState = states.get(String(quota.source.agent.id))
    const inFlight = quotaState?.permit?.grant === quota && quotaState.permit.consumed
    if (inFlight && !forceAfterInFlight) {
      quota.routingClosed = true
      quota.routingCloseReason ??= reason
      return undefined
    }
    const releasedCreditMicros = quota.remainingCreditMicros
    const availablePoolMicros = operatorPool.availableMicros + releasedCreditMicros
    if (availablePoolMicros > operatorPool.budgetMicros) {
      throw new Error('sponsor-demo: operator pool release would exceed its configured budget')
    }
    operatorPool.availableMicros = availablePoolMicros
    const released: SponsorDemoOperatorPoolReleasedData = {
      runId: quota.source.runId,
      grantId: quota.grantId,
      quoteId: quota.source.rewardQuote.quoteId,
      operatorPoolId: operatorPool.poolId,
      reason,
      reservedCreditMicros: quota.reservedCreditMicros,
      spentCreditMicros: quota.spentCreditMicros,
      releasedCreditMicros,
      availablePoolMicros,
      releasedAt: hostTimestamp(),
    }
    const event = quota.source.agent.session.append('sponsorship-demo/operator-pool-released', released)
    quota.poolReleased = true
    quota.routingClosed = true
    quota.remainingCreditMicros = 0
    return event
  }

  const appendPoolSpend = (
    quota: QuotaGrant,
    sourceConsumptionEventSeq: number,
    estimatedCallCostMicros: number,
    spentCreditMicros: number,
  ): SessionEvent<'sponsorship-demo/operator-pool-spent'> => {
    const data: SponsorDemoOperatorPoolSpentData = {
      runId: quota.source.runId,
      grantId: quota.grantId,
      quoteId: quota.source.rewardQuote.quoteId,
      operatorPoolId: operatorPool.poolId,
      sourceConsumptionEventSeq,
      estimatedCallCostMicros,
      spentCreditMicros,
      uncoveredEstimatedCostMicros: estimatedCallCostMicros - spentCreditMicros,
      cumulativeSpentCreditMicros: quota.spentCreditMicros,
      remainingReservedCreditMicros: quota.remainingCreditMicros,
      spentAt: hostTimestamp(),
    }
    return quota.source.agent.session.append('sponsorship-demo/operator-pool-spent', data)
  }

  /** Issue and activate the provisional allowance synchronously with explicit acceptance. */
  const issueProvisionalGrant = (
    state: PerSessionState,
    run: RunState,
    decisionEventSeq: number,
  ): SessionEvent<'sponsorship-demo/token-grant-issued'> => {
    if (run.tokenGrant !== undefined) {
      const existing = run.agent.session.events.findLast((event): event is SessionEvent<'sponsorship-demo/token-grant-issued'> =>
        event.type === 'sponsorship-demo/token-grant-issued' && event.data.runId === run.runId)
      if (existing === undefined) throw new Error('sponsor-demo: grant state lacks its event')
      return existing
    }
    const reservedCreditMicros = reservationCreditMicros(run)
    if (operatorPool.availableMicros < reservedCreditMicros) {
      throw new Error('sponsor-demo: operator pool reservation raced below the accepted quote')
    }
    const grantId = randomUUID()
    const issuedAtMs = hostNow()
    const expiresAtMs = issuedAtMs + config.grantTtlMs
    if (!Number.isSafeInteger(expiresAtMs)) {
      throw new Error('sponsor-demo: Host clock cannot produce a safe grant expiry')
    }
    const availablePoolMicros = operatorPool.availableMicros - reservedCreditMicros
    const reserved: SponsorDemoOperatorPoolReservedData = {
      runId: run.runId,
      turn: run.turn,
      step: run.offerStep,
      grantId,
      quoteId: run.rewardQuote.quoteId,
      operatorPoolId: operatorPool.poolId,
      operatorPoolBudgetMicros: operatorPool.budgetMicros,
      reservedCreditMicros,
      availablePoolMicros,
      reservedAt: new Date(issuedAtMs).toISOString(),
    }
    run.agent.session.append('sponsorship-demo/operator-pool-reserved', reserved)
    operatorPool.availableMicros = availablePoolMicros
    const grant: SponsorDemoTokenGrantIssuedData = {
      runId: run.runId,
      turn: run.turn,
      step: run.offerStep,
      grantId,
      quoteId: run.rewardQuote.quoteId,
      sourceDecisionEventSeq: decisionEventSeq,
      grantKind: 'provisional',
      grantedTokens: run.rewardQuote.rewardTokens,
      operatorPoolId: operatorPool.poolId,
      reservedCreditMicros,
      verificationKind: 'pending-ad-verification',
      issuedAt: new Date(issuedAtMs).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
    }
    const event = run.agent.session.append('sponsorship-demo/token-grant-issued', grant)
    run.tokenGrant = grant
    activateGrant(state, run, grant)
    return event
  }

  /** Revoke only the unused remainder. An already-running model stream is never cancelled. */
  const revokeProvisionalGrant = (
    state: PerSessionState,
    run: RunState,
    reason: SponsorDemoTokenGrantRevocationReason,
    forceAfterInFlight = false,
  ): SponsorDemoControlResult => {
    if (run.tokenSettlement !== undefined) {
      return controlFailure('ad-already-settled', 'That provisional grant is already redeemed.')
    }
    if (run.tokenRevocation !== undefined) {
      const existing = run.agent.session.events.findLast(event =>
        event.type === 'sponsorship-demo/token-grant-revoked' && event.data.runId === run.runId)
      if (existing === undefined) throw new Error('sponsor-demo: grant revocation state lacks its event')
      return controlSuccess('ad-failure-already-recorded', existing.seq, run.tokenRevocation.grantId)
    }
    if (run.tokenGrant === undefined) {
      return controlFailure('grant-not-provisional', 'That offer has no provisional grant to revoke.')
    }
    const quota = quotaFor(state, run.tokenGrant.grantId)
    if (quota === undefined || quota.status !== 'provisional') {
      return controlFailure('grant-not-provisional', 'That grant is no longer provisional.')
    }
    const inFlight = state.permit?.grant === quota && state.permit.consumed
    if (inFlight && !forceAfterInFlight) {
      run.pendingRevocationReason ??= reason
      quota.routingClosed = true
      quota.routingCloseReason = reason
      const queued = state.grants.indexOf(quota)
      if (queued >= 0) state.grants.splice(queued, 1)
      state.requiresExplicitSponsorChoice = true
      const source = run.agent.session.events.findLast(event =>
        (event.type === 'sponsorship-demo/ad-failure-recorded'
          || event.type === 'sponsorship-demo/token-grant-issued')
        && event.data.runId === run.runId)
      if (source === undefined) throw new Error('sponsor-demo: deferred revocation lacks a durable source')
      return controlSuccess('ad-failed', source.seq, quota.grantId)
    }
    const revokedTokens = quota.remainingTokens
    const revocation: SponsorDemoTokenGrantRevokedData = {
      runId: run.runId,
      turn: run.turn,
      step: run.offerStep,
      grantId: run.tokenGrant.grantId,
      quoteId: run.rewardQuote.quoteId,
      reason,
      grantedTokens: run.tokenGrant.grantedTokens,
      consumedTokensBeforeRevocation: Math.max(0, run.tokenGrant.grantedTokens - revokedTokens),
      revokedTokens,
      fundedBudgetMicros: run.rewardQuote.fundedBudgetMicros,
      consumedCostMicrosBeforeRevocation: quota.spentCreditMicros,
      revokedCreditMicros: quota.remainingCreditMicros,
      revokedAt: hostTimestamp(),
    }
    const event = run.agent.session.append('sponsorship-demo/token-grant-revoked', revocation)
    run.tokenRevocation = revocation
    delete run.pendingRevocationReason
    quota.status = 'revoked'
    quota.routingClosed = true
    quota.remainingTokens = 0
    quota.remainingSteps = 0
    const queued = state.grants.indexOf(quota)
    if (queued >= 0) state.grants.splice(queued, 1)
    state.requiresExplicitSponsorChoice = true
    releasePoolReservation(quota, reason, forceAfterInFlight)
    return controlSuccess('ad-failed', event.seq, revocation.grantId)
  }

  /** Simulated Token service: verify Tencent's ephemeral callback and redeem exactly once. */
  const redeemTencentCallback = (
    state: PerSessionState,
    run: RunState,
    callback: TencentGdtSandboxVerificationCallback,
  ): SponsorDemoControlResult => {
    if (run.tokenSettlement !== undefined) {
      const existing = run.agent.session.events.findLast(event =>
        event.type === 'sponsorship-demo/token-grant-settled' && event.data.runId === run.runId)
      if (existing === undefined) throw new Error('sponsor-demo: grant settlement state lacks its event')
      return controlSuccess('ad-impression-already-recorded', existing.seq, callback.impressionId)
    }
    if (run.adFailure !== undefined || run.tokenRevocation !== undefined
      || run.tokenGrant === undefined || run.adRendered === undefined
      || run.adImpression === undefined) {
      return controlFailure('grant-not-provisional', 'That grant cannot accept a verification callback.')
    }
    if (!adSandbox.verifyCallback(callback, run.adRendered, run.rewardQuote)
      || callback.impressionId !== run.adImpression.impressionId) {
      return revokeProvisionalGrant(state, run, 'verification-rejected')
    }
    const quota = quotaFor(state, run.tokenGrant.grantId)
    if (quota === undefined || quota.status !== 'provisional') {
      return controlFailure('grant-not-provisional', 'That grant is no longer provisional.')
    }
    const received: SponsorDemoAdVerificationReceivedData = {
      runId: run.runId,
      turn: run.turn,
      step: run.offerStep,
      callbackId: callback.callbackId,
      quoteId: run.rewardQuote.quoteId,
      requestId: callback.requestId,
      renderId: callback.renderId,
      impressionId: callback.impressionId,
      adProvider: TENCENT_GDT_SANDBOX_PROVIDER,
      completionStatus: callback.completionStatus,
      signatureKind: 'sandbox-hmac-sha256',
      signatureVerified: true,
      receivedAt: new Date().toISOString(),
    }
    run.agent.session.append('sponsorship-demo/ad-verification-received', received)
    const settlement: SponsorDemoTokenGrantSettledData = {
      runId: run.runId,
      turn: run.turn,
      step: run.offerStep,
      grantId: run.tokenGrant.grantId,
      quoteId: run.rewardQuote.quoteId,
      settlementStatus: 'redeemed',
      verificationKind: 'tencent-gdt-sandbox-server-callback',
      sourceCallbackId: callback.callbackId,
      redeemedTokens: run.tokenGrant.grantedTokens,
      settledAt: new Date().toISOString(),
    }
    const event = run.agent.session.append('sponsorship-demo/token-grant-settled', settlement)
    run.adVerification = received
    run.tokenSettlement = settlement
    quota.status = 'redeemed'
    if (quota.routingClosed) {
      releasePoolReservation(quota, quota.routingCloseReason ?? 'grant-exhausted')
    }
    return controlSuccess('ad-impression-recorded', event.seq, callback.impressionId)
  }

  const performControl = (
    agent: Agent,
    action: SponsorDemoControlAction,
    runId: string,
    opaqueId?: string,
    failureReason?: SponsorDemoAdFailureReason,
  ): SponsorDemoControlResult => {
    const state = stateFor(agent)
    const run = state.runs.get(runId)
    if (run === undefined || run.runId !== runId) {
      return controlFailure('run-not-found', 'That simulated sponsorship run is no longer available.')
    }
    if (action === 'accept' || action === 'decline') {
      const turnEnded = run.agent.session.events.some(event =>
        event.type === 'turn/end' && event.data.turn === run.turn)
      const isActiveRecovery = run.recovery
        && !turnEnded
        && state.blockedOfferRunId === run.runId
        && state.pendingRecoveryChoice?.runId === run.runId
        && state.current === run
      const isActiveOrdinaryOffer = !run.recovery
        && state.current === run
        && !turnEnded
      if (run.decision !== undefined || run.receiptWritten
        || (!isActiveRecovery && !isActiveOrdinaryOffer)) {
        return controlFailure('offer-not-pending', 'That simulated sponsorship offer is no longer pending.')
      }
      if (action === 'accept' && hostNow() >= Date.parse(run.rewardQuote.expiresAt)) {
        settleDecision(run, 'expired')
        if (state.blockedOfferRunId === run.runId) delete state.blockedOfferRunId
        resolveRecoveryChoice(state, run.runId, 'expired')
        closeEndedRun(state, run)
        return controlFailure('quote-expired', 'That Host reward quote expired before acceptance.')
      }
      if (action === 'accept'
        && operatorPool.availableMicros < reservationCreditMicros(run)) {
        return controlFailure(
          'operator-pool-exhausted',
          'The finite local Sponsor Fund pool cannot reserve this Host quote.',
        )
      }
      if (action === 'accept') {
        const { projectedInputTokens } = projectedInputFor(run.agent.session, run.rewardQuote)
        const minimumRequestCostMicros = estimateCostMicros(
          projectedInputTokens,
          run.rewardQuote.rewardTokenQuantum,
          run.rewardQuote,
        )
        if (reservationCreditMicros(run) < minimumRequestCostMicros) {
          return controlFailure(
            'grant-unaffordable',
            'The accepted credit cannot fund projected input plus one output quantum.',
          )
        }
      }
      const event = settleDecision(run, action === 'accept' ? 'accepted' : 'declined')
      if (event === undefined) {
        return controlFailure('offer-already-decided', 'That simulated sponsorship offer was already decided.')
      }
      if (action === 'accept') {
        const grantEvent = issueProvisionalGrant(state, run, event.seq)
        state.requiresExplicitSponsorChoice = false
        if (state.blockedOfferRunId === run.runId) delete state.blockedOfferRunId
        resolveRecoveryChoice(state, run.runId, 'accepted')
        closeEndedRun(state, run)
        return controlSuccess('accepted', grantEvent.seq, grantEvent.data.grantId)
      }
      state.requiresExplicitSponsorChoice = false
      if (state.blockedOfferRunId === run.runId) delete state.blockedOfferRunId
      resolveRecoveryChoice(state, run.runId, 'declined')
      closeEndedRun(state, run)
      return controlSuccess('declined', event.seq)
    }

    if (run.decision !== 'accepted') {
      return controlFailure('playback-not-accepted', 'Advertising requires an explicit accepted offer.')
    }

    if (action !== 'fail-ad' && run.tokenGrant !== undefined) {
      const acceptedQuota = quotaFor(state, run.tokenGrant.grantId)
      if (acceptedQuota?.status === 'provisional' && hostNow() >= acceptedQuota.expiresAtMs) {
        revokeProvisionalGrant(state, run, 'grant-expired')
        return controlFailure('grant-expired', 'That session-scoped grant expired before ad settlement.')
      }
    }

    if (action === 'fail-ad') {
      const allowedReasons: readonly SponsorDemoAdFailureReason[] = [
        'load-failed', 'render-failed', 'playback-incomplete', 'verification-rejected', 'session-ended',
      ]
      if (failureReason === undefined || !allowedReasons.includes(failureReason)) {
        return controlFailure('grant-not-provisional', 'That advertising failure reason is not supported.')
      }
      if (run.adFailure !== undefined) {
        const existing = run.agent.session.events.findLast(event =>
          event.type === 'sponsorship-demo/ad-failure-recorded' && event.data.runId === run.runId)
        if (existing === undefined) throw new Error('sponsor-demo: ad failure state lacks its event')
        return controlSuccess('ad-failure-already-recorded', existing.seq, run.adFailure.grantId)
      }
      if (run.tokenSettlement !== undefined) {
        return controlFailure('ad-already-settled', 'That provisional grant is already redeemed.')
      }
      if (run.tokenRevocation !== undefined) {
        return controlFailure('grant-not-provisional', 'That provisional grant was already revoked.')
      }
      if (run.tokenGrant === undefined) {
        return controlFailure('grant-not-provisional', 'That offer has no provisional grant to revoke.')
      }
      const failure: SponsorDemoAdFailureRecordedData = {
        runId: run.runId,
        turn: run.turn,
        step: run.offerStep,
        grantId: run.tokenGrant.grantId,
        quoteId: run.rewardQuote.quoteId,
        reason: failureReason,
        recordedAt: hostTimestamp(),
      }
      run.agent.session.append('sponsorship-demo/ad-failure-recorded', failure)
      run.adFailure = failure
      return revokeProvisionalGrant(state, run, failureReason)
    }

    if (run.adFailure !== undefined) {
      return controlFailure('grant-not-provisional', 'That advertising attempt already failed.')
    }

    if (action === 'load-ad' || action === 'render-ad' || action === 'record-ad-impression') {
      if (config.adProvider !== TENCENT_GDT_SANDBOX_PROVIDER) {
        return controlFailure('ad-provider-mismatch', 'This offer does not use the local Tencent sandbox.')
      }
      if (action === 'load-ad') {
        if (run.adLoaded !== undefined) {
          const existing = run.agent.session.events.findLast(event =>
            event.type === 'sponsorship-demo/ad-loaded' && event.data.runId === run.runId)
          if (existing === undefined) throw new Error('sponsor-demo: ad load state lacks its event')
          return controlSuccess('ad-already-loaded', existing.seq, run.adLoaded.requestId)
        }
        const data = adSandbox.load(
          { runId: run.runId, turn: run.turn, step: run.offerStep },
          run.rewardQuote,
        )
        const event = run.agent.session.append('sponsorship-demo/ad-loaded', data)
        run.adLoaded = data
        return controlSuccess('ad-loaded', event.seq, data.requestId)
      }
      if (run.adLoaded === undefined) {
        return controlFailure('ad-not-loaded', 'Load the local sandbox ad before rendering it.')
      }
      if (opaqueId !== run.adLoaded.requestId) {
        return controlFailure('ad-request-mismatch', 'That request identity does not belong to this offer.')
      }
      if (action === 'render-ad') {
        if (run.adRendered !== undefined) {
          const existing = run.agent.session.events.findLast(event =>
            event.type === 'sponsorship-demo/ad-rendered' && event.data.runId === run.runId)
          if (existing === undefined) throw new Error('sponsor-demo: ad render state lacks its event')
          return controlSuccess('ad-already-rendered', existing.seq, run.adLoaded.requestId)
        }
        const data = adSandbox.render(run.adLoaded)
        const event = run.agent.session.append('sponsorship-demo/ad-rendered', data)
        run.adRendered = data
        return controlSuccess('ad-rendered', event.seq, run.adLoaded.requestId)
      }
      if (run.adRendered === undefined) {
        return controlFailure('ad-not-rendered', 'Render the local sandbox ad before recording an impression.')
      }
      if (run.adImpression !== undefined) {
        const existing = run.agent.session.events.findLast(event =>
          event.type === 'sponsorship-demo/ad-impression' && event.data.runId === run.runId)
        if (existing === undefined) throw new Error('sponsor-demo: ad impression state lacks its event')
        return controlSuccess('ad-impression-already-recorded', existing.seq, run.adImpression.impressionId)
      }
      if (run.tokenRevocation !== undefined) {
        return controlFailure('grant-not-provisional', 'That provisional grant was already revoked.')
      }
      if (!adSandbox.hasMetMinimumVisibleDuration(run.adRendered, config.adDurationMs)) {
        return controlFailure(
          'ad-duration-incomplete',
          'The local sandbox creative has not met its Host minimum visible duration.',
        )
      }
      const completed = adSandbox.completeImpression(
        run.adRendered,
        run.rewardQuote,
        config.adDurationMs,
      )
      run.agent.session.append('sponsorship-demo/ad-impression', completed.impression)
      run.agent.session.append('sponsorship-demo/ad-revenue', completed.revenue)
      run.adImpression = completed.impression
      run.adRevenue = completed.revenue
      return redeemTencentCallback(state, run, completed.callback)
    }

    if (config.adProvider !== 'local-video') {
      return controlFailure('ad-provider-mismatch', 'This offer does not use the packaged local video.')
    }
    if (action === 'start') {
      if (run.playback !== undefined) {
        const existing = run.agent.session.events.findLast(event =>
          event.type === 'sponsorship-demo/playback-started' && event.data.runId === run.runId)
        if (existing === undefined) throw new Error('sponsor-demo: playback state lacks its event')
        return controlSuccess('playback-already-started', existing.seq)
      }
      const data: SponsorDemoPlaybackStartedData = {
        runId: run.runId,
        turn: run.turn,
        step: run.offerStep,
        playbackId: randomUUID(),
        quoteId: run.rewardQuote.quoteId,
        assetId: SPONSOR_DEMO_ASSET_ID,
        durationMs: config.adDurationMs,
        rewardTokenCap: run.rewardQuote.rewardTokens,
        startedAt: hostTimestamp(),
      }
      const event = run.agent.session.append('sponsorship-demo/playback-started', data)
      run.playback = data
      return controlSuccess('playback-started', event.seq)
    }
    if (run.playback === undefined) {
      return controlFailure('playback-not-started', 'Start the local test playback before completing it.')
    }
    if (run.reward !== undefined && run.tokenSettlement !== undefined) {
      const existing = run.agent.session.events.findLast(event =>
        event.type === 'sponsorship-demo/reward-issued' && event.data.runId === run.runId)
      if (existing === undefined) throw new Error('sponsor-demo: reward state lacks its event')
      return controlSuccess('reward-already-issued', existing.seq)
    }
    const playbackStartedAtMs = Date.parse(run.playback.startedAt)
    if (!Number.isFinite(playbackStartedAtMs)
      || hostNow() < playbackStartedAtMs + config.adDurationMs) {
      return controlFailure(
        'ad-duration-incomplete',
        'The local video has not met its Host minimum playback duration.',
      )
    }
    if (run.tokenRevocation !== undefined || run.tokenGrant === undefined) {
      return controlFailure('grant-not-provisional', 'That provisional grant cannot be redeemed.')
    }
    const quota = quotaFor(state, run.tokenGrant.grantId)
    if (quota === undefined || quota.status !== 'provisional') {
      return controlFailure('grant-not-provisional', 'That grant is no longer provisional.')
    }
    const now = hostTimestamp()
    const reward: SponsorDemoRewardIssuedData = {
      runId: run.runId,
      turn: run.turn,
      step: run.offerStep,
      playbackId: run.playback.playbackId,
      quoteId: run.rewardQuote.quoteId,
      watchedMs: config.adDurationMs,
      grantedTokens: run.rewardQuote.rewardTokens,
      verificationKind: 'local-ended',
      completedAt: now,
    }
    const rewardEvent = run.agent.session.append('sponsorship-demo/reward-issued', reward)
    const settlement: SponsorDemoTokenGrantSettledData = {
      runId: run.runId,
      turn: run.turn,
      step: run.offerStep,
      grantId: run.tokenGrant.grantId,
      quoteId: run.rewardQuote.quoteId,
      settlementStatus: 'redeemed',
      verificationKind: 'local-video-ended',
      sourcePlaybackId: run.playback.playbackId,
      redeemedTokens: run.tokenGrant.grantedTokens,
      settledAt: now,
    }
    run.agent.session.append('sponsorship-demo/token-grant-settled', settlement)
    run.reward = reward
    run.tokenSettlement = settlement
    quota.status = 'redeemed'
    if (quota.routingClosed) {
      releasePoolReservation(quota, quota.routingCloseReason ?? 'grant-exhausted')
    }
    return controlSuccess('reward-issued', rewardEvent.seq)
  }

  new SponsorDemoRemoteService(ctx, { perform: performControl })

  ctx.commands.register({
    name: COMMAND,
    description: 'control one local simulated sponsorship or rewarded-video run',
    input: { hint: '<accept|decline|start|complete> <run-id>' },
    recordInput: false,
    handler: ({ agent, rawInput }): CommandResult => {
      const [action, runId, extra] = rawInput.trim().split(/\s+/u)
      if (extra !== undefined || !['accept', 'decline', 'start', 'complete'].includes(action ?? '') || !runId) {
        return { kind: 'error', text: `Usage: /${COMMAND} <accept|decline|start|complete> <run-id>` }
      }
      const result = performControl(agent, action as SponsorDemoControlAction, runId)
      if (!result.ok) return { kind: 'error', text: result.message }
      return { kind: 'success', sourceEventSeq: result.sourceEventSeq, text: commandSuccessText(result.state) }
    },
  })

  const creditOutputTokenCap = (
    quote: SponsorDemoRewardQuoteData,
    availableCreditMicros: number,
    projectedInputCostMicros: number,
  ): number => {
    const outputCreditMicros = Math.max(0, availableCreditMicros - projectedInputCostMicros)
    const tokenCap = BigInt(outputCreditMicros) * BigInt(MICROS_PER_UNIT)
      / BigInt(quote.outputPriceMicrosPerMillionTokens)
    return Number(tokenCap > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : tokenCap)
  }

  const sponsoredConfig = (
    baseline: LlmCallConfig,
    grant: QuotaGrant,
    admissionOutputTokenCap: number,
  ): LlmCallConfig => {
    const requested = baseline.maxTokens ?? config.maxOutputTokensPerRequest
    const maxTokens = Math.min(
      requested,
      config.maxOutputTokensPerRequest,
      grant.remainingTokens,
      admissionOutputTokenCap,
    )
    if (maxTokens < 1) throw new LlmError('sponsor-demo grant is exhausted', 'SPONSOR_DEMO_BUDGET')
    return {
      ...cloneCallConfig(baseline),
      provider: config.sponsorProvider,
      model: config.sponsorModel,
      maxTokens,
    }
  }

  const appendOffer = (
    agent: Agent,
    state: PerSessionState,
    turn: number,
    step: number,
    baseline: LlmCallConfig,
    presentation: ResolvedConfig['presentation'] = config.presentation,
    recovery = false,
  ): RunState => {
    const runId = randomUUID()
    const rewardQuote = quoteService.createQuote(runId)
    const run: RunState = {
      runId, agent, turn, offerStep: step,
      baseline: cloneCallConfig(baseline),
      rewardQuote,
      baselineSteps: new Set(), baselineUsage: new Map(), sponsoredSteps: new Set(),
      sponsorCalls: 0,
      baselineInputTokens: 0, baselineOutputTokens: 0,
      sponsorInputTokens: 0, sponsorOutputTokens: 0,
      capped: false, receiptWritten: false, recovery,
    }
    state.current = run
    state.runs.set(run.runId, run)
    if (state.runs.size > 32) {
      const removable = [...state.runs].find(([, candidate]) =>
        candidate !== state.current && candidate.receiptWritten && candidate.tokenGrant === undefined)
      if (removable !== undefined) state.runs.delete(removable[0])
    }
    agent.session.append('sponsorship-demo/offer', {
      runId: run.runId,
      turn,
      step,
      sponsorName: SPONSOR_DEMO_NAME,
      sponsorDisclosure: SPONSOR_DEMO_DISCLOSURE,
      provider: config.sponsorProvider,
      model: config.sponsorModel,
      maxSteps: config.maxSteps,
      maxOutputTokensPerRequest: config.maxOutputTokensPerRequest,
      maxTotalTokens: config.maxTotalTokens,
      maxEstimatedCostMicros: config.maxEstimatedCostMicros,
      currency: CURRENCY,
      presentation,
      fundingMode: config.fundingMode,
      operatorPoolId: operatorPool.poolId,
      operatorPoolBudgetMicros: operatorPool.budgetMicros,
      operatorInputSubsidyMicros: appliedOperatorInputSubsidyMicros(run),
      grantTtlMs: config.grantTtlMs,
      adProvider: config.adProvider,
      adFormat: config.adProvider === TENCENT_GDT_SANDBOX_PROVIDER
        ? TENCENT_GDT_SANDBOX_FORMAT
        : 'rewarded-video',
      rewardTokens: rewardQuote.rewardTokens,
      rewardQuote,
      adDurationMs: config.adDurationMs,
      assetId: config.adProvider === TENCENT_GDT_SANDBOX_PROVIDER
        ? TENCENT_GDT_SANDBOX_CREATIVE_ID
        : SPONSOR_DEMO_ASSET_ID,
    })
    return run
  }

  function closeGrantRouting(
    state: PerSessionState,
    grant: QuotaGrant,
    reason: Extract<SponsorDemoOperatorPoolReleaseReason,
      'grant-expired' | 'grant-exhausted' | 'budget-capped'>,
  ): void {
    if (!grant.routingClosed) {
      grant.routingClosed = true
      grant.routingCloseReason = reason
    }
    const queued = state.grants.indexOf(grant)
    if (queued >= 0) state.grants.splice(queued, 1)
    state.requiresExplicitSponsorChoice = true
    if (grant.poolReleased) return
    if (grant.status === 'redeemed') {
      releasePoolReservation(grant, reason)
    } else if (grant.status === 'provisional' && reason !== 'grant-exhausted') {
      revokeProvisionalGrant(state, grant.source, reason)
    }
  }

  function scheduleGrantExpiry(state: PerSessionState, grant: QuotaGrant): void {
    if (disposed || grant.poolReleased) return
    cancelGrantExpiry(grant)
    // Node clamps larger delays. Re-arm long grants in bounded chunks so the
    // Host deadline remains correct for every validated TTL.
    const delayMs = Math.max(0, Math.min(2_147_483_647, grant.expiresAtMs - hostNow()))
    grant.expiryTimer = setTimeout(() => {
      delete grant.expiryTimer
      if (disposed || grant.poolReleased
        || states.get(String(grant.source.agent.id)) !== state) return
      if (hostNow() < grant.expiresAtMs) {
        scheduleGrantExpiry(state, grant)
        return
      }
      try {
        closeGrantRouting(state, grant, 'grant-expired')
      } catch (error) {
        ctx.logger.warn(`sponsor-demo: failed to expire grant ${grant.grantId}: ${String(error)}`)
      }
    }, delayMs)
  }

  const ensureBlockedOffer = (
    agent: Agent,
    state: PerSessionState,
    turn: number,
    step: number,
    baseline: LlmCallConfig,
  ): RunState => {
    const existing = state.blockedOfferRunId === undefined
      ? undefined
      : state.runs.get(state.blockedOfferRunId)
    if (existing !== undefined && existing.decision === undefined
      && hostNow() < Date.parse(existing.rewardQuote.expiresAt)) return existing
    if (existing !== undefined && existing.decision === undefined) {
      settleDecision(existing, 'expired')
      closeEndedRun(state, existing)
    }
    // Preflight failure happens before an Assistant/reasoning node exists. A
    // replacement must therefore own an independent, actionable Chat surface
    // instead of relying on the configured reasoning footer.
    const replacement = appendOffer(
      agent,
      state,
      turn,
      step,
      baseline,
      'conversation-card',
      true,
    )
    state.blockedOfferRunId = replacement.runId
    return replacement
  }

  const waitForReplacementChoice = (
    agent: Agent,
    state: PerSessionState,
    grant: QuotaGrant,
    turn: number,
    step: number,
    baseline: LlmCallConfig,
    reason: Extract<SponsorDemoOperatorPoolReleaseReason,
      'grant-expired' | 'grant-exhausted' | 'budget-capped'>,
  ): Promise<RecoveryChoice> => {
    grant.source.capped = true
    closeGrantRouting(state, grant, reason)
    const replacement = ensureBlockedOffer(agent, state, turn, step, baseline)
    return waitForRecoveryChoice(state, replacement)
  }

  ctx.on('agent/request', async (
    { agent, turn, step }: Parameters<Events['agent/request']>[0],
    next: () => Promise<LlmCallConfig>,
  ): Promise<LlmCallConfig> => {
    const proposed = await next()
    const state = stateFor(agent)
    const proposedIsSponsor = proposed.provider === config.sponsorProvider
      && proposed.model === config.sponsorModel
    const baseline = proposedIsSponsor ? state.restoreBaseline : proposed
    if (baseline === undefined) {
      throw new LlmError(
        'sponsor-demo route persisted without a recoverable original route',
        'SPONSOR_DEMO_GRANT',
      )
    }

    while (true) {
      const grant = state.grants[0]
      if (grant !== undefined) {
        let replacementReason: Extract<SponsorDemoOperatorPoolReleaseReason,
          'grant-expired' | 'grant-exhausted' | 'budget-capped'> | undefined
        if (grant.routingClosed || grant.remainingTokens < 1 || grant.remainingSteps < 1) {
          replacementReason = 'grant-exhausted'
        } else if (hostNow() >= grant.expiresAtMs) {
          replacementReason = 'grant-expired'
        }
        if (replacementReason !== undefined) {
          const choice = await waitForReplacementChoice(
            agent, state, grant, turn, step, baseline, replacementReason,
          )
          if (choice === 'cancelled') {
            throw new LlmError(
              'sponsor-demo recovery choice ended before routing resumed',
              'SPONSOR_DEMO_BUDGET',
            )
          }
          continue
        }
        const { projectedInputTokens, projectedInputCostMicros } = projectedInputFor(
          agent.session,
          grant.source.rewardQuote,
        )
        const usedEstimatedCostMicros = estimateCostMicros(
          grant.source.sponsorInputTokens,
          grant.source.sponsorOutputTokens,
          grant.source.rewardQuote,
        )
        const remainingConfiguredCostMicros = Math.max(
          0,
          config.maxEstimatedCostMicros - usedEstimatedCostMicros,
        )
        const remainingConfiguredTokens = Math.max(
          0,
          config.maxTotalTokens
            - grant.source.sponsorInputTokens
            - grant.source.sponsorOutputTokens,
        )
        const availableCreditMicros = Math.min(
          grant.remainingCreditMicros,
          remainingConfiguredCostMicros,
        )
        const admissionOutputTokenCap = Math.min(
          Math.max(0, remainingConfiguredTokens - projectedInputTokens),
          creditOutputTokenCap(
            grant.source.rewardQuote,
            availableCreditMicros,
            projectedInputCostMicros,
          ),
        )
        if (admissionOutputTokenCap < 1) {
          const choice = await waitForReplacementChoice(
            agent, state, grant, turn, step, baseline, 'budget-capped',
          )
          if (choice === 'cancelled') {
            throw new LlmError(
              'sponsor-demo recovery choice ended before routing resumed',
              'SPONSOR_DEMO_BUDGET',
            )
          }
          continue
        }
        if (baseline.provider === config.sponsorProvider && baseline.model === config.sponsorModel) {
          throw new LlmError('sponsor-demo provider alias must differ from the original route', 'SPONSOR_DEMO_STATE')
        }
        const location = `${String(turn)}:${String(step)}`
        if (grant.requestedLocations.has(location)) {
          grant.source.capped = true
          throw new LlmError('sponsor-demo does not admit a same-step retry', 'SPONSOR_DEMO_BUDGET')
        }
        grant.requestedLocations.add(location)
        state.restoreBaseline = cloneCallConfig(baseline)
        state.permit = {
          grant,
          turn,
          step,
          projectedInputTokens,
          projectedInputCostMicros,
          consumed: false,
        }
        return sponsoredConfig(baseline, grant, admissionOutputTokenCap)
      }

      if (!state.requiresExplicitSponsorChoice) break
      const replacement = ensureBlockedOffer(agent, state, turn, step, baseline)
      const choice = await waitForRecoveryChoice(state, replacement)
      if (choice === 'cancelled') {
        throw new LlmError(
          'sponsor-demo recovery choice ended before routing resumed',
          'SPONSOR_DEMO_BUDGET',
        )
      }
    }

    // A previous sponsored request can persist in request/header. Restore it
    // only here, inside the next genuine request's open turn.
    if (proposedIsSponsor) return cloneCallConfig(baseline)

    // Offer creation never gates or rewrites this already-starting call.
    if (step === 1 && state.current === undefined) appendOffer(agent, state, turn, step, baseline)
    return cloneCallConfig(baseline)
  })

  ctx.on('llm/stream', (options: GenerateOptions, next): AsyncIterable<StreamChunk> => {
    const isSponsorRoute = options.provider === config.sponsorProvider
      && options.model === config.sponsorModel
    if (!isSponsorRoute) return next()
    if (options.sessionId === undefined || !isAgentLoopRequest(options) || options.purpose !== undefined) {
      return deniedStream(
        'sponsor-demo authorization is bound to an ordinary Agent Loop request',
        'SPONSOR_DEMO_AUXILIARY_ROUTE',
      )
    }
    const state = states.get(String(options.sessionId))
    const session = ctx.sessions.get(options.sessionId)
    const location = session === undefined ? undefined : openLocation(session)
    const permit = state?.permit
    if (session === undefined || location === undefined || permit === undefined
      || permit.consumed || permit.grant.routingClosed || permit.grant.status === 'revoked'
      || permit.turn !== location.turn || permit.step !== location.step) {
      return deniedStream('sponsor-demo route has no exact live grant permit', 'SPONSOR_DEMO_GRANT')
    }
    permit.consumed = true
    permit.grant.remainingSteps -= 1
    const run = permit.grant.source
    run.sponsorCalls += 1
    if (run.turn === location.turn) run.sponsoredSteps.add(location.step)

    return (async function* (): AsyncIterable<StreamChunk> {
      let usage: TokenUsage | undefined
      let status: SponsorDemoTokenGrantConsumedData['status'] = 'aborted'
      try {
        for await (const chunk of next()) {
          if (chunk.type === 'usage') usage = chunk.usage
          if (chunk.type === 'finish') {
            status = chunk.reason.kind === 'error'
              ? 'failed'
              : chunk.reason.kind === 'aborted'
                ? 'aborted'
                : 'completed'
          }
          yield chunk
        }
      } finally {
        const inputTokens = usage === undefined
          ? 0
          : usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0)
        const outputTokens = usage?.outputTokens ?? 0
        run.sponsorInputTokens += inputTokens
        run.sponsorOutputTokens += outputTokens
        permit.grant.remainingTokens = Math.max(0, permit.grant.remainingTokens - outputTokens)
        const estimatedCostMicros = estimateCostMicros(inputTokens, outputTokens, run.rewardQuote)
        const spentCreditMicros = Math.min(
          permit.grant.remainingCreditMicros,
          estimatedCostMicros,
        )
        permit.grant.spentCreditMicros += spentCreditMicros
        permit.grant.remainingCreditMicros -= spentCreditMicros
        const totalExceeded = run.sponsorInputTokens + run.sponsorOutputTokens >= config.maxTotalTokens
        const costCapMicros = permit.grant.reservedCreditMicros
        const costExceeded = estimateCostMicros(
          run.sponsorInputTokens,
          run.sponsorOutputTokens,
          run.rewardQuote,
        ) >= costCapMicros || permit.grant.remainingCreditMicros < 1
        if (totalExceeded || costExceeded) {
          run.capped = true
          permit.grant.remainingTokens = 0
        }
        const grantExhausted = permit.grant.remainingTokens < 1
          || permit.grant.remainingSteps < 1
          || permit.grant.remainingCreditMicros < 1
        const consumed: SponsorDemoTokenGrantConsumedData = {
          runId: run.runId,
          grantId: permit.grant.grantId,
          quoteId: run.rewardQuote.quoteId,
          turn: location.turn,
          step: location.step,
          provider: config.sponsorProvider,
          model: config.sponsorModel,
          status,
          inputTokens,
          outputTokens,
          projectedInputTokens: permit.projectedInputTokens,
          projectedInputCostMicros: permit.projectedInputCostMicros,
          estimatedCostMicros,
          remainingCreditMicros: permit.grant.remainingCreditMicros,
          remainingTokens: permit.grant.remainingTokens,
          remainingSteps: permit.grant.remainingSteps,
          consumedAt: hostTimestamp(),
        }
        const consumptionEvent = session.append('sponsorship-demo/token-grant-consumed', consumed)
        appendPoolSpend(
          permit.grant,
          consumptionEvent.seq,
          estimatedCostMicros,
          spentCreditMicros,
        )
        if (run.pendingRevocationReason !== undefined && state !== undefined) {
          revokeProvisionalGrant(state, run, run.pendingRevocationReason, true)
        } else if (grantExhausted && state !== undefined) {
          closeGrantRouting(state, permit.grant, 'grant-exhausted')
        }
        if (permit.grant.status === 'redeemed'
          && permit.grant.routingClosed
          && !permit.grant.poolReleased) {
          releasePoolReservation(
            permit.grant,
            permit.grant.routingCloseReason ?? 'grant-exhausted',
            true,
          )
        }
        if (state !== undefined && permit.grant.poolReleased && run.receiptWritten
          && (run.tokenSettlement !== undefined || run.tokenRevocation !== undefined)) {
          state.runs.delete(run.runId)
          state.grantIds.delete(permit.grant.grantId)
          state.quotas.delete(permit.grant.grantId)
        }
        if (state?.permit === permit) delete state.permit
      }
    })()
  })

  function closeRun(state: PerSessionState, run: RunState, reason: TurnEndReason): void {
    if (run.receiptWritten) return
    // Re-fold durable final messages so listener teardown cannot leave a
    // baseline receipt with partial usage when plugin disposal races a stream.
    for (const event of run.agent.session.events) {
      if (event.type === 'assistant/message'
        && event.data.turn === run.turn
        && event.data.usage !== undefined
        && !run.sponsoredSteps.has(event.data.step)) {
        recordBaselineUsage(run, event.data.step, event.data.usage)
      }
    }
    run.agent.session.append('sponsorship-demo/receipt', receiptFor(run, reason, config))
    run.receiptWritten = true
    if (state.current === run) delete state.current
  }

  function closeEndedRun(state: PerSessionState, run: RunState): void {
    const ended = run.agent.session.events.findLast(event =>
      event.type === 'turn/end' && event.data.turn === run.turn)
    if (ended?.type === 'turn/end') closeRun(state, run, ended.data.reason)
  }

  const finalizeAfterIdle = async (state: PerSessionState, run: RunState): Promise<void> => {
    await run.agent.whenIdle()
    const ended = run.agent.session.events.findLast(event =>
      event.type === 'turn/end' && event.data.turn === run.turn)
    if (ended?.type === 'turn/end') closeRun(state, run, ended.data.reason)
  }

  ctx.on('session/event', (session, event) => {
    const state = states.get(String(session.id))
    if (event.type === 'request/header'
      && (event.data.header.config.provider !== config.sponsorProvider
        || event.data.header.config.model !== config.sponsorModel)
      && state?.restoreBaseline !== undefined) {
      delete state.restoreBaseline
    }
    const run = state?.current
    if (run !== undefined && event.type === 'assistant/chunk'
      && event.data.turn === run.turn
      && event.data.chunk.type === 'usage'
      && !run.sponsoredSteps.has(event.data.step)) {
      recordBaselineUsage(run, event.data.step, event.data.chunk.usage)
    } else if (run !== undefined && event.type === 'assistant/message'
      && event.data.turn === run.turn
      && !run.sponsoredSteps.has(event.data.step)) {
      run.baselineSteps.add(event.data.step)
      if (event.data.usage !== undefined) recordBaselineUsage(run, event.data.step, event.data.usage)
    }
    if (state === undefined || event.type !== 'turn/end') return
    if (state.pendingRecoveryChoice !== undefined) {
      resolveRecoveryChoice(state, state.pendingRecoveryChoice.runId, 'cancelled')
    }
    const reason = event.data.reason
    const closing = [...state.runs.values()].filter(candidate =>
      candidate.turn === event.data.turn
      && !candidate.receiptWritten
      && !(candidate.recovery && candidate.decision === undefined))
    for (const candidate of closing) {
      queueMicrotask(() => { closeRun(state, candidate, reason) })
    }
  })

  ctx.on('agent/disposed', ({ agent }) => {
    const state = states.get(String(agent.id))
    if (state !== undefined) {
      if (state.pendingRecoveryChoice !== undefined) {
        resolveRecoveryChoice(state, state.pendingRecoveryChoice.runId, 'cancelled')
      }
      for (const quota of state.quotas.values()) cancelGrantExpiry(quota)
      for (const candidate of state.runs.values()) {
        if (candidate.tokenGrant !== undefined
          && candidate.tokenSettlement === undefined
          && candidate.tokenRevocation === undefined) {
          revokeProvisionalGrant(state, candidate, 'session-ended')
        }
      }
      for (const quota of state.quotas.values()) {
        if (!quota.poolReleased && quota.status === 'redeemed') {
          releasePoolReservation(quota, 'session-ended')
        }
      }
    }
    const run = state?.current
    if (state === undefined || run === undefined) {
      states.delete(String(agent.id))
      return
    }
    settleDecision(run, 'cancelled')
    void finalizeAfterIdle(state, run)
      .catch((error: unknown) => {
        ctx.logger.warn(`sponsor-demo: failed to finalize disposed agent ${String(agent.id)}: ${String(error)}`)
      })
      .finally(() => { states.delete(String(agent.id)) })
  })

  ctx.effect(() => async () => {
    disposed = true
    const closing = [...states.values()].flatMap(state =>
      state.current === undefined ? [] : [{ state, run: state.current }])
    for (const { run } of closing) {
      if (run.decision === undefined) settleDecision(run, 'cancelled')
    }
    for (const state of states.values()) {
      if (state.pendingRecoveryChoice !== undefined) {
        resolveRecoveryChoice(state, state.pendingRecoveryChoice.runId, 'cancelled')
      }
      for (const quota of state.quotas.values()) cancelGrantExpiry(quota)
      for (const run of state.runs.values()) {
        if (run.tokenGrant !== undefined
          && run.tokenSettlement === undefined
          && run.tokenRevocation === undefined) {
          revokeProvisionalGrant(state, run, 'plugin-disposed')
        }
      }
      for (const quota of state.quotas.values()) {
        if (!quota.poolReleased && quota.status === 'redeemed') {
          releasePoolReservation(quota, 'plugin-disposed')
        }
      }
    }
    await Promise.allSettled(closing.map(({ state, run }) => finalizeAfterIdle(state, run)))
    states.clear()
  }, 'sponsor-demo: discard process-local permits and quota pools')
}

/** Loader-facing function plugin with injection and configuration metadata. */
export default Object.assign(apply, { inject, Config })
