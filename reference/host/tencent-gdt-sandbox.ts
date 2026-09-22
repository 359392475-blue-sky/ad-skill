/** Host-owned deterministic Tencent GDT-compatible advertising sandbox. */

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type {
  SponsorDemoAdImpressionData,
  SponsorDemoAdLoadedData,
  SponsorDemoAdRenderedData,
  SponsorDemoAdRevenueData,
  SponsorDemoRewardQuoteData,
} from './types.ts'

/** Fixed provider identity that always denotes a local sandbox, never Tencent settlement. */
export const TENCENT_GDT_SANDBOX_PROVIDER = 'tencent-gdt-sandbox' as const

/** Fixed ordinary-ad format exercised by the local sandbox. */
export const TENCENT_GDT_SANDBOX_FORMAT = 'native-template' as const

/** Non-secret local placement identity used only by the sandbox contract. */
export const TENCENT_GDT_SANDBOX_PLACEMENT_ID = 'tencent-gdt-sandbox-placement-v1'

/** Non-secret local creative identity shared with the browser mock renderer. */
export const TENCENT_GDT_SANDBOX_CREATIVE_ID = 'tencent-gdt-native-mock-v1'

interface SandboxLocation {
  readonly runId: string
  readonly turn: number
  readonly step: number
}

/** Simulation-only server callback; its signature is never written to a Session event. */
export interface TencentGdtSandboxVerificationCallback {
  readonly runId: string
  readonly turn: number
  readonly step: number
  readonly callbackId: string
  readonly quoteId: string
  readonly simulatedAdValueMicros: number
  readonly requestId: string
  readonly renderId: string
  readonly impressionId: string
  readonly completionStatus: 'completed'
  readonly completedAt: string
  readonly signature: string
}

/** Complete Host-created playback evidence before the Token service redeems a grant. */
export interface TencentGdtSandboxCompletion {
  readonly impression: SponsorDemoAdImpressionData
  readonly revenue: SponsorDemoAdRevenueData
  readonly callback: TencentGdtSandboxVerificationCallback
}

/**
 * Produce fixed local advertising data without a network request or external settlement.
 * IDs, simulated-value semantics, and grant amounts are owned entirely by the Host.
 */
export class TencentGdtSandboxProvider {
  /** Ephemeral simulation secret. It is never exposed or persisted. */
  readonly #callbackSecret = randomBytes(32)

  /**
   * @param now - Host clock used for local duration admission and deterministic tests.
   */
  constructor(private readonly now: () => number = Date.now) {}

  private timestamp(): string {
    return new Date(this.now()).toISOString()
  }

  /** Whether Host time proves that the rendered creative met its configured minimum duration. */
  hasMetMinimumVisibleDuration(
    rendered: SponsorDemoAdRenderedData,
    minimumVisibleMs: number,
  ): boolean {
    if (!Number.isSafeInteger(minimumVisibleMs) || minimumVisibleMs < 1) return false
    const renderedAt = Date.parse(rendered.renderedAt)
    return Number.isFinite(renderedAt) && this.now() - renderedAt >= minimumVisibleMs
  }

  private callbackPayload(callback: Omit<TencentGdtSandboxVerificationCallback, 'signature'>): string {
    return [
      callback.runId,
      String(callback.turn),
      String(callback.step),
      callback.callbackId,
      callback.quoteId,
      String(callback.simulatedAdValueMicros),
      callback.requestId,
      callback.renderId,
      callback.impressionId,
      callback.completionStatus,
      callback.completedAt,
    ].join('\n')
  }

  private sign(callback: Omit<TencentGdtSandboxVerificationCallback, 'signature'>): string {
    return createHmac('sha256', this.#callbackSecret)
      .update(this.callbackPayload(callback))
      .digest('hex')
  }

  /**
   * Create one local load result for an exact sponsored run.
   * @param location - Host-owned run location.
   * @param quote - Immutable Host quote selected before the browser can accept the offer.
   * @returns the fixed creative, quote binding, and a new opaque request identity.
   */
  load(location: SandboxLocation, quote: SponsorDemoRewardQuoteData): SponsorDemoAdLoadedData {
    return {
      ...location,
      requestId: randomUUID(),
      quoteId: quote.quoteId,
      scenarioId: quote.scenarioId,
      pricingBasis: quote.pricingBasis,
      simulatedAdValueMicros: quote.simulatedAdValueMicros,
      adProvider: TENCENT_GDT_SANDBOX_PROVIDER,
      adFormat: TENCENT_GDT_SANDBOX_FORMAT,
      placementId: TENCENT_GDT_SANDBOX_PLACEMENT_ID,
      creativeId: TENCENT_GDT_SANDBOX_CREATIVE_ID,
      loadedAt: this.timestamp(),
    }
  }

  /**
   * Create one render acknowledgement from a Host-created load result.
   * @param loaded - exact sandbox load result retained by the Host state machine.
   * @returns a new opaque render identity.
   */
  render(loaded: SponsorDemoAdLoadedData): SponsorDemoAdRenderedData {
    return {
      runId: loaded.runId,
      turn: loaded.turn,
      step: loaded.step,
      requestId: loaded.requestId,
      quoteId: loaded.quoteId,
      renderId: randomUUID(),
      renderedAt: this.timestamp(),
    }
  }

  /**
   * Complete one admitted local impression and produce a signed simulated Tencent callback.
   * @param rendered - exact sandbox render retained by the Host state machine.
   * @param quote - Exact Host quote retained by the run state machine.
   * @returns linked impression, simulated market value, and callback records.
   */
  completeImpression(
    rendered: SponsorDemoAdRenderedData,
    quote: SponsorDemoRewardQuoteData,
    minimumVisibleMs: number,
  ): TencentGdtSandboxCompletion {
    if (rendered.quoteId !== quote.quoteId) {
      throw new Error('sponsor-demo: sandbox render does not match its Host quote')
    }
    if (!Number.isSafeInteger(minimumVisibleMs) || minimumVisibleMs < 1) {
      throw new Error('sponsor-demo: sandbox minimumVisibleMs must be a positive safe integer')
    }
    const completedAt = this.now()
    if (!this.hasMetMinimumVisibleDuration(rendered, minimumVisibleMs)) {
      throw new Error('sponsor-demo: sandbox creative has not met its Host minimum visible duration')
    }
    const impressionId = randomUUID()
    const revenueEventId = randomUUID()
    const now = new Date(completedAt).toISOString()
    const impression: SponsorDemoAdImpressionData = {
      runId: rendered.runId,
      turn: rendered.turn,
      step: rendered.step,
      requestId: rendered.requestId,
      quoteId: quote.quoteId,
      renderId: rendered.renderId,
      impressionId,
      impressedAt: now,
    }
    const revenue: SponsorDemoAdRevenueData = {
      runId: rendered.runId,
      turn: rendered.turn,
      step: rendered.step,
      requestId: rendered.requestId,
      impressionId,
      revenueEventId,
      quoteId: quote.quoteId,
      currency: 'CNY',
      revenueKind: 'sandbox-market-benchmark-no-external-settlement',
      pricingBasis: quote.pricingBasis,
      simulatedAdValueMicros: quote.simulatedAdValueMicros,
      externalRevenueMicros: 0,
      recordedAt: now,
    }
    const unsignedCallback: Omit<TencentGdtSandboxVerificationCallback, 'signature'> = {
      runId: rendered.runId,
      turn: rendered.turn,
      step: rendered.step,
      callbackId: randomUUID(),
      quoteId: quote.quoteId,
      simulatedAdValueMicros: quote.simulatedAdValueMicros,
      requestId: rendered.requestId,
      renderId: rendered.renderId,
      impressionId,
      completionStatus: 'completed',
      completedAt: now,
    }
    const callback = { ...unsignedCallback, signature: this.sign(unsignedCallback) }
    return { impression, revenue, callback }
  }

  /**
   * Verify one simulation-only server callback against Host-retained render evidence.
   * A real integration replaces this process-local HMAC with Tencent's server contract.
   * @param callback - Complete callback payload and ephemeral sandbox signature.
   * @param rendered - Host-retained render identity the callback must match exactly.
   * @param quote - Host-retained quote identity and simulated value.
   * @returns Whether the identities and constant-time HMAC comparison both succeed.
   */
  verifyCallback(
    callback: TencentGdtSandboxVerificationCallback,
    rendered: SponsorDemoAdRenderedData,
    quote: SponsorDemoRewardQuoteData,
  ): boolean {
    if (callback.runId !== rendered.runId
      || callback.turn !== rendered.turn
      || callback.step !== rendered.step
      || callback.requestId !== rendered.requestId
      || callback.renderId !== rendered.renderId
      || callback.quoteId !== rendered.quoteId
      || callback.quoteId !== quote.quoteId
      || callback.simulatedAdValueMicros !== quote.simulatedAdValueMicros) return false
    const { signature, ...unsigned } = callback
    if (!/^[0-9a-f]{64}$/u.test(signature)) return false
    const actual = Buffer.from(signature, 'hex')
    const expected = Buffer.from(this.sign(unsigned), 'hex')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }
}
