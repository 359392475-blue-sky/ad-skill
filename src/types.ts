/** Durable vocabulary shared by the simulated sponsor Host and browser card. */

/** ISO-style currency used by this closed demonstration. */
export type SponsorDemoCurrency = 'CNY'

/** User or lifecycle outcome for one sponsorship offer. */
export type SponsorDemoDecision = 'accepted' | 'declined' | 'expired' | 'cancelled'

/** Terminal state rendered by the transparent sponsorship receipt. */
export type SponsorDemoReceiptStatus = 'completed' | 'declined' | 'capped' | 'failed' | 'cancelled'

/** How the receipt's monetary fields must be interpreted. */
export type SponsorDemoCostKind = 'configured-estimate' | 'unavailable'

/** Product surface selected for one offer. */
export type SponsorDemoPresentation = 'conversation-card' | 'reasoning-card'

/** Honest source-of-funds disclosure; this never changes model-visible context. */
export type SponsorDemoFundingMode =
  | 'dedicated-sponsor-credential'
  | 'current-credential-simulation'

/** Local-only proof vocabulary; production must replace this with signed server verification. */
export type SponsorDemoVerificationKind = 'local-ended'

/** Host-selected advertising implementation for one closed-pilot offer. */
export type SponsorDemoAdProvider = 'local-video' | 'tencent-gdt-sandbox'

/** Host-selected presentation format for the advertising implementation. */
export type SponsorDemoAdFormat = 'rewarded-video' | 'native-template'

/** Revenue semantics for the Tencent-compatible local sandbox. */
export type SponsorDemoAdRevenueKind = 'sandbox-market-benchmark-no-external-settlement'

/** Explicitly non-platform pricing source used only to exercise sandbox accounting. */
export type SponsorDemoPricingBasis = 'market-benchmark-simulated-ecpm'

/** Immutable Host quote that converts one simulated advertising value into a bounded allowance. */
export interface SponsorDemoRewardQuoteData {
  /** Host-issued one-shot quote identity; the browser cannot choose or replace it. */
  quoteId: string
  /** Host-selected sandbox price scenario. */
  scenarioId: string
  /** Explicit indication that these values are market-benchmark simulations, not Tencent prices. */
  pricingBasis: SponsorDemoPricingBasis
  /** Simulated market eCPM in one-millionth CNY per one thousand impressions. */
  marketBenchmarkEcpmMicros: number
  /** Simulated value of this one impression in one-millionth CNY. */
  simulatedAdValueMicros: number
  /** Fraction of simulated value advanced from the operator budget, in basis points. */
  advanceRatioBps: number
  /** Budget provisionally assigned to this grant after the risk reserve. */
  fundedBudgetMicros: number
  /** Input Tokens reserved by the demonstration quote calculation. */
  inputReserveTokens: number
  /** Safety multiplier applied to Host token-meter input estimates, in basis points. */
  inputEstimateSafetyBps: number
  /** CNY-micro estimate of the configured input reserve. */
  inputReserveMicros: number
  /** Deployment-owned model price snapshot used for this immutable quote. */
  modelPricingSnapshotId: string
  /** Input estimate in one-millionth CNY per one million Tokens. */
  inputPriceMicrosPerMillionTokens: number
  /** Output estimate in one-millionth CNY per one million Tokens. */
  outputPriceMicrosPerMillionTokens: number
  /** Output-token rounding quantum applied downward. */
  rewardTokenQuantum: number
  /** Deployment minimum accepted by the quote policy. */
  minRewardTokens: number
  /** Deployment maximum accepted by the quote policy. */
  maxRewardTokens: number
  /** Bounded output-token allowance calculated by the Host. */
  rewardTokens: number
  /** Host timestamp at which the quote was fixed. */
  quotedAt: string
  /** Latest timestamp at which this quote may be accepted. */
  expiresAt: string
}

/** Verification state attached when a provisional test Token grant is issued. */
export type SponsorDemoTokenGrantVerificationKind =
  | 'pending-ad-verification'

/** Final proof accepted by the simulated Token service. */
export type SponsorDemoTokenGrantSettlementVerificationKind =
  | 'local-video-ended'
  | 'tencent-gdt-sandbox-server-callback'

/** Lifecycle of a grant at the instant an immutable receipt is written. */
export type SponsorDemoGrantStatus = 'not-issued' | 'provisional' | 'redeemed' | 'revoked'

/** Fixed browser-reported failures that revoke only an unspent provisional allowance. */
export type SponsorDemoAdFailureReason =
  | 'load-failed'
  | 'render-failed'
  | 'playback-incomplete'
  | 'verification-rejected'
  | 'session-ended'

/** Host-owned terminal reasons that may close a grant outside a browser ad failure. */
export type SponsorDemoTokenGrantRevocationReason =
  | SponsorDemoAdFailureReason
  | 'grant-expired'
  | 'grant-exhausted'
  | 'budget-capped'
  | 'plugin-disposed'

/** Why unused operator-pool credit returned to the finite local sandbox pool. */
export type SponsorDemoOperatorPoolReleaseReason =
  SponsorDemoTokenGrantRevocationReason

/** Host-confirmed state after one sponsorship control transition. */
export type SponsorDemoControlState =
  | 'accepted'
  | 'declined'
  | 'playback-started'
  | 'playback-already-started'
  | 'reward-issued'
  | 'reward-already-issued'
  | 'ad-loaded'
  | 'ad-already-loaded'
  | 'ad-rendered'
  | 'ad-already-rendered'
  | 'ad-impression-recorded'
  | 'ad-impression-already-recorded'
  | 'ad-failed'
  | 'ad-failure-already-recorded'

/** Expected rejection codes for an addressed sponsorship control transition. */
export type SponsorDemoControlFailureCode =
  | 'run-not-found'
  | 'offer-not-pending'
  | 'quote-expired'
  | 'grant-unaffordable'
  | 'grant-expired'
  | 'operator-pool-exhausted'
  | 'offer-already-decided'
  | 'playback-not-accepted'
  | 'playback-not-started'
  | 'ad-provider-mismatch'
  | 'ad-not-loaded'
  | 'ad-request-mismatch'
  | 'ad-not-rendered'
  | 'ad-duration-incomplete'
  | 'grant-not-provisional'
  | 'ad-already-settled'

/** Successful Host admission of one sponsorship control transition. */
export interface SponsorDemoControlSuccess {
  /** Discriminant separating an admitted transition from a business rejection. */
  readonly ok: true
  /** Host-confirmed current state, including idempotent replay outcomes. */
  readonly state: SponsorDemoControlState
  /** Durable sponsorship event produced by, or proving, this transition. */
  readonly sourceEventSeq: number
  /** Host-issued opaque identity required by the next advertising transition. */
  readonly opaqueId?: string
}

/** Expected Host rejection of one sponsorship control transition. */
export interface SponsorDemoControlFailure {
  /** Discriminant separating a business rejection from an admitted transition. */
  readonly ok: false
  /** Stable rejection code owned by the Host state machine. */
  readonly code: SponsorDemoControlFailureCode
  /** User-presentable English diagnostic for the closed pilot. */
  readonly message: string
}

/** Settled business result returned by each typed sponsorship Remote method. */
export type SponsorDemoControlResult = SponsorDemoControlSuccess | SponsorDemoControlFailure

/** Durable non-surface offer shown before any sponsored model call. */
export interface SponsorDemoOfferData {
  runId: string
  turn: number
  step: number
  sponsorName: string
  sponsorDisclosure: string
  provider: string
  model: string
  maxSteps: number
  maxOutputTokensPerRequest: number
  maxTotalTokens: number
  maxEstimatedCostMicros: number
  currency: SponsorDemoCurrency
  presentation: SponsorDemoPresentation
  fundingMode: SponsorDemoFundingMode
  /** Process-local sandbox fund identity disclosed by this closed pilot. */
  operatorPoolId: string
  /** Finite configured sandbox fund ceiling in one-millionth CNY. */
  operatorPoolBudgetMicros: number
  /** Operator-funded input-cost credit added before the hard cap; absent legacy offers mean zero. */
  operatorInputSubsidyMicros?: number
  /** Session-scoped grant lifetime after explicit acceptance. */
  grantTtlMs: number
  /** Host-selected advertising implementation; the browser cannot override it. */
  adProvider: SponsorDemoAdProvider
  /** Host-selected advertising presentation; the browser cannot override it. */
  adFormat: SponsorDemoAdFormat
  /** Session-scoped allowance provisionally issued after explicit acceptance. */
  rewardTokens: number
  /** Immutable Host-side pricing decision that owns rewardTokens. */
  rewardQuote: SponsorDemoRewardQuoteData
  /** Fixed local test-video duration shown to the user. */
  adDurationMs: number
  /** Non-secret identity of the packaged local test asset. */
  assetId: string
}

/** Durable non-surface settlement of an explicit user or lifecycle choice. */
export interface SponsorDemoDecisionData {
  runId: string
  turn: number
  decision: SponsorDemoDecision
}

/** Durable start of one local test-video playback. */
export interface SponsorDemoPlaybackStartedData {
  runId: string
  turn: number
  step: number
  playbackId: string
  quoteId: string
  assetId: string
  durationMs: number
  rewardTokenCap: number
  startedAt: string
}

/** Durable, one-shot local test reward issued after the video element ends. */
export interface SponsorDemoRewardIssuedData {
  runId: string
  turn: number
  step: number
  playbackId: string
  quoteId: string
  watchedMs: number
  grantedTokens: number
  verificationKind: SponsorDemoVerificationKind
  completedAt: string
}

/** Durable Host-created load result for the Tencent-compatible local sandbox. */
export interface SponsorDemoAdLoadedData {
  runId: string
  turn: number
  step: number
  requestId: string
  quoteId: string
  scenarioId: string
  pricingBasis: SponsorDemoPricingBasis
  simulatedAdValueMicros: number
  adProvider: Extract<SponsorDemoAdProvider, 'tencent-gdt-sandbox'>
  adFormat: Extract<SponsorDemoAdFormat, 'native-template'>
  placementId: string
  creativeId: string
  loadedAt: string
}

/** Durable acknowledgement that the fixed sandbox creative reached its UI container. */
export interface SponsorDemoAdRenderedData {
  runId: string
  turn: number
  step: number
  requestId: string
  quoteId: string
  renderId: string
  renderedAt: string
}

/** Durable Host admission of one visible sandbox impression. */
export interface SponsorDemoAdImpressionData {
  runId: string
  turn: number
  step: number
  requestId: string
  quoteId: string
  renderId: string
  impressionId: string
  impressedAt: string
}

/** Durable simulated-value ledger event; external revenue remains zero. */
export interface SponsorDemoAdRevenueData {
  runId: string
  turn: number
  step: number
  requestId: string
  impressionId: string
  revenueEventId: string
  quoteId: string
  currency: SponsorDemoCurrency
  revenueKind: SponsorDemoAdRevenueKind
  pricingBasis: SponsorDemoPricingBasis
  simulatedAdValueMicros: number
  /** Tencent test advertisements produce no publisher settlement. */
  externalRevenueMicros: 0
  recordedAt: string
}

/** Durable Host acknowledgement that ad verification failed and revocation was requested. */
export interface SponsorDemoAdFailureRecordedData {
  runId: string
  turn: number
  step: number
  grantId: string
  quoteId: string
  reason: SponsorDemoAdFailureReason
  recordedAt: string
}

/** Durable run-local Token grant provisionally issued in the same Host operation as acceptance. */
export interface SponsorDemoTokenGrantIssuedData {
  runId: string
  turn: number
  step: number
  grantId: string
  /** Immutable Host quote accepted by the user for this exact grant. */
  quoteId: string
  /** Exact accepted decision that authorized the provisional allowance. */
  sourceDecisionEventSeq: number
  grantKind: 'provisional'
  grantedTokens: number
  /** Finite process-local pool that reserved this grant's configured credit. */
  operatorPoolId: string
  /** Credit locked from the operator pool for this grant. */
  reservedCreditMicros: number
  verificationKind: SponsorDemoTokenGrantVerificationKind
  issuedAt: string
  /** Latest Host time at which this session-scoped grant may route a request. */
  expiresAt: string
}

/** Durable reservation from the finite process-local sandbox Sponsor Fund pool. */
export interface SponsorDemoOperatorPoolReservedData {
  runId: string
  turn: number
  step: number
  grantId: string
  quoteId: string
  operatorPoolId: string
  operatorPoolBudgetMicros: number
  reservedCreditMicros: number
  availablePoolMicros: number
  reservedAt: string
}

/** Durable configured-cost debit against one exact operator-pool reservation. */
export interface SponsorDemoOperatorPoolSpentData {
  runId: string
  grantId: string
  quoteId: string
  operatorPoolId: string
  sourceConsumptionEventSeq: number
  estimatedCallCostMicros: number
  spentCreditMicros: number
  uncoveredEstimatedCostMicros: number
  cumulativeSpentCreditMicros: number
  remainingReservedCreditMicros: number
  spentAt: string
}

/** Durable return of one grant's unused configured credit to the local pool. */
export interface SponsorDemoOperatorPoolReleasedData {
  runId: string
  grantId: string
  quoteId: string
  operatorPoolId: string
  reason: SponsorDemoOperatorPoolReleaseReason
  reservedCreditMicros: number
  spentCreditMicros: number
  releasedCreditMicros: number
  availablePoolMicros: number
  releasedAt: string
}

/** Durable receipt of a valid simulated Tencent server-to-server completion callback. */
export interface SponsorDemoAdVerificationReceivedData {
  runId: string
  turn: number
  step: number
  callbackId: string
  quoteId: string
  requestId: string
  renderId: string
  impressionId: string
  adProvider: Extract<SponsorDemoAdProvider, 'tencent-gdt-sandbox'>
  completionStatus: 'completed'
  /** Simulation-only signature algorithm; the ephemeral secret is never persisted. */
  signatureKind: 'sandbox-hmac-sha256'
  signatureVerified: true
  receivedAt: string
}

/** Durable one-shot redemption after the Token service accepts final ad evidence. */
export interface SponsorDemoTokenGrantSettledData {
  runId: string
  turn: number
  step: number
  grantId: string
  quoteId: string
  settlementStatus: 'redeemed'
  verificationKind: SponsorDemoTokenGrantSettlementVerificationKind
  /** Tencent callback identity; used only by the Tencent-compatible sandbox. */
  sourceCallbackId?: string
  /** Local playback identity; used only by the packaged-video path. */
  sourcePlaybackId?: string
  redeemedTokens: number
  settledAt: string
}

/** Durable revocation of only the unused portion of a provisional grant. */
export interface SponsorDemoTokenGrantRevokedData {
  runId: string
  turn: number
  step: number
  grantId: string
  quoteId: string
  reason: SponsorDemoTokenGrantRevocationReason
  grantedTokens: number
  consumedTokensBeforeRevocation: number
  revokedTokens: number
  /** Advertising contribution retained from the accepted quote, in one-millionth CNY. */
  fundedBudgetMicros: number
  /** Configured cost consumed before revocation, in one-millionth CNY. */
  consumedCostMicrosBeforeRevocation: number
  /** Unused full grant credit revoked with the output allowance. */
  revokedCreditMicros: number
  revokedAt: string
}

/** Durable accounting for one real Agent request admitted by a provisional or redeemed grant. */
export interface SponsorDemoTokenGrantConsumedData {
  /** Offer run that produced this grant; it may belong to an earlier turn. */
  runId: string
  grantId: string
  quoteId: string
  /** Exact later Agent request boundary that consumed the allowance. */
  turn: number
  step: number
  provider: string
  model: string
  status: 'completed' | 'failed' | 'aborted'
  inputTokens: number
  outputTokens: number
  /** Host token-meter input estimate after applying the configured safety multiplier. */
  projectedInputTokens: number
  /** Projected input cost used to cap this request before it started. */
  projectedInputCostMicros: number
  /** Configured model-price estimate for this request. */
  estimatedCostMicros: number
  /** Remaining configured cost credit after this request. */
  remainingCreditMicros: number
  remainingTokens: number
  remainingSteps: number
  consumedAt: string
}

/** Replayable advertising ledger snapshot captured when the run receipt is written. */
export interface SponsorDemoAdLedgerReceiptData {
  adProvider: Extract<SponsorDemoAdProvider, 'tencent-gdt-sandbox'>
  adFormat: Extract<SponsorDemoAdFormat, 'native-template'>
  requestId: string
  creativeId: string
  renderId: string
  impressionId: string
  revenueEventId: string
  quoteId: string
  revenueKind: SponsorDemoAdRevenueKind
  pricingBasis: SponsorDemoPricingBasis
  simulatedAdValueMicros: number
  externalRevenueMicros: 0
  grantId: string
  grantedTokens: number
  callbackId: string
  signatureKind: 'sandbox-hmac-sha256'
  settlementStatus: 'redeemed'
}

/** Durable non-surface, replayable receipt for one offered run. */
export interface SponsorDemoReceiptData {
  runId: string
  turn: number
  status: SponsorDemoReceiptStatus
  sponsorshipUsed: boolean
  provider: string
  model: string
  stepsUsed: number
  inputTokens: number
  outputTokens: number
  maxSteps: number
  maxOutputTokensPerRequest: number
  maxTotalTokens: number
  maxEstimatedCostMicros: number
  estimatedCostMicros: number
  /** Always null in this pilot because exact provider billing belongs to the sponsor gateway. */
  actualCostMicros: number | null
  currency: SponsorDemoCurrency
  costKind: SponsorDemoCostKind
  fundingMode: SponsorDemoFundingMode
  /** Immutable Host quote associated with this offer. */
  rewardQuote: SponsorDemoRewardQuoteData
  rewardTokenCap: number
  rewardIssued: boolean
  watchedMs: number
  grantedTokens: number
  /** Grant truth at receipt time; later settlement/revocation remains visible as durable events. */
  grantStatus: SponsorDemoGrantStatus
  redeemedTokens: number
  revokedTokens: number
  /** Present only when the Tencent sandbox settled before this immutable run receipt. */
  adLedger?: SponsorDemoAdLedgerReceiptData
}
