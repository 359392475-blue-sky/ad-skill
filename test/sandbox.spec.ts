import { describe, expect, it } from 'vitest'
import { SponsorDemoRewardQuoteService, DEFAULT_SANDBOX_AD_SCENARIOS } from '../src/reward-quote.ts'
import { TencentGdtSandboxProvider } from '../src/tencent-gdt-sandbox.ts'

const policy = {
  sandboxAdScenarios: DEFAULT_SANDBOX_AD_SCENARIOS,
  advanceRatioBps: 8_000, inputReserveTokens: 512, inputEstimateSafetyBps: 15_000,
  inputPriceMicrosPerMillionTokens: 3_000_000, outputPriceMicrosPerMillionTokens: 9_000_000,
  modelPricingSnapshotId: 'illustrative-only', rewardTokenQuantum: 64,
  minRewardTokens: 64, maxRewardTokens: 16_384, quoteTtlMs: 300_000,
} as const
function setup() {
  let now = 0
  const quote = new SponsorDemoRewardQuoteService(policy, () => now).createQuote('run-1')
  const provider = new TencentGdtSandboxProvider(() => now)
  const rendered = provider.render(provider.load({runId:'run-1',turn:1,step:1}, quote))
  return {quote,provider,rendered, advance:(ms:number)=>{now+=ms}}
}
describe('local signed advertising callbacks', () => {
  it('rejects early completion and invalid visible durations', () => {
    const {provider,rendered,quote}=setup()
    expect(()=>provider.completeImpression(rendered,quote,6000)).toThrow(/duration/)
    expect(()=>provider.completeImpression(rendered,quote,0)).toThrow(/positive/)
  })
  it('binds callbacks to the same run, render and quote, while preserving zero real revenue',()=>{
    const {provider,rendered,quote,advance}=setup();advance(6000)
    const completed=provider.completeImpression(rendered,quote,6000)
    expect(completed.revenue.externalRevenueMicros).toBe(0)
    expect(provider.verifyCallback(completed.callback,rendered,quote)).toBe(true)
    expect(provider.verifyCallback({...completed.callback,runId:'another-run'},rendered,quote)).toBe(false)
    expect(provider.verifyCallback({...completed.callback,simulatedAdValueMicros:99999},rendered,quote)).toBe(false)
    expect(provider.verifyCallback({...completed.callback,signature:'bad'},rendered,quote)).toBe(false)
    expect(new TencentGdtSandboxProvider().verifyCallback(completed.callback,rendered,quote)).toBe(false)
  })
  it('rejects a valid render paired with an unrelated quote',()=>{
    const {provider,rendered,advance}=setup();advance(6000)
    const quote=new SponsorDemoRewardQuoteService(policy).createQuote('other')
    expect(()=>provider.completeImpression(rendered,quote,6000)).toThrow(/does not match/)
  })
})
