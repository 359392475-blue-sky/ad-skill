/** Host-side conversion of simulated advertising value into one immutable reward quote. */

import { createHash, randomUUID } from 'node:crypto'
import type { SponsorDemoRewardQuoteData } from './types.ts'

const BPS_DENOMINATOR = 10_000n
const MICROS_PER_CNY = 1_000_000n
const IMPRESSIONS_PER_ECPM = 1_000n

/** One configurable market-benchmark scenario used by the local advertising sandbox. */
export interface SponsorDemoSandboxAdScenario {
  /** Stable deployment-owned scenario identity. */
  readonly scenarioId: string
  /** Market-benchmark eCPM in one-millionth CNY per one thousand impressions. */
  readonly marketBenchmarkEcpmMicros: number
}

/** Fully resolved Host policy for producing bounded sandbox reward quotes. */
export interface SponsorDemoRewardQuotePolicy {
  readonly sandboxAdScenarios: readonly SponsorDemoSandboxAdScenario[]
  readonly advanceRatioBps: number
  readonly inputReserveTokens: number
  readonly inputEstimateSafetyBps: number
  readonly inputPriceMicrosPerMillionTokens: number
  readonly outputPriceMicrosPerMillionTokens: number
  readonly modelPricingSnapshotId: string
  readonly rewardTokenQuantum: number
  readonly minRewardTokens: number
  readonly maxRewardTokens: number
  readonly quoteTtlMs: number
}

/** Default nonzero market-benchmark simulations; they are not Tencent quotes or settlement values. */
export const DEFAULT_SANDBOX_AD_SCENARIOS: readonly SponsorDemoSandboxAdScenario[] = Object.freeze([
  Object.freeze({ scenarioId: 'native-low', marketBenchmarkEcpmMicros: 6_000_000 }),
  Object.freeze({ scenarioId: 'native-medium', marketBenchmarkEcpmMicros: 20_000_000 }),
  Object.freeze({ scenarioId: 'video-high', marketBenchmarkEcpmMicros: 45_000_000 }),
])

function safeInteger(value: number, field: string, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`sponsor-demo: ${field} must be a safe integer >= ${minimum}`)
  }
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator
}

function cappedNumber(value: bigint, cap: number): number {
  return Number(value > BigInt(cap) ? BigInt(cap) : value)
}

function termsForScenario(
  scenario: SponsorDemoSandboxAdScenario,
  policy: SponsorDemoRewardQuotePolicy,
): Pick<SponsorDemoRewardQuoteData,
  | 'marketBenchmarkEcpmMicros'
  | 'simulatedAdValueMicros'
  | 'fundedBudgetMicros'
  | 'inputReserveMicros'
  | 'rewardTokens'> {
  const simulatedAdValueMicros = Number(
    BigInt(scenario.marketBenchmarkEcpmMicros) / IMPRESSIONS_PER_ECPM,
  )
  const fundedBudgetMicros = Number(
    BigInt(simulatedAdValueMicros) * BigInt(policy.advanceRatioBps) / BPS_DENOMINATOR,
  )
  const inputReserveMicros = Number(ceilDiv(
    BigInt(policy.inputReserveTokens) * BigInt(policy.inputPriceMicrosPerMillionTokens),
    MICROS_PER_CNY,
  ))
  const outputBudgetMicros = Math.max(0, fundedBudgetMicros - inputReserveMicros)
  const rawRewardTokens = cappedNumber(
    BigInt(outputBudgetMicros) * MICROS_PER_CNY
      / BigInt(policy.outputPriceMicrosPerMillionTokens),
    policy.maxRewardTokens,
  )
  const rewardTokens = Math.floor(rawRewardTokens / policy.rewardTokenQuantum)
    * policy.rewardTokenQuantum
  if (rewardTokens < policy.minRewardTokens) {
    throw new Error(
      `sponsor-demo: scenario ${JSON.stringify(scenario.scenarioId)} cannot fund the minimum reward`,
    )
  }
  return {
    marketBenchmarkEcpmMicros: scenario.marketBenchmarkEcpmMicros,
    simulatedAdValueMicros,
    fundedBudgetMicros,
    inputReserveMicros,
    rewardTokens,
  }
}

function validatePolicy(policy: SponsorDemoRewardQuotePolicy): void {
  if (policy.sandboxAdScenarios.length < 3) {
    throw new Error('sponsor-demo: sandboxAdScenarios must contain at least three scenarios')
  }
  const scenarioIds = new Set<string>()
  for (const scenario of policy.sandboxAdScenarios) {
    if (scenario.scenarioId.trim().length === 0) {
      throw new Error('sponsor-demo: each sandbox scenarioId must be non-empty')
    }
    if (scenarioIds.has(scenario.scenarioId)) {
      throw new Error(`sponsor-demo: duplicate sandbox scenarioId ${JSON.stringify(scenario.scenarioId)}`)
    }
    scenarioIds.add(scenario.scenarioId)
    safeInteger(scenario.marketBenchmarkEcpmMicros, 'marketBenchmarkEcpmMicros', 1_000)
  }
  safeInteger(policy.advanceRatioBps, 'advanceRatioBps', 1)
  if (policy.advanceRatioBps > 10_000) {
    throw new Error('sponsor-demo: advanceRatioBps must not exceed 10000')
  }
  safeInteger(policy.inputReserveTokens, 'inputReserveTokens', 0)
  safeInteger(policy.inputEstimateSafetyBps, 'inputEstimateSafetyBps', 10_000)
  if (policy.inputEstimateSafetyBps > 100_000) {
    throw new Error('sponsor-demo: inputEstimateSafetyBps must not exceed 100000')
  }
  safeInteger(policy.inputPriceMicrosPerMillionTokens, 'inputPriceMicrosPerMillionTokens', 0)
  safeInteger(policy.outputPriceMicrosPerMillionTokens, 'outputPriceMicrosPerMillionTokens', 1)
  safeInteger(policy.rewardTokenQuantum, 'rewardTokenQuantum', 1)
  safeInteger(policy.minRewardTokens, 'minRewardTokens', 1)
  safeInteger(policy.maxRewardTokens, 'maxRewardTokens', 1)
  safeInteger(policy.quoteTtlMs, 'quoteTtlMs', 1)
  if (policy.modelPricingSnapshotId.trim().length === 0) {
    throw new Error('sponsor-demo: modelPricingSnapshotId must be non-empty')
  }
  if (policy.minRewardTokens > policy.maxRewardTokens) {
    throw new Error('sponsor-demo: minRewardTokens must not exceed maxRewardTokens')
  }
  if (policy.rewardTokenQuantum > policy.maxRewardTokens) {
    throw new Error('sponsor-demo: rewardTokenQuantum must not exceed maxRewardTokens')
  }
  for (const scenario of policy.sandboxAdScenarios) termsForScenario(scenario, policy)
}

/** Host-owned deterministic scenario selection plus one-shot quote creation. */
export class SponsorDemoRewardQuoteService {
  /**
   * Validate and retain one deployment-owned quote policy.
   * @param policy - Resolved pricing, reserve, rounding, and expiry policy.
   * @param now - Host clock used by deterministic tests and normal runtime expiry.
   */
  constructor(
    private readonly policy: SponsorDemoRewardQuotePolicy,
    private readonly now: () => number = Date.now,
  ) {
    validatePolicy(policy)
  }

  /**
   * Produce one immutable quote from a Host-issued run identity.
   * @param runId - Host-issued run identity used only for stable scenario selection.
   * @returns A one-shot quote whose amount and expiry cannot be supplied by the browser.
   */
  createQuote(runId: string): SponsorDemoRewardQuoteData {
    if (runId.length === 0) throw new Error('sponsor-demo: quote runId must be non-empty')
    const digest = createHash('sha256').update(runId).digest()
    const scenarioIndex = digest.readUInt32BE(0) % this.policy.sandboxAdScenarios.length
    const scenario = this.policy.sandboxAdScenarios[scenarioIndex]
    if (scenario === undefined) throw new Error('sponsor-demo: selected sandbox scenario is missing')
    const terms = termsForScenario(scenario, this.policy)
    const now = this.now()
    if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(now + this.policy.quoteTtlMs)) {
      throw new Error('sponsor-demo: Host clock cannot produce a safe quote expiry')
    }
    return Object.freeze({
      quoteId: randomUUID(),
      scenarioId: scenario.scenarioId,
      pricingBasis: 'market-benchmark-simulated-ecpm',
      ...terms,
      advanceRatioBps: this.policy.advanceRatioBps,
      inputReserveTokens: this.policy.inputReserveTokens,
      inputEstimateSafetyBps: this.policy.inputEstimateSafetyBps,
      modelPricingSnapshotId: this.policy.modelPricingSnapshotId,
      inputPriceMicrosPerMillionTokens: this.policy.inputPriceMicrosPerMillionTokens,
      outputPriceMicrosPerMillionTokens: this.policy.outputPriceMicrosPerMillionTokens,
      rewardTokenQuantum: this.policy.rewardTokenQuantum,
      minRewardTokens: this.policy.minRewardTokens,
      maxRewardTokens: this.policy.maxRewardTokens,
      quotedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.policy.quoteTtlMs).toISOString(),
    })
  }
}
