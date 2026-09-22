import { randomUUID } from 'node:crypto'
import { SponsorDemoRewardQuoteService, DEFAULT_SANDBOX_AD_SCENARIOS } from '../src/reward-quote.ts'
import { TencentGdtSandboxProvider } from '../src/tencent-gdt-sandbox.ts'

/** Fixed historical price simulation, not a live provider quote. */
export const policy = {
  sandboxAdScenarios: DEFAULT_SANDBOX_AD_SCENARIOS,
  advanceRatioBps: 8_000, inputReserveTokens: 512, inputEstimateSafetyBps: 15_000,
  inputPriceMicrosPerMillionTokens: 3_000_000, outputPriceMicrosPerMillionTokens: 9_000_000,
  modelPricingSnapshotId: 'illustrative-cny-input3-output9-per-million',
  rewardTokenQuantum: 64, minRewardTokens: 64, maxRewardTokens: 16_384, quoteTtlMs: 300_000,
} as const

let now = Date.now()
const quote = new SponsorDemoRewardQuoteService(policy, () => now).createQuote(randomUUID())
const provider = new TencentGdtSandboxProvider(() => now)
const loaded = provider.load({ runId: 'demo-run', turn: 1, step: 1 }, quote)
const rendered = provider.render(loaded)
// Advance a simulated clock. This is not evidence of real advertising visibility.
now += 6_000
const completion = provider.completeImpression(rendered, quote, 6_000)
console.log(JSON.stringify({
  mode: 'keyless-local-sandbox', quote,
  signatureVerified: provider.verifyCallback(completion.callback, rendered, quote),
  revenue: completion.revenue,
  disclosure: 'No model request, advertising network, payment, or real token credit is involved.',
}, null, 2))
