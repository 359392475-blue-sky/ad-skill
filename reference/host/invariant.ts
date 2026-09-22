/** Package-owned durable sponsorship-demo invariants. */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import {
  SPONSOR_DEMO_DISCLOSURE,
  SPONSOR_DEMO_ASSET_ID,
  SPONSOR_DEMO_NAME,
} from './index.ts'
const PACKAGE_NAME = '@deepseek-ai/dsh-sponsor-demo'
const TENCENT_GDT_SANDBOX_PROVIDER = 'tencent-gdt-sandbox'
const TENCENT_GDT_SANDBOX_FORMAT = 'native-template'
const TENCENT_GDT_SANDBOX_PLACEMENT_ID = 'tencent-gdt-sandbox-placement-v1'
const TENCENT_GDT_SANDBOX_CREATIVE_ID = 'tencent-gdt-native-mock-v1'
const MICROS_PER_CNY = 1_000_000n
const BPS_DENOMINATOR = 10_000n
const IMPRESSIONS_PER_ECPM = 1_000n

export const name = 'sponsor-demo-invariant'
export const inject = ['invariants']

function record(value: unknown, label: string, fail: InvariantFailure): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${label} data must be an object`)
  }
  return value as Record<string, unknown>
}

function nonEmpty(value: unknown, label: string, fail: InvariantFailure): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a non-empty string`)
  return value
}

function safeInteger(value: unknown, label: string, min: number, fail: InvariantFailure): number {
  if (!Number.isSafeInteger(value) || (value as number) < min) {
    fail(`${label} must be a safe integer >= ${min}`)
  }
  return value as number
}

function expectedReservedCreditMicros(
  maxEstimatedCostMicros: number,
  fundedBudgetMicros: number,
  operatorInputSubsidyMicros = 0,
): number {
  const configuredCap = BigInt(maxEstimatedCostMicros)
  const proposedCredit = BigInt(fundedBudgetMicros) + BigInt(operatorInputSubsidyMicros)
  return Number(proposedCredit < configuredCap ? proposedCredit : configuredCap)
}

const REWARD_QUOTE_FIELDS = [
  'quoteId', 'scenarioId', 'pricingBasis', 'marketBenchmarkEcpmMicros',
  'simulatedAdValueMicros', 'advanceRatioBps', 'fundedBudgetMicros',
  'inputReserveTokens', 'inputEstimateSafetyBps', 'inputReserveMicros', 'modelPricingSnapshotId',
  'inputPriceMicrosPerMillionTokens', 'outputPriceMicrosPerMillionTokens',
  'rewardTokenQuantum', 'minRewardTokens', 'maxRewardTokens', 'rewardTokens',
  'quotedAt', 'expiresAt',
] as const

function sameRewardQuote(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  return REWARD_QUOTE_FIELDS.every(field => left[field] === right[field])
}

function validateRewardQuote(value: unknown, label: string, fail: InvariantFailure): Record<string, unknown> {
  const quote = record(value, label, fail)
  nonEmpty(quote.quoteId, `${label} quoteId`, fail)
  nonEmpty(quote.scenarioId, `${label} scenarioId`, fail)
  nonEmpty(quote.modelPricingSnapshotId, `${label} modelPricingSnapshotId`, fail)
  if (quote.pricingBasis !== 'market-benchmark-simulated-ecpm') {
    fail(`${label} must disclose market-benchmark simulated pricing`)
  }
  for (const field of [
    'marketBenchmarkEcpmMicros', 'simulatedAdValueMicros', 'advanceRatioBps',
    'fundedBudgetMicros', 'inputReserveMicros', 'outputPriceMicrosPerMillionTokens',
    'inputEstimateSafetyBps', 'rewardTokenQuantum',
  ] as const) safeInteger(quote[field], `${label} ${field}`, 1, fail)
  const minRewardTokens = safeInteger(quote.minRewardTokens, `${label} minRewardTokens`, 1, fail)
  const maxRewardTokens = safeInteger(quote.maxRewardTokens, `${label} maxRewardTokens`, 1, fail)
  const rewardTokens = safeInteger(quote.rewardTokens, `${label} rewardTokens`, 1, fail)
  for (const field of [
    'inputReserveTokens', 'inputPriceMicrosPerMillionTokens',
  ] as const) safeInteger(quote[field], `${label} ${field}`, 0, fail)
  if ((quote.advanceRatioBps as number) > 10_000) {
    fail(`${label} advanceRatioBps must not exceed 10000`)
  }
  if ((quote.inputEstimateSafetyBps as number) < 10_000
    || (quote.inputEstimateSafetyBps as number) > 100_000) {
    fail(`${label} inputEstimateSafetyBps must be between 10000 and 100000`)
  }
  const simulatedValue = Number(
    BigInt(quote.marketBenchmarkEcpmMicros as number) / IMPRESSIONS_PER_ECPM,
  )
  const fundedBudget = Number(
    BigInt(simulatedValue) * BigInt(quote.advanceRatioBps as number) / BPS_DENOMINATOR,
  )
  const reserveNumerator = BigInt(quote.inputReserveTokens as number)
    * BigInt(quote.inputPriceMicrosPerMillionTokens as number)
  const inputReserve = Number((reserveNumerator + MICROS_PER_CNY - 1n) / MICROS_PER_CNY)
  const rawReward = BigInt(Math.max(0, fundedBudget - inputReserve)) * MICROS_PER_CNY
    / BigInt(quote.outputPriceMicrosPerMillionTokens as number)
  const boundedReward = Number(rawReward > BigInt(maxRewardTokens)
    ? BigInt(maxRewardTokens)
    : rawReward)
  const calculatedReward = Math.floor(boundedReward / (quote.rewardTokenQuantum as number))
    * (quote.rewardTokenQuantum as number)
  if (quote.simulatedAdValueMicros !== simulatedValue
    || quote.fundedBudgetMicros !== fundedBudget
    || quote.inputReserveMicros !== inputReserve
    || quote.rewardTokens !== calculatedReward
    || rewardTokens < minRewardTokens
    || rewardTokens > maxRewardTokens) {
    fail(`${label} must retain the Host reward calculation`)
  }
  const quotedAt = Date.parse(nonEmpty(quote.quotedAt, `${label} quotedAt`, fail))
  const expiresAt = Date.parse(nonEmpty(quote.expiresAt, `${label} expiresAt`, fail))
  if (!Number.isFinite(quotedAt) || !Number.isFinite(expiresAt) || expiresAt <= quotedAt) {
    fail(`${label} must contain an increasing quote validity interval`)
  }
  return quote
}

function priorOffer(
  history: readonly SessionEvent[],
  runId: string,
): SessionEvent<'sponsorship-demo/offer'> | undefined {
  return history.findLast((event): event is SessionEvent<'sponsorship-demo/offer'> =>
    event.type === 'sponsorship-demo/offer' && event.data.runId === runId)
}

function priorPlayback(
  history: readonly SessionEvent[],
  runId: string,
): SessionEvent<'sponsorship-demo/playback-started'> | undefined {
  return history.findLast((event): event is SessionEvent<'sponsorship-demo/playback-started'> =>
    event.type === 'sponsorship-demo/playback-started' && event.data.runId === runId)
}

function priorReward(
  history: readonly SessionEvent[],
  runId: string,
): SessionEvent<'sponsorship-demo/reward-issued'> | undefined {
  return history.findLast((event): event is SessionEvent<'sponsorship-demo/reward-issued'> =>
    event.type === 'sponsorship-demo/reward-issued' && event.data.runId === runId)
}

function priorAdLoaded(
  history: readonly SessionEvent[],
  runId: string,
): SessionEvent<'sponsorship-demo/ad-loaded'> | undefined {
  return history.findLast((event): event is SessionEvent<'sponsorship-demo/ad-loaded'> =>
    event.type === 'sponsorship-demo/ad-loaded' && event.data.runId === runId)
}

function priorAdRendered(
  history: readonly SessionEvent[],
  runId: string,
): SessionEvent<'sponsorship-demo/ad-rendered'> | undefined {
  return history.findLast((event): event is SessionEvent<'sponsorship-demo/ad-rendered'> =>
    event.type === 'sponsorship-demo/ad-rendered' && event.data.runId === runId)
}

function priorAdImpression(
  history: readonly SessionEvent[],
  runId: string,
): SessionEvent<'sponsorship-demo/ad-impression'> | undefined {
  return history.findLast((event): event is SessionEvent<'sponsorship-demo/ad-impression'> =>
    event.type === 'sponsorship-demo/ad-impression' && event.data.runId === runId)
}

function priorAdRevenue(
  history: readonly SessionEvent[],
  runId: string,
): SessionEvent<'sponsorship-demo/ad-revenue'> | undefined {
  return history.findLast((event): event is SessionEvent<'sponsorship-demo/ad-revenue'> =>
    event.type === 'sponsorship-demo/ad-revenue' && event.data.runId === runId)
}

function priorTokenGrant(
  history: readonly SessionEvent[],
  runId: string,
): SessionEvent<'sponsorship-demo/token-grant-issued'> | undefined {
  return history.findLast((event): event is SessionEvent<'sponsorship-demo/token-grant-issued'> =>
    event.type === 'sponsorship-demo/token-grant-issued' && event.data.runId === runId)
}

function priorPoolReservation(
  history: readonly SessionEvent[],
  grantId: string,
): SessionEvent<'sponsorship-demo/operator-pool-reserved'> | undefined {
  return history.findLast((event): event is SessionEvent<'sponsorship-demo/operator-pool-reserved'> =>
    event.type === 'sponsorship-demo/operator-pool-reserved' && event.data.grantId === grantId)
}

function priorPoolSpends(
  history: readonly SessionEvent[],
  grantId: string,
): SessionEvent<'sponsorship-demo/operator-pool-spent'>[] {
  return history.filter((event): event is SessionEvent<'sponsorship-demo/operator-pool-spent'> =>
    event.type === 'sponsorship-demo/operator-pool-spent' && event.data.grantId === grantId)
}

function priorPoolRelease(
  history: readonly SessionEvent[],
  grantId: string,
): SessionEvent<'sponsorship-demo/operator-pool-released'> | undefined {
  return history.findLast((event): event is SessionEvent<'sponsorship-demo/operator-pool-released'> =>
    event.type === 'sponsorship-demo/operator-pool-released' && event.data.grantId === grantId)
}

function priorAdVerification(
  history: readonly SessionEvent[],
  runId: string,
): SessionEvent<'sponsorship-demo/ad-verification-received'> | undefined {
  return history.findLast((event): event is SessionEvent<'sponsorship-demo/ad-verification-received'> =>
    event.type === 'sponsorship-demo/ad-verification-received' && event.data.runId === runId)
}

function priorTokenSettlement(
  history: readonly SessionEvent[],
  runId: string,
): SessionEvent<'sponsorship-demo/token-grant-settled'> | undefined {
  return history.findLast((event): event is SessionEvent<'sponsorship-demo/token-grant-settled'> =>
    event.type === 'sponsorship-demo/token-grant-settled' && event.data.runId === runId)
}

function priorTokenRevocation(
  history: readonly SessionEvent[],
  runId: string,
): SessionEvent<'sponsorship-demo/token-grant-revoked'> | undefined {
  return history.findLast((event): event is SessionEvent<'sponsorship-demo/token-grant-revoked'> =>
    event.type === 'sponsorship-demo/token-grant-revoked' && event.data.runId === runId)
}

function priorAdFailure(
  history: readonly SessionEvent[],
  runId: string,
): SessionEvent<'sponsorship-demo/ad-failure-recorded'> | undefined {
  return history.findLast((event): event is SessionEvent<'sponsorship-demo/ad-failure-recorded'> =>
    event.type === 'sponsorship-demo/ad-failure-recorded' && event.data.runId === runId)
}

function priorGrantConsumptions(
  history: readonly SessionEvent[],
  grantId: string,
): SessionEvent<'sponsorship-demo/token-grant-consumed'>[] {
  return history.filter((event): event is SessionEvent<'sponsorship-demo/token-grant-consumed'> =>
    event.type === 'sponsorship-demo/token-grant-consumed' && event.data.grantId === grantId)
}

function validateOffer(
  history: readonly SessionEvent[],
  event: SessionEvent<'sponsorship-demo/offer'>,
  fail: InvariantFailure,
): void {
  const data = record(event.data, 'sponsorship-demo/offer', fail)
  const runId = nonEmpty(data.runId, 'sponsorship-demo/offer runId', fail)
  if (priorOffer(history, runId) !== undefined) {
    fail(`sponsorship-demo/offer runId ${JSON.stringify(runId)} is already owned`)
  }
  const turn = safeInteger(data.turn, 'sponsorship-demo/offer turn', 1, fail)
  const step = safeInteger(data.step, 'sponsorship-demo/offer step', 1, fail)
  if (data.sponsorName !== SPONSOR_DEMO_NAME
    || data.sponsorDisclosure !== SPONSOR_DEMO_DISCLOSURE) {
    fail('sponsorship-demo/offer must retain the fixed simulated-brand disclosure')
  }
  nonEmpty(data.provider, 'sponsorship-demo/offer provider', fail)
  nonEmpty(data.model, 'sponsorship-demo/offer model', fail)
  safeInteger(data.maxSteps, 'sponsorship-demo/offer maxSteps', 1, fail)
  safeInteger(data.maxOutputTokensPerRequest, 'sponsorship-demo/offer maxOutputTokensPerRequest', 1, fail)
  safeInteger(data.maxTotalTokens, 'sponsorship-demo/offer maxTotalTokens', 1, fail)
  safeInteger(data.maxEstimatedCostMicros, 'sponsorship-demo/offer maxEstimatedCostMicros', 1, fail)
  if (data.operatorInputSubsidyMicros !== undefined) {
    safeInteger(
      data.operatorInputSubsidyMicros,
      'sponsorship-demo/offer operatorInputSubsidyMicros',
      0,
      fail,
    )
  }
  safeInteger(data.rewardTokens, 'sponsorship-demo/offer rewardTokens', 1, fail)
  const rewardQuote = validateRewardQuote(
    data.rewardQuote,
    'sponsorship-demo/offer rewardQuote',
    fail,
  )
  if (data.rewardTokens !== rewardQuote.rewardTokens) {
    fail('sponsorship-demo/offer rewardTokens must match its Host quote')
  }
  safeInteger(data.adDurationMs, 'sponsorship-demo/offer adDurationMs', 1, fail)
  if (data.presentation !== 'conversation-card' && data.presentation !== 'reasoning-card') {
    fail('sponsorship-demo/offer must select a known presentation')
  }
  if (data.fundingMode !== 'dedicated-sponsor-credential'
    && data.fundingMode !== 'current-credential-simulation') {
    fail('sponsorship-demo/offer must disclose a known fundingMode')
  }
  nonEmpty(data.operatorPoolId, 'sponsorship-demo/offer operatorPoolId', fail)
  safeInteger(
    data.operatorPoolBudgetMicros,
    'sponsorship-demo/offer operatorPoolBudgetMicros',
    1,
    fail,
  )
  safeInteger(data.grantTtlMs, 'sponsorship-demo/offer grantTtlMs', 1, fail)
  if (data.adProvider === 'local-video') {
    if (data.adFormat !== 'rewarded-video' || data.assetId !== SPONSOR_DEMO_ASSET_ID) {
      fail('a local-video offer must name the packaged rewarded-video asset')
    }
  } else if (data.adProvider === TENCENT_GDT_SANDBOX_PROVIDER) {
    if (data.adFormat !== TENCENT_GDT_SANDBOX_FORMAT
      || data.assetId !== TENCENT_GDT_SANDBOX_CREATIVE_ID) {
      fail('a Tencent sandbox offer must name the fixed native-template creative')
    }
  } else {
    fail('sponsorship-demo/offer must select a known adProvider')
  }
  if ((data.rewardTokens as number) > (data.maxTotalTokens as number)) {
    fail('sponsorship-demo/offer reward allowance must fit its total cap')
  }
  if (data.currency !== 'CNY') fail('sponsorship-demo/offer currency must be CNY')

  const openTurn = history.findLast(item => item.type === 'turn/start' || item.type === 'turn/end')
  if (openTurn?.type !== 'turn/start' || openTurn.data.turn !== turn) {
    fail(`sponsorship-demo/offer must name the open turn ${turn}`)
  }
  const openStep = history.findLast(item => item.type === 'step/start' || item.type === 'step/end')
  if (openStep?.type !== 'step/start'
    || openStep.data.turn !== turn
    || openStep.data.step !== step) {
    fail(`sponsorship-demo/offer must name the open step ${turn}/${step}`)
  }
}

function validatePlayback(
  history: readonly SessionEvent[],
  event: SessionEvent<'sponsorship-demo/playback-started'>,
  fail: InvariantFailure,
): void {
  const data = record(event.data, 'sponsorship-demo/playback-started', fail)
  const runId = nonEmpty(data.runId, 'sponsorship-demo/playback-started runId', fail)
  const offer = priorOffer(history, runId)
  if (offer === undefined) fail('sponsorship-demo/playback-started requires a prior matching offer')
  if (offer.data.adProvider !== 'local-video' || offer.data.adFormat !== 'rewarded-video') {
    fail('sponsorship-demo/playback-started requires a local-video offer')
  }
  const decision = history.findLast(item =>
    item.type === 'sponsorship-demo/decision' && item.data.runId === runId)
  if (decision?.type !== 'sponsorship-demo/decision' || decision.data.decision !== 'accepted') {
    fail('sponsorship-demo/playback-started requires an explicitly accepted offer')
  }
  const turn = safeInteger(data.turn, 'sponsorship-demo/playback-started turn', 1, fail)
  const step = safeInteger(data.step, 'sponsorship-demo/playback-started step', 1, fail)
  if (offer.data.turn !== turn || offer.data.step !== step) {
    fail('sponsorship-demo/playback-started location must match its offer')
  }
  nonEmpty(data.playbackId, 'sponsorship-demo/playback-started playbackId', fail)
  nonEmpty(data.startedAt, 'sponsorship-demo/playback-started startedAt', fail)
  if (data.assetId !== offer.data.assetId
    || data.quoteId !== offer.data.rewardQuote.quoteId
    || data.durationMs !== offer.data.adDurationMs
    || data.rewardTokenCap !== offer.data.rewardTokens) {
    fail('sponsorship-demo/playback-started terms must match its offer')
  }
  if (priorPlayback(history, runId) !== undefined) {
    fail('sponsorship-demo/playback-started may start one playback only once')
  }
}

function validateReward(
  history: readonly SessionEvent[],
  event: SessionEvent<'sponsorship-demo/reward-issued'>,
  fail: InvariantFailure,
): void {
  const data = record(event.data, 'sponsorship-demo/reward-issued', fail)
  const runId = nonEmpty(data.runId, 'sponsorship-demo/reward-issued runId', fail)
  const offer = priorOffer(history, runId)
  const playback = priorPlayback(history, runId)
  if (offer === undefined || playback === undefined) {
    fail('sponsorship-demo/reward-issued requires its prior offer and playback')
  }
  const turn = safeInteger(data.turn, 'sponsorship-demo/reward-issued turn', 1, fail)
  const step = safeInteger(data.step, 'sponsorship-demo/reward-issued step', 1, fail)
  if (offer.data.turn !== turn || offer.data.step !== step
    || playback.data.turn !== turn || playback.data.step !== step) {
    fail('sponsorship-demo/reward-issued location must match its playback')
  }
  if (data.playbackId !== playback.data.playbackId) {
    fail('sponsorship-demo/reward-issued playbackId must match its playback')
  }
  if (data.watchedMs !== offer.data.adDurationMs
    || data.quoteId !== offer.data.rewardQuote.quoteId
    || data.grantedTokens !== offer.data.rewardTokens
    || data.verificationKind !== 'local-ended') {
    fail('sponsorship-demo/reward-issued terms must match the locally verified offer')
  }
  const startedAt = Date.parse(nonEmpty(
    playback.data.startedAt,
    'sponsorship-demo/playback-started startedAt',
    fail,
  ))
  const completedAt = Date.parse(nonEmpty(
    data.completedAt,
    'sponsorship-demo/reward-issued completedAt',
    fail,
  ))
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt)
    || completedAt - startedAt < offer.data.adDurationMs) {
    fail('sponsorship-demo/reward-issued must follow the Host minimum playback duration')
  }
  if (priorReward(history, runId) !== undefined) {
    fail('sponsorship-demo/reward-issued may grant one reward only once')
  }
}

function validateAdLoaded(
  history: readonly SessionEvent[],
  event: SessionEvent<'sponsorship-demo/ad-loaded'>,
  fail: InvariantFailure,
): void {
  const data = record(event.data, 'sponsorship-demo/ad-loaded', fail)
  const runId = nonEmpty(data.runId, 'sponsorship-demo/ad-loaded runId', fail)
  const offer = priorOffer(history, runId)
  if (offer === undefined) fail('sponsorship-demo/ad-loaded requires a prior matching offer')
  const decision = history.findLast(item =>
    item.type === 'sponsorship-demo/decision' && item.data.runId === runId)
  if (decision?.type !== 'sponsorship-demo/decision' || decision.data.decision !== 'accepted') {
    fail('sponsorship-demo/ad-loaded requires an accepted sponsorship run')
  }
  if (offer.data.adProvider !== TENCENT_GDT_SANDBOX_PROVIDER
    || offer.data.adFormat !== TENCENT_GDT_SANDBOX_FORMAT) {
    fail('sponsorship-demo/ad-loaded requires a Tencent sandbox offer')
  }
  const turn = safeInteger(data.turn, 'sponsorship-demo/ad-loaded turn', 1, fail)
  const step = safeInteger(data.step, 'sponsorship-demo/ad-loaded step', 1, fail)
  if (offer.data.turn !== turn || offer.data.step !== step) {
    fail('sponsorship-demo/ad-loaded location must match its offer')
  }
  nonEmpty(data.requestId, 'sponsorship-demo/ad-loaded requestId', fail)
  nonEmpty(data.loadedAt, 'sponsorship-demo/ad-loaded loadedAt', fail)
  if (data.adProvider !== TENCENT_GDT_SANDBOX_PROVIDER
    || data.adFormat !== TENCENT_GDT_SANDBOX_FORMAT
    || data.placementId !== TENCENT_GDT_SANDBOX_PLACEMENT_ID
    || data.creativeId !== TENCENT_GDT_SANDBOX_CREATIVE_ID
    || data.quoteId !== offer.data.rewardQuote.quoteId
    || data.scenarioId !== offer.data.rewardQuote.scenarioId
    || data.pricingBasis !== offer.data.rewardQuote.pricingBasis
    || data.simulatedAdValueMicros !== offer.data.rewardQuote.simulatedAdValueMicros) {
    fail('sponsorship-demo/ad-loaded must retain the fixed local sandbox descriptor')
  }
  if (priorAdLoaded(history, runId) !== undefined) {
    fail('sponsorship-demo/ad-loaded may load one request only once')
  }
}

function validateAdRendered(
  history: readonly SessionEvent[],
  event: SessionEvent<'sponsorship-demo/ad-rendered'>,
  fail: InvariantFailure,
): void {
  const data = record(event.data, 'sponsorship-demo/ad-rendered', fail)
  const runId = nonEmpty(data.runId, 'sponsorship-demo/ad-rendered runId', fail)
  const loaded = priorAdLoaded(history, runId)
  if (loaded === undefined) fail('sponsorship-demo/ad-rendered requires its prior sandbox load')
  const turn = safeInteger(data.turn, 'sponsorship-demo/ad-rendered turn', 1, fail)
  const step = safeInteger(data.step, 'sponsorship-demo/ad-rendered step', 1, fail)
  if (loaded.data.turn !== turn || loaded.data.step !== step
    || data.requestId !== loaded.data.requestId
    || data.quoteId !== loaded.data.quoteId) {
    fail('sponsorship-demo/ad-rendered must match its sandbox load')
  }
  nonEmpty(data.renderId, 'sponsorship-demo/ad-rendered renderId', fail)
  nonEmpty(data.renderedAt, 'sponsorship-demo/ad-rendered renderedAt', fail)
  if (priorAdRendered(history, runId) !== undefined) {
    fail('sponsorship-demo/ad-rendered may render one request only once')
  }
}

function validateAdImpression(
  history: readonly SessionEvent[],
  event: SessionEvent<'sponsorship-demo/ad-impression'>,
  fail: InvariantFailure,
): void {
  const data = record(event.data, 'sponsorship-demo/ad-impression', fail)
  const runId = nonEmpty(data.runId, 'sponsorship-demo/ad-impression runId', fail)
  const rendered = priorAdRendered(history, runId)
  if (rendered === undefined) fail('sponsorship-demo/ad-impression requires its prior sandbox render')
  const turn = safeInteger(data.turn, 'sponsorship-demo/ad-impression turn', 1, fail)
  const step = safeInteger(data.step, 'sponsorship-demo/ad-impression step', 1, fail)
  if (rendered.data.turn !== turn || rendered.data.step !== step
    || data.requestId !== rendered.data.requestId
    || data.quoteId !== rendered.data.quoteId
    || data.renderId !== rendered.data.renderId) {
    fail('sponsorship-demo/ad-impression must match its sandbox render')
  }
  nonEmpty(data.impressionId, 'sponsorship-demo/ad-impression impressionId', fail)
  const renderedAt = Date.parse(rendered.data.renderedAt)
  const impressedAt = Date.parse(nonEmpty(
    data.impressedAt,
    'sponsorship-demo/ad-impression impressedAt',
    fail,
  ))
  const offer = priorOffer(history, runId)
  if (offer === undefined || !Number.isFinite(renderedAt) || !Number.isFinite(impressedAt)
    || impressedAt - renderedAt < offer.data.adDurationMs) {
    fail('sponsorship-demo/ad-impression must meet the Host minimum visible duration')
  }
  if (priorAdImpression(history, runId) !== undefined) {
    fail('sponsorship-demo/ad-impression may record one impression only once')
  }
}

function validateAdRevenue(
  history: readonly SessionEvent[],
  event: SessionEvent<'sponsorship-demo/ad-revenue'>,
  fail: InvariantFailure,
): void {
  const data = record(event.data, 'sponsorship-demo/ad-revenue', fail)
  const runId = nonEmpty(data.runId, 'sponsorship-demo/ad-revenue runId', fail)
  const impression = priorAdImpression(history, runId)
  if (impression === undefined) fail('sponsorship-demo/ad-revenue requires its prior sandbox impression')
  const turn = safeInteger(data.turn, 'sponsorship-demo/ad-revenue turn', 1, fail)
  const step = safeInteger(data.step, 'sponsorship-demo/ad-revenue step', 1, fail)
  if (impression.data.turn !== turn || impression.data.step !== step
    || data.requestId !== impression.data.requestId
    || data.impressionId !== impression.data.impressionId) {
    fail('sponsorship-demo/ad-revenue must match its sandbox impression')
  }
  nonEmpty(data.revenueEventId, 'sponsorship-demo/ad-revenue revenueEventId', fail)
  nonEmpty(data.recordedAt, 'sponsorship-demo/ad-revenue recordedAt', fail)
  const offer = priorOffer(history, runId)
  if (offer === undefined) fail('sponsorship-demo/ad-revenue requires its prior offer')
  if (data.currency !== 'CNY'
    || data.revenueKind !== 'sandbox-market-benchmark-no-external-settlement'
    || data.quoteId !== offer.data.rewardQuote.quoteId
    || data.pricingBasis !== offer.data.rewardQuote.pricingBasis
    || data.simulatedAdValueMicros !== offer.data.rewardQuote.simulatedAdValueMicros
    || data.externalRevenueMicros !== 0) {
    fail('sponsorship-demo/ad-revenue must retain simulated value and zero external settlement')
  }
  if (priorAdRevenue(history, runId) !== undefined) {
    fail('sponsorship-demo/ad-revenue may record one revenue event only once')
  }
}

function validatePoolReserved(
  history: readonly SessionEvent[],
  event: SessionEvent<'sponsorship-demo/operator-pool-reserved'>,
  fail: InvariantFailure,
): void {
  const data = record(event.data, 'sponsorship-demo/operator-pool-reserved', fail)
  const runId = nonEmpty(data.runId, 'sponsorship-demo/operator-pool-reserved runId', fail)
  const grantId = nonEmpty(data.grantId, 'sponsorship-demo/operator-pool-reserved grantId', fail)
  const offer = priorOffer(history, runId)
  const decision = history.findLast(item =>
    item.type === 'sponsorship-demo/decision' && item.data.runId === runId)
  if (offer === undefined || decision?.type !== 'sponsorship-demo/decision'
    || decision.data.decision !== 'accepted') {
    fail('sponsorship-demo/operator-pool-reserved requires its offer and accepted decision')
  }
  const turn = safeInteger(data.turn, 'sponsorship-demo/operator-pool-reserved turn', 1, fail)
  const step = safeInteger(data.step, 'sponsorship-demo/operator-pool-reserved step', 1, fail)
  const budget = safeInteger(
    data.operatorPoolBudgetMicros,
    'sponsorship-demo/operator-pool-reserved operatorPoolBudgetMicros',
    1,
    fail,
  )
  const available = safeInteger(
    data.availablePoolMicros,
    'sponsorship-demo/operator-pool-reserved availablePoolMicros',
    0,
    fail,
  )
  if (offer.data.turn !== turn || offer.data.step !== step
    || data.quoteId !== offer.data.rewardQuote.quoteId
    || data.operatorPoolId !== offer.data.operatorPoolId
    || budget !== offer.data.operatorPoolBudgetMicros
    || data.reservedCreditMicros !== expectedReservedCreditMicros(
      offer.data.maxEstimatedCostMicros,
      offer.data.rewardQuote.fundedBudgetMicros,
      offer.data.operatorInputSubsidyMicros,
    )
    || available > budget) {
    fail('sponsorship-demo/operator-pool-reserved must bind the accepted quote and finite pool')
  }
  safeInteger(data.reservedCreditMicros, 'sponsorship-demo/operator-pool-reserved reservedCreditMicros', 1, fail)
  nonEmpty(data.reservedAt, 'sponsorship-demo/operator-pool-reserved reservedAt', fail)
  if (priorPoolReservation(history, grantId) !== undefined) {
    fail('sponsorship-demo/operator-pool-reserved may reserve one grant only once')
  }
}

function validateTokenGrant(
  history: readonly SessionEvent[],
  event: SessionEvent<'sponsorship-demo/token-grant-issued'>,
  fail: InvariantFailure,
): void {
  const data = record(event.data, 'sponsorship-demo/token-grant-issued', fail)
  const runId = nonEmpty(data.runId, 'sponsorship-demo/token-grant-issued runId', fail)
  const offer = priorOffer(history, runId)
  if (offer === undefined) fail('sponsorship-demo/token-grant-issued requires its prior offer')
  const decision = history.findLast(item =>
    item.type === 'sponsorship-demo/decision' && item.data.runId === runId)
  if (decision?.type !== 'sponsorship-demo/decision' || decision.data.decision !== 'accepted') {
    fail('sponsorship-demo/token-grant-issued requires its accepted decision')
  }
  const turn = safeInteger(data.turn, 'sponsorship-demo/token-grant-issued turn', 1, fail)
  const step = safeInteger(data.step, 'sponsorship-demo/token-grant-issued step', 1, fail)
  if (offer.data.turn !== turn || offer.data.step !== step) {
    fail('sponsorship-demo/token-grant-issued location must match its offer')
  }
  const grantId = nonEmpty(data.grantId, 'sponsorship-demo/token-grant-issued grantId', fail)
  const reservation = priorPoolReservation(history, grantId)
  if (reservation === undefined) {
    fail('sponsorship-demo/token-grant-issued requires its prior operator-pool reservation')
  }
  const issuedAt = Date.parse(nonEmpty(data.issuedAt, 'sponsorship-demo/token-grant-issued issuedAt', fail))
  const expiresAt = Date.parse(nonEmpty(data.expiresAt, 'sponsorship-demo/token-grant-issued expiresAt', fail))
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)
    || expiresAt - issuedAt !== offer.data.grantTtlMs) {
    fail('sponsorship-demo/token-grant-issued must retain its configured session grant TTL')
  }
  safeInteger(data.sourceDecisionEventSeq, 'sponsorship-demo/token-grant-issued sourceDecisionEventSeq', 0, fail)
  if (data.sourceDecisionEventSeq !== decision.seq) {
    fail('sponsorship-demo/token-grant-issued must name its exact accepted decision')
  }
  if (data.quoteId !== offer.data.rewardQuote.quoteId
    || data.grantedTokens !== offer.data.rewardTokens
    || data.operatorPoolId !== offer.data.operatorPoolId
    || data.reservedCreditMicros !== expectedReservedCreditMicros(
      offer.data.maxEstimatedCostMicros,
      offer.data.rewardQuote.fundedBudgetMicros,
      offer.data.operatorInputSubsidyMicros,
    )
    || reservation.data.runId !== runId
    || reservation.data.quoteId !== data.quoteId
    || reservation.data.operatorPoolId !== data.operatorPoolId
    || reservation.data.reservedCreditMicros !== data.reservedCreditMicros) {
    fail('sponsorship-demo/token-grant-issued must retain the accepted Host quote')
  }
  if (data.grantKind !== 'provisional' || data.verificationKind !== 'pending-ad-verification') {
    fail('sponsorship-demo/token-grant-issued must be a provisional pending-verification grant')
  }
  if (priorTokenGrant(history, runId) !== undefined) {
    fail('sponsorship-demo/token-grant-issued may issue one provisional grant only once')
  }
}

function validateAdVerification(
  history: readonly SessionEvent[],
  event: SessionEvent<'sponsorship-demo/ad-verification-received'>,
  fail: InvariantFailure,
): void {
  const data = record(event.data, 'sponsorship-demo/ad-verification-received', fail)
  const runId = nonEmpty(data.runId, 'sponsorship-demo/ad-verification-received runId', fail)
  const loaded = priorAdLoaded(history, runId)
  const rendered = priorAdRendered(history, runId)
  const impression = priorAdImpression(history, runId)
  const revenue = priorAdRevenue(history, runId)
  const grant = priorTokenGrant(history, runId)
  if (loaded === undefined || rendered === undefined || impression === undefined
    || revenue === undefined || grant === undefined) {
    fail('sponsorship-demo/ad-verification-received requires the complete provisional sandbox lifecycle')
  }
  const turn = safeInteger(data.turn, 'sponsorship-demo/ad-verification-received turn', 1, fail)
  const step = safeInteger(data.step, 'sponsorship-demo/ad-verification-received step', 1, fail)
  if (loaded.data.turn !== turn || loaded.data.step !== step
    || data.requestId !== loaded.data.requestId
    || data.renderId !== rendered.data.renderId
    || data.impressionId !== impression.data.impressionId
    || data.quoteId !== grant.data.quoteId) {
    fail('sponsorship-demo/ad-verification-received must match its Host-retained sandbox evidence')
  }
  nonEmpty(data.callbackId, 'sponsorship-demo/ad-verification-received callbackId', fail)
  nonEmpty(data.receivedAt, 'sponsorship-demo/ad-verification-received receivedAt', fail)
  if (data.adProvider !== TENCENT_GDT_SANDBOX_PROVIDER
    || data.completionStatus !== 'completed'
    || data.signatureKind !== 'sandbox-hmac-sha256'
    || data.signatureVerified !== true) {
    fail('sponsorship-demo/ad-verification-received must retain verified simulation-only callback semantics')
  }
  if (priorAdVerification(history, runId) !== undefined) {
    fail('sponsorship-demo/ad-verification-received may accept one callback only once')
  }
  if (priorTokenRevocation(history, runId) !== undefined) {
    fail('sponsorship-demo/ad-verification-received cannot verify a revoked grant')
  }
}

function validateTokenGrantSettled(
  history: readonly SessionEvent[],
  event: SessionEvent<'sponsorship-demo/token-grant-settled'>,
  fail: InvariantFailure,
): void {
  const data = record(event.data, 'sponsorship-demo/token-grant-settled', fail)
  const runId = nonEmpty(data.runId, 'sponsorship-demo/token-grant-settled runId', fail)
  const offer = priorOffer(history, runId)
  const grant = priorTokenGrant(history, runId)
  if (offer === undefined || grant === undefined) {
    fail('sponsorship-demo/token-grant-settled requires its offer and provisional grant')
  }
  const turn = safeInteger(data.turn, 'sponsorship-demo/token-grant-settled turn', 1, fail)
  const step = safeInteger(data.step, 'sponsorship-demo/token-grant-settled step', 1, fail)
  if (offer.data.turn !== turn || offer.data.step !== step
    || data.grantId !== grant.data.grantId
    || data.quoteId !== grant.data.quoteId) {
    fail('sponsorship-demo/token-grant-settled must match its provisional grant')
  }
  if (data.settlementStatus !== 'redeemed' || data.redeemedTokens !== grant.data.grantedTokens) {
    fail('sponsorship-demo/token-grant-settled must redeem the Host-fixed provisional grant')
  }
  nonEmpty(data.settledAt, 'sponsorship-demo/token-grant-settled settledAt', fail)
  if (data.verificationKind === 'tencent-gdt-sandbox-server-callback') {
    const verification = priorAdVerification(history, runId)
    if (verification === undefined || data.sourceCallbackId !== verification.data.callbackId
      || data.sourcePlaybackId !== undefined) {
      fail('a Tencent grant settlement must match its verified server callback')
    }
  } else if (data.verificationKind === 'local-video-ended') {
    const reward = priorReward(history, runId)
    if (reward === undefined || data.sourcePlaybackId !== reward.data.playbackId
      || data.sourceCallbackId !== undefined) {
      fail('a local-video grant settlement must match its completed playback')
    }
  } else {
    fail('sponsorship-demo/token-grant-settled has an unknown verification kind')
  }
  if (priorTokenSettlement(history, runId) !== undefined) {
    fail('sponsorship-demo/token-grant-settled may redeem one grant only once')
  }
  if (priorTokenRevocation(history, runId) !== undefined) {
    fail('sponsorship-demo/token-grant-settled cannot redeem a revoked grant')
  }
}

function validateTokenGrantRevoked(
  history: readonly SessionEvent[],
  event: SessionEvent<'sponsorship-demo/token-grant-revoked'>,
  fail: InvariantFailure,
): void {
  const data = record(event.data, 'sponsorship-demo/token-grant-revoked', fail)
  const runId = nonEmpty(data.runId, 'sponsorship-demo/token-grant-revoked runId', fail)
  const offer = priorOffer(history, runId)
  const grant = priorTokenGrant(history, runId)
  if (offer === undefined || grant === undefined) {
    fail('sponsorship-demo/token-grant-revoked requires its offer and provisional grant')
  }
  const turn = safeInteger(data.turn, 'sponsorship-demo/token-grant-revoked turn', 1, fail)
  const step = safeInteger(data.step, 'sponsorship-demo/token-grant-revoked step', 1, fail)
  if (offer.data.turn !== turn || offer.data.step !== step
    || data.grantId !== grant.data.grantId
    || data.quoteId !== grant.data.quoteId) {
    fail('sponsorship-demo/token-grant-revoked must match its provisional grant')
  }
  const reasons = [
    'load-failed', 'render-failed', 'playback-incomplete', 'verification-rejected',
    'session-ended', 'grant-expired', 'grant-exhausted', 'budget-capped', 'plugin-disposed',
  ]
  if (!reasons.includes(String(data.reason))) {
    fail('sponsorship-demo/token-grant-revoked has an unknown reason')
  }
  const adFailure = priorAdFailure(history, runId)
  if (adFailure !== undefined && data.reason !== adFailure.data.reason) {
    fail('sponsorship-demo/token-grant-revoked must retain its recorded ad failure reason')
  }
  for (const field of [
    'grantedTokens', 'consumedTokensBeforeRevocation', 'revokedTokens',
    'fundedBudgetMicros', 'consumedCostMicrosBeforeRevocation', 'revokedCreditMicros',
  ] as const) {
    safeInteger(data[field], `sponsorship-demo/token-grant-revoked ${field}`, 0, fail)
  }
  if (data.grantedTokens !== grant.data.grantedTokens
    || (data.consumedTokensBeforeRevocation as number) + (data.revokedTokens as number)
      !== grant.data.grantedTokens) {
    fail('sponsorship-demo/token-grant-revoked must account the granted allowance exactly')
  }
  const consumedCost = priorGrantConsumptions(history, grant.data.grantId)
    .reduce((total, consumption) => total + consumption.data.estimatedCostMicros, 0)
  const expectedConsumedCredit = Math.min(grant.data.reservedCreditMicros, consumedCost)
  if (data.fundedBudgetMicros !== offer.data.rewardQuote.fundedBudgetMicros
    || data.consumedCostMicrosBeforeRevocation !== expectedConsumedCredit
    || data.revokedCreditMicros !== grant.data.reservedCreditMicros - expectedConsumedCredit) {
    fail('sponsorship-demo/token-grant-revoked must account configured cost credit exactly')
  }
  nonEmpty(data.revokedAt, 'sponsorship-demo/token-grant-revoked revokedAt', fail)
  if (priorTokenSettlement(history, runId) !== undefined) {
    fail('sponsorship-demo/token-grant-revoked cannot revoke a redeemed grant')
  }
  if (priorTokenRevocation(history, runId) !== undefined) {
    fail('sponsorship-demo/token-grant-revoked may revoke one grant only once')
  }
}

function validateAdFailureRecorded(
  history: readonly SessionEvent[],
  event: SessionEvent<'sponsorship-demo/ad-failure-recorded'>,
  fail: InvariantFailure,
): void {
  const data = record(event.data, 'sponsorship-demo/ad-failure-recorded', fail)
  const runId = nonEmpty(data.runId, 'sponsorship-demo/ad-failure-recorded runId', fail)
  const grantId = nonEmpty(data.grantId, 'sponsorship-demo/ad-failure-recorded grantId', fail)
  const offer = priorOffer(history, runId)
  const grant = priorTokenGrant(history, runId)
  if (offer === undefined || grant === undefined) {
    fail('sponsorship-demo/ad-failure-recorded requires its offer and provisional grant')
  }
  const reasons = [
    'load-failed', 'render-failed', 'playback-incomplete', 'verification-rejected', 'session-ended',
  ]
  if (!reasons.includes(String(data.reason))) {
    fail('sponsorship-demo/ad-failure-recorded has an unknown browser failure reason')
  }
  const turn = safeInteger(data.turn, 'sponsorship-demo/ad-failure-recorded turn', 1, fail)
  const step = safeInteger(data.step, 'sponsorship-demo/ad-failure-recorded step', 1, fail)
  if (offer.data.turn !== turn || offer.data.step !== step
    || data.grantId !== grant.data.grantId || grantId !== grant.data.grantId
    || data.quoteId !== grant.data.quoteId) {
    fail('sponsorship-demo/ad-failure-recorded must match its provisional grant')
  }
  nonEmpty(data.recordedAt, 'sponsorship-demo/ad-failure-recorded recordedAt', fail)
  if (priorAdFailure(history, runId) !== undefined) {
    fail('sponsorship-demo/ad-failure-recorded may record one failure only once')
  }
  if (priorTokenSettlement(history, runId) !== undefined
    || priorTokenRevocation(history, runId) !== undefined) {
    fail('sponsorship-demo/ad-failure-recorded must precede settlement or revocation')
  }
}

function validateDecision(
  history: readonly SessionEvent[],
  event: SessionEvent<'sponsorship-demo/decision'>,
  fail: InvariantFailure,
): void {
  const data = record(event.data, 'sponsorship-demo/decision', fail)
  const runId = nonEmpty(data.runId, 'sponsorship-demo/decision runId', fail)
  const offer = priorOffer(history, runId)
  if (offer === undefined) fail('sponsorship-demo/decision requires a prior matching offer')
  const turn = safeInteger(data.turn, 'sponsorship-demo/decision turn', 1, fail)
  if (offer.data.turn !== turn) fail('sponsorship-demo/decision turn must match its offer')
  if (!['accepted', 'declined', 'expired', 'cancelled'].includes(String(data.decision))) {
    fail(`sponsorship-demo/decision has invalid decision ${JSON.stringify(data.decision)}`)
  }
  if (history.some(item => item.type === 'sponsorship-demo/decision' && item.data.runId === runId)) {
    fail('sponsorship-demo/decision may settle one offer only once')
  }
}

function validateTokenGrantConsumed(
  history: readonly SessionEvent[],
  event: SessionEvent<'sponsorship-demo/token-grant-consumed'>,
  fail: InvariantFailure,
): void {
  const data = record(event.data, 'sponsorship-demo/token-grant-consumed', fail)
  const runId = nonEmpty(data.runId, 'sponsorship-demo/token-grant-consumed runId', fail)
  const grantId = nonEmpty(data.grantId, 'sponsorship-demo/token-grant-consumed grantId', fail)
  const grant = history.findLast(item => item.type === 'sponsorship-demo/token-grant-issued'
    && item.data.runId === runId && item.data.grantId === grantId)
  const offer = priorOffer(history, runId)
  if (grant?.type !== 'sponsorship-demo/token-grant-issued' || offer === undefined) {
    fail('sponsorship-demo/token-grant-consumed requires its prior offer and grant')
  }
  if (data.quoteId !== grant.data.quoteId || data.quoteId !== offer.data.rewardQuote.quoteId) {
    fail('sponsorship-demo/token-grant-consumed quoteId must match its grant and offer')
  }
  const turn = safeInteger(data.turn, 'sponsorship-demo/token-grant-consumed turn', 1, fail)
  const step = safeInteger(data.step, 'sponsorship-demo/token-grant-consumed step', 1, fail)
  nonEmpty(data.provider, 'sponsorship-demo/token-grant-consumed provider', fail)
  nonEmpty(data.model, 'sponsorship-demo/token-grant-consumed model', fail)
  if (data.provider !== offer.data.provider || data.model !== offer.data.model) {
    fail('sponsorship-demo/token-grant-consumed route must match its offer')
  }
  if (data.status !== 'completed' && data.status !== 'failed' && data.status !== 'aborted') {
    fail('sponsorship-demo/token-grant-consumed has an unknown status')
  }
  for (const field of [
    'inputTokens', 'outputTokens', 'projectedInputTokens', 'projectedInputCostMicros',
    'estimatedCostMicros', 'remainingCreditMicros', 'remainingTokens', 'remainingSteps',
  ] as const) {
    safeInteger(data[field], `sponsorship-demo/token-grant-consumed ${field}`, 0, fail)
  }
  nonEmpty(data.consumedAt, 'sponsorship-demo/token-grant-consumed consumedAt', fail)
  const previous = priorGrantConsumptions(history, grantId)
  if (previous.some(item => item.data.turn === turn && item.data.step === step)) {
    fail('sponsorship-demo/token-grant-consumed may account one request boundary only once')
  }
  const revocation = priorTokenRevocation(history, runId)
  const requestCostMicros = Math.ceil(
    (data.inputTokens as number) * offer.data.rewardQuote.inputPriceMicrosPerMillionTokens
      / Number(MICROS_PER_CNY),
  ) + Math.ceil(
    (data.outputTokens as number) * offer.data.rewardQuote.outputPriceMicrosPerMillionTokens
      / Number(MICROS_PER_CNY),
  )
  const projectedInputCostMicros = Math.ceil(
    (data.projectedInputTokens as number) * offer.data.rewardQuote.inputPriceMicrosPerMillionTokens
      / Number(MICROS_PER_CNY),
  )
  const priorCreditMicros = revocation === undefined
    ? (previous.at(-1)?.data.remainingCreditMicros ?? grant.data.reservedCreditMicros)
    : 0
  if (data.projectedInputCostMicros !== projectedInputCostMicros
    || data.estimatedCostMicros !== requestCostMicros
    || data.remainingCreditMicros !== Math.max(0, priorCreditMicros - requestCostMicros)) {
    fail('sponsorship-demo/token-grant-consumed must decrement configured cost credit exactly')
  }
  const priorRemaining = revocation?.data.revokedTokens === undefined
    ? (previous.at(-1)?.data.remainingTokens ?? grant.data.grantedTokens)
    : 0
  const maximumRemaining = Math.max(0, priorRemaining - (data.outputTokens as number))
  if ((data.remainingTokens as number) > maximumRemaining) {
    fail('sponsorship-demo/token-grant-consumed cannot increase its output allowance')
  }
  const expectedSteps = revocation === undefined
    ? Math.max(0, offer.data.maxSteps - previous.length - 1)
    : 0
  if (data.remainingSteps !== expectedSteps) {
    fail('sponsorship-demo/token-grant-consumed remainingSteps must decrease exactly once')
  }
  const openTurn = history.findLast(item => item.type === 'turn/start' || item.type === 'turn/end')
  const openStep = history.findLast(item => item.type === 'step/start' || item.type === 'step/end')
  if (openTurn?.type !== 'turn/start' || openTurn.data.turn !== turn
    || openStep?.type !== 'step/start' || openStep.data.turn !== turn || openStep.data.step !== step) {
    fail('sponsorship-demo/token-grant-consumed must name the open Agent request boundary')
  }
}

function validatePoolSpent(
  history: readonly SessionEvent[],
  event: SessionEvent<'sponsorship-demo/operator-pool-spent'>,
  fail: InvariantFailure,
): void {
  const data = record(event.data, 'sponsorship-demo/operator-pool-spent', fail)
  const runId = nonEmpty(data.runId, 'sponsorship-demo/operator-pool-spent runId', fail)
  const grantId = nonEmpty(data.grantId, 'sponsorship-demo/operator-pool-spent grantId', fail)
  const grant = history.findLast(item => item.type === 'sponsorship-demo/token-grant-issued'
    && item.data.runId === runId && item.data.grantId === grantId)
  const reservation = priorPoolReservation(history, grantId)
  if (grant?.type !== 'sponsorship-demo/token-grant-issued' || reservation === undefined) {
    fail('sponsorship-demo/operator-pool-spent requires its grant and reservation')
  }
  if (priorPoolRelease(history, grantId) !== undefined) {
    fail('sponsorship-demo/operator-pool-spent cannot debit a released reservation')
  }
  const sourceSeq = safeInteger(
    data.sourceConsumptionEventSeq,
    'sponsorship-demo/operator-pool-spent sourceConsumptionEventSeq',
    0,
    fail,
  )
  const consumption = history.find(item => item.seq === sourceSeq)
  if (consumption?.type !== 'sponsorship-demo/token-grant-consumed'
    || consumption.data.runId !== runId || consumption.data.grantId !== grantId) {
    fail('sponsorship-demo/operator-pool-spent must name its exact consumption event')
  }
  for (const field of [
    'estimatedCallCostMicros', 'spentCreditMicros', 'uncoveredEstimatedCostMicros',
    'cumulativeSpentCreditMicros', 'remainingReservedCreditMicros',
  ] as const) {
    safeInteger(data[field], `sponsorship-demo/operator-pool-spent ${field}`, 0, fail)
  }
  const previous = priorPoolSpends(history, grantId)
  if (previous.some(item => item.data.sourceConsumptionEventSeq === sourceSeq)) {
    fail('sponsorship-demo/operator-pool-spent may debit one consumption only once')
  }
  const previousSpent = previous.reduce(
    (total, item) => total + item.data.spentCreditMicros,
    0,
  )
  const priorRemaining = reservation.data.reservedCreditMicros - previousSpent
  const expectedSpent = Math.min(consumption.data.estimatedCostMicros, priorRemaining)
  if (data.quoteId !== grant.data.quoteId
    || data.operatorPoolId !== grant.data.operatorPoolId
    || data.estimatedCallCostMicros !== consumption.data.estimatedCostMicros
    || data.spentCreditMicros !== expectedSpent
    || data.uncoveredEstimatedCostMicros !== consumption.data.estimatedCostMicros - expectedSpent
    || data.cumulativeSpentCreditMicros !== previousSpent + expectedSpent
    || data.remainingReservedCreditMicros !== priorRemaining - expectedSpent
    || consumption.data.remainingCreditMicros !== data.remainingReservedCreditMicros) {
    fail('sponsorship-demo/operator-pool-spent must debit its reservation exactly')
  }
  nonEmpty(data.spentAt, 'sponsorship-demo/operator-pool-spent spentAt', fail)
}

function validatePoolReleased(
  history: readonly SessionEvent[],
  event: SessionEvent<'sponsorship-demo/operator-pool-released'>,
  fail: InvariantFailure,
): void {
  const data = record(event.data, 'sponsorship-demo/operator-pool-released', fail)
  const runId = nonEmpty(data.runId, 'sponsorship-demo/operator-pool-released runId', fail)
  const grantId = nonEmpty(data.grantId, 'sponsorship-demo/operator-pool-released grantId', fail)
  const grant = history.findLast(item => item.type === 'sponsorship-demo/token-grant-issued'
    && item.data.runId === runId && item.data.grantId === grantId)
  const reservation = priorPoolReservation(history, grantId)
  const offer = priorOffer(history, runId)
  if (grant?.type !== 'sponsorship-demo/token-grant-issued'
    || reservation === undefined || offer === undefined) {
    fail('sponsorship-demo/operator-pool-released requires its offer, grant, and reservation')
  }
  for (const field of [
    'reservedCreditMicros', 'spentCreditMicros', 'releasedCreditMicros', 'availablePoolMicros',
  ] as const) {
    safeInteger(data[field], `sponsorship-demo/operator-pool-released ${field}`, 0, fail)
  }
  const reasons = [
    'load-failed', 'render-failed', 'playback-incomplete', 'verification-rejected',
    'session-ended', 'grant-expired', 'grant-exhausted', 'budget-capped', 'plugin-disposed',
  ]
  if (!reasons.includes(String(data.reason))) {
    fail('sponsorship-demo/operator-pool-released has an unknown reason')
  }
  const spent = priorPoolSpends(history, grantId)
    .reduce((total, item) => total + item.data.spentCreditMicros, 0)
  if (data.quoteId !== grant.data.quoteId
    || data.operatorPoolId !== grant.data.operatorPoolId
    || data.reservedCreditMicros !== reservation.data.reservedCreditMicros
    || data.spentCreditMicros !== spent
    || data.releasedCreditMicros !== reservation.data.reservedCreditMicros - spent
    || (data.availablePoolMicros as number) > offer.data.operatorPoolBudgetMicros) {
    fail('sponsorship-demo/operator-pool-released must return only its unused reservation')
  }
  nonEmpty(data.releasedAt, 'sponsorship-demo/operator-pool-released releasedAt', fail)
  if (priorPoolRelease(history, grantId) !== undefined) {
    fail('sponsorship-demo/operator-pool-released may release one reservation only once')
  }
}

function validateReceipt(
  history: readonly SessionEvent[],
  event: SessionEvent<'sponsorship-demo/receipt'>,
  fail: InvariantFailure,
): void {
  const data = record(event.data, 'sponsorship-demo/receipt', fail)
  const runId = nonEmpty(data.runId, 'sponsorship-demo/receipt runId', fail)
  const offer = priorOffer(history, runId)
  if (offer === undefined) fail('sponsorship-demo/receipt requires a prior matching offer')
  const decision = history.findLast(item =>
    item.type === 'sponsorship-demo/decision' && item.data.runId === runId)
  const turn = safeInteger(data.turn, 'sponsorship-demo/receipt turn', 1, fail)
  if (offer.data.turn !== turn
    || (decision?.type === 'sponsorship-demo/decision' && decision.data.turn !== turn)) {
    fail('sponsorship-demo/receipt turn must match its offer and optional decision')
  }
  const turnEnd = history.findLast(item =>
    item.type === 'turn/end' && item.data.turn === turn)
  if (turnEnd?.type !== 'turn/end') {
    fail('sponsorship-demo/receipt requires its matching turn/end first')
  }
  if (!['completed', 'declined', 'capped', 'failed', 'cancelled'].includes(String(data.status))) {
    fail(`sponsorship-demo/receipt has invalid status ${JSON.stringify(data.status)}`)
  }
  if (typeof data.sponsorshipUsed !== 'boolean') {
    fail('sponsorship-demo/receipt sponsorshipUsed must be a boolean')
  }
  nonEmpty(data.provider, 'sponsorship-demo/receipt provider', fail)
  nonEmpty(data.model, 'sponsorship-demo/receipt model', fail)
  for (const field of [
    'stepsUsed', 'inputTokens', 'outputTokens', 'estimatedCostMicros',
    'watchedMs', 'grantedTokens', 'redeemedTokens', 'revokedTokens',
  ] as const) {
    safeInteger(data[field], `sponsorship-demo/receipt ${field}`, 0, fail)
  }
  for (const field of [
    'maxSteps', 'maxOutputTokensPerRequest', 'maxTotalTokens', 'maxEstimatedCostMicros',
    'rewardTokenCap',
  ] as const) {
    safeInteger(data[field], `sponsorship-demo/receipt ${field}`, 1, fail)
  }
  if (data.currency !== 'CNY') fail('sponsorship-demo/receipt currency must be CNY')
  if (data.fundingMode !== offer.data.fundingMode) {
    fail('sponsorship-demo/receipt fundingMode must match its offer')
  }
  const receiptQuote = validateRewardQuote(
    data.rewardQuote,
    'sponsorship-demo/receipt rewardQuote',
    fail,
  )
  const offerQuote = record(
    offer.data.rewardQuote,
    'sponsorship-demo/offer rewardQuote',
    fail,
  )
  if (!sameRewardQuote(receiptQuote, offerQuote)) {
    fail('sponsorship-demo/receipt rewardQuote must match its offer')
  }
  for (const field of [
    'maxSteps', 'maxOutputTokensPerRequest', 'maxTotalTokens', 'maxEstimatedCostMicros',
  ] as const) {
    if (data[field] !== offer.data[field]) {
      fail(`sponsorship-demo/receipt ${field} must match its offer`)
    }
  }
  if (data.rewardTokenCap !== offer.data.rewardTokens) {
    fail('sponsorship-demo/receipt allowance terms must match its offer')
  }
  if (typeof data.rewardIssued !== 'boolean') {
    fail('sponsorship-demo/receipt rewardIssued must be a boolean')
  }
  const reward = priorReward(history, runId)
  const tokenGrant = priorTokenGrant(history, runId)
  const tokenSettlement = priorTokenSettlement(history, runId)
  const tokenRevocation = priorTokenRevocation(history, runId)
  if (data.rewardIssued !== (reward !== undefined)) {
    fail('sponsorship-demo/receipt rewardIssued must match prior reward evidence')
  }
  if (reward === undefined) {
    if (data.watchedMs !== 0) {
      fail('sponsorship-demo/receipt must not claim unverified watch time')
    }
  } else if (data.watchedMs !== reward.data.watchedMs) {
    fail('sponsorship-demo/receipt watchedMs must match prior reward evidence')
  }
  if (data.grantedTokens !== (tokenGrant?.data.grantedTokens ?? 0)) {
    fail('sponsorship-demo/receipt grantedTokens must match prior grant evidence')
  }
  const expectedGrantStatus = tokenSettlement !== undefined
    ? 'redeemed'
    : tokenRevocation !== undefined
      ? 'revoked'
      : tokenGrant !== undefined
        ? 'provisional'
        : 'not-issued'
  if (data.grantStatus !== expectedGrantStatus) {
    fail('sponsorship-demo/receipt grantStatus must match prior grant lifecycle events')
  }
  if (data.redeemedTokens !== (tokenSettlement?.data.redeemedTokens ?? 0)
    || data.revokedTokens !== (tokenRevocation?.data.revokedTokens ?? 0)) {
    fail('sponsorship-demo/receipt settlement amounts must match prior grant lifecycle events')
  }
  if (tokenSettlement?.data.verificationKind === 'tencent-gdt-sandbox-server-callback') {
    const loaded = priorAdLoaded(history, runId)
    const rendered = priorAdRendered(history, runId)
    const impression = priorAdImpression(history, runId)
    const revenue = priorAdRevenue(history, runId)
    const verification = priorAdVerification(history, runId)
    if (loaded === undefined || rendered === undefined || impression === undefined
      || revenue === undefined || verification === undefined || tokenGrant === undefined) {
      fail('sponsorship-demo/receipt sandbox ledger requires the complete advertising lifecycle')
    }
    if (data.adLedger === undefined) {
      fail('sponsorship-demo/receipt must include a sandbox grant settled before the receipt')
    }
    const ledger = record(data.adLedger, 'sponsorship-demo/receipt adLedger', fail)
    if (ledger.adProvider !== TENCENT_GDT_SANDBOX_PROVIDER
      || ledger.adFormat !== TENCENT_GDT_SANDBOX_FORMAT
      || ledger.requestId !== loaded.data.requestId
      || ledger.creativeId !== loaded.data.creativeId
      || ledger.renderId !== rendered.data.renderId
      || ledger.impressionId !== impression.data.impressionId
      || ledger.revenueEventId !== revenue.data.revenueEventId
      || ledger.quoteId !== offer.data.rewardQuote.quoteId
      || ledger.revenueKind !== 'sandbox-market-benchmark-no-external-settlement'
      || ledger.pricingBasis !== offer.data.rewardQuote.pricingBasis
      || ledger.simulatedAdValueMicros !== offer.data.rewardQuote.simulatedAdValueMicros
      || ledger.externalRevenueMicros !== 0
      || ledger.grantId !== tokenGrant.data.grantId
      || ledger.grantedTokens !== tokenGrant.data.grantedTokens
      || ledger.callbackId !== verification.data.callbackId
      || ledger.signatureKind !== verification.data.signatureKind
      || ledger.settlementStatus !== tokenSettlement.data.settlementStatus) {
      fail('sponsorship-demo/receipt adLedger must match its simulated-value sandbox events')
    }
  } else if (data.adLedger !== undefined) {
    fail('an unsettled, revoked, or local-video grant must not claim a Tencent sandbox ledger')
  }
  if (data.sponsorshipUsed) {
    if (data.provider !== offer.data.provider || data.model !== offer.data.model) {
      fail('a used sponsorship receipt must name its offered dedicated route')
    }
    if (data.costKind !== 'configured-estimate') {
      fail('a used sponsorship receipt must use configured-estimate cost semantics')
    }
    if ((data.inputTokens as number) + (data.outputTokens as number) > (data.maxTotalTokens as number)) {
      fail('sponsorship-demo/receipt usage must not exceed its total token cap')
    }
    if ((data.estimatedCostMicros as number) > (data.maxEstimatedCostMicros as number)) {
      fail('sponsorship-demo/receipt estimate must not exceed its configured ceiling')
    }
    if ((data.stepsUsed as number) > (data.maxSteps as number)) {
      fail('sponsorship-demo/receipt stepsUsed must not exceed its configured cap')
    }
  } else if (data.estimatedCostMicros !== 0 || data.costKind !== 'unavailable') {
    fail('an unused sponsorship receipt must not claim sponsored cost')
  }
  if (data.actualCostMicros !== null) {
    fail('this pilot cannot claim an exact provider charge')
  }
  if (history.some(item => item.type === 'sponsorship-demo/receipt' && item.data.runId === runId)) {
    fail('sponsorship-demo/receipt may close one offer only once')
  }
}

function validateEvent(
  history: readonly SessionEvent[],
  event: SessionEvent,
  fail: InvariantFailure,
): void {
  if (event.type === 'sponsorship-demo/offer') validateOffer(history, event, fail)
  else if (event.type === 'sponsorship-demo/decision') validateDecision(history, event, fail)
  else if (event.type === 'sponsorship-demo/playback-started') validatePlayback(history, event, fail)
  else if (event.type === 'sponsorship-demo/reward-issued') validateReward(history, event, fail)
  else if (event.type === 'sponsorship-demo/ad-loaded') validateAdLoaded(history, event, fail)
  else if (event.type === 'sponsorship-demo/ad-rendered') validateAdRendered(history, event, fail)
  else if (event.type === 'sponsorship-demo/ad-impression') validateAdImpression(history, event, fail)
  else if (event.type === 'sponsorship-demo/ad-revenue') validateAdRevenue(history, event, fail)
  else if (event.type === 'sponsorship-demo/ad-failure-recorded') {
    validateAdFailureRecorded(history, event, fail)
  }
  else if (event.type === 'sponsorship-demo/operator-pool-reserved') {
    validatePoolReserved(history, event, fail)
  }
  else if (event.type === 'sponsorship-demo/token-grant-issued') validateTokenGrant(history, event, fail)
  else if (event.type === 'sponsorship-demo/ad-verification-received') {
    validateAdVerification(history, event, fail)
  }
  else if (event.type === 'sponsorship-demo/token-grant-settled') {
    validateTokenGrantSettled(history, event, fail)
  }
  else if (event.type === 'sponsorship-demo/token-grant-revoked') {
    validateTokenGrantRevoked(history, event, fail)
  }
  else if (event.type === 'sponsorship-demo/token-grant-consumed') {
    validateTokenGrantConsumed(history, event, fail)
  }
  else if (event.type === 'sponsorship-demo/operator-pool-spent') {
    validatePoolSpent(history, event, fail)
  }
  else if (event.type === 'sponsorship-demo/operator-pool-released') {
    validatePoolReleased(history, event, fail)
  }
  else if (event.type === 'sponsorship-demo/receipt') validateReceipt(history, event, fail)
}

function validateSession(session: Session, fail: InvariantFailure): void {
  for (const [index, event] of session.events.entries()) {
    validateEvent(session.events.slice(0, index), event, fail)
  }
}

const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  for (const session of ctx.sessions.list()) validateSession(session, fail)
  ctx.on('session/created', (session) => { validateSession(session, fail) }, { global: true })
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args as [Session, SessionEvent]
    validateEvent(session.events, event, fail)
  }, { global: true })
}, { inject: ['sessions'] })

/** Register the durable event validation companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
