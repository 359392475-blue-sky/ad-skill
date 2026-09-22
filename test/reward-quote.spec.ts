import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SANDBOX_AD_SCENARIOS,
  SponsorDemoRewardQuoteService,
} from '../src/reward-quote.ts'

const POLICY = {
  sandboxAdScenarios: DEFAULT_SANDBOX_AD_SCENARIOS,
  advanceRatioBps: 8_000,
  inputReserveTokens: 512,
  inputEstimateSafetyBps: 15_000,
  inputPriceMicrosPerMillionTokens: 3_000_000,
  outputPriceMicrosPerMillionTokens: 9_000_000,
  modelPricingSnapshotId: 'deepseek-v4-flash-2026-08-21-peak-cache-miss-cny',
  rewardTokenQuantum: 64,
  minRewardTokens: 64,
  maxRewardTokens: 16_384,
  quoteTtlMs: 300_000,
} as const

function expectedReward(marketBenchmarkEcpmMicros: number): number {
  const simulatedAdValueMicros = Math.floor(marketBenchmarkEcpmMicros / 1_000)
  const fundedBudgetMicros = Math.floor(simulatedAdValueMicros * POLICY.advanceRatioBps / 10_000)
  const inputReserveMicros = Math.ceil(
    POLICY.inputReserveTokens * POLICY.inputPriceMicrosPerMillionTokens / 1_000_000,
  )
  const rawReward = Math.floor(
    Math.max(0, fundedBudgetMicros - inputReserveMicros) * 1_000_000
      / POLICY.outputPriceMicrosPerMillionTokens,
  )
  return Math.floor(Math.min(rawReward, POLICY.maxRewardTokens) / POLICY.rewardTokenQuantum)
    * POLICY.rewardTokenQuantum
}

describe('Host reward quotes', () => {
  it('turns all three nonzero benchmark scenarios into formula-derived rewards', () => {
    const service = new SponsorDemoRewardQuoteService(POLICY, () => Date.parse('2026-08-21T00:00:00.000Z'))
    const quotes = new Map<string, ReturnType<typeof service.createQuote>>()
    for (let index = 0; index < 100 && quotes.size < 3; index += 1) {
      const quote = service.createQuote(`run-${String(index)}`)
      quotes.set(quote.scenarioId, quote)
    }

    expect(quotes.size).toBe(3)
    for (const scenario of DEFAULT_SANDBOX_AD_SCENARIOS) {
      const quote = quotes.get(scenario.scenarioId)
      expect(quote).toMatchObject({
        scenarioId: scenario.scenarioId,
        pricingBasis: 'market-benchmark-simulated-ecpm',
        marketBenchmarkEcpmMicros: scenario.marketBenchmarkEcpmMicros,
        simulatedAdValueMicros: Math.floor(scenario.marketBenchmarkEcpmMicros / 1_000),
        rewardTokens: expectedReward(scenario.marketBenchmarkEcpmMicros),
        modelPricingSnapshotId: POLICY.modelPricingSnapshotId,
        quotedAt: '2026-08-21T00:00:00.000Z',
        expiresAt: '2026-08-21T00:05:00.000Z',
      })
    }
    expect([...quotes.values()].map(quote => quote.rewardTokens).sort((a, b) => a - b))
      .toEqual([320, 1_600, 3_776])
  })

  it('selects the same scenario for one run while issuing distinct one-shot quote identities', () => {
    const service = new SponsorDemoRewardQuoteService(POLICY, () => 0)
    const first = service.createQuote('stable-run')
    const second = service.createQuote('stable-run')

    expect(second.scenarioId).toBe(first.scenarioId)
    expect(second.rewardTokens).toBe(first.rewardTokens)
    expect(second.quoteId).not.toBe(first.quoteId)
  })
})
