import type {
  ChatConversationViewNode, ConversationLocationData, ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-runtime/client'
import type {
  SponsorDemoDecision as HostSponsorDemoDecision,
  SponsorDemoAdImpressionData as HostSponsorDemoAdImpressionData,
  SponsorDemoAdLoadedData as HostSponsorDemoAdLoadedData,
  SponsorDemoAdRenderedData as HostSponsorDemoAdRenderedData,
  SponsorDemoAdRevenueData as HostSponsorDemoAdRevenueData,
  SponsorDemoAdVerificationReceivedData as HostSponsorDemoAdVerificationReceivedData,
  SponsorDemoAdLedgerReceiptData as HostSponsorDemoAdLedgerReceiptData,
  SponsorDemoOfferData,
  SponsorDemoPlaybackStartedData as HostSponsorDemoPlaybackStartedData,
  SponsorDemoReceiptData as HostSponsorDemoReceiptData,
  SponsorDemoReceiptStatus as HostSponsorDemoReceiptStatus,
  SponsorDemoRewardIssuedData as HostSponsorDemoRewardIssuedData,
  SponsorDemoRewardQuoteData as HostSponsorDemoRewardQuoteData,
  SponsorDemoTokenGrantConsumedData as HostSponsorDemoTokenGrantConsumedData,
  SponsorDemoTokenGrantIssuedData as HostSponsorDemoTokenGrantIssuedData,
  SponsorDemoTokenGrantRevokedData as HostSponsorDemoTokenGrantRevokedData,
  SponsorDemoTokenGrantSettledData as HostSponsorDemoTokenGrantSettledData,
} from '@deepseek-ai/dsh-sponsor-demo/types'

type LegacyOptional<T, Key extends keyof T> = Readonly<Omit<T, Key> & Partial<Pick<T, Key>>>

/** One-time sponsorship decision rendered by the card. */
export type SponsorDemoDecision = HostSponsorDemoDecision

/** Terminal status recorded by the sponsorship receipt. */
export type SponsorDemoReceiptStatus = HostSponsorDemoReceiptStatus

/** Renderer-ready immutable Host quote; older pilot logs may not carry one. */
export type SponsorDemoRewardQuoteData = Readonly<HostSponsorDemoRewardQuoteData>

/** Renderer-ready advertising ledger with optional post-pilot quote linkage for old replay. */
export type SponsorDemoAdLedgerReceiptData = LegacyOptional<
  HostSponsorDemoAdLedgerReceiptData,
  'quoteId' | 'pricingBasis' | 'simulatedAdValueMicros'
>

/** Renderer-ready transparent receipt fields. */
export type SponsorDemoReceiptData = Readonly<
  Omit<HostSponsorDemoReceiptData, 'runId' | 'turn' | 'rewardQuote' | 'adLedger'>
  & {
    readonly rewardQuote?: SponsorDemoRewardQuoteData
    readonly adLedger?: SponsorDemoAdLedgerReceiptData
  }
>

/** Renderer-ready local playback proof. */
export type SponsorDemoPlaybackData = LegacyOptional<
  Omit<HostSponsorDemoPlaybackStartedData, 'runId' | 'turn' | 'step'>, 'quoteId'
>

/** Renderer-ready one-shot reward proof. */
export type SponsorDemoRewardData = LegacyOptional<
  Omit<HostSponsorDemoRewardIssuedData, 'runId' | 'turn' | 'step'>, 'quoteId'
>

/** Renderer-ready Host-created sandbox load record. */
export type SponsorDemoAdLoadedData = LegacyOptional<
  Omit<HostSponsorDemoAdLoadedData, 'runId' | 'turn' | 'step'>,
  'quoteId' | 'scenarioId' | 'pricingBasis' | 'simulatedAdValueMicros'
>

/** Renderer-ready sandbox render acknowledgement. */
export type SponsorDemoAdRenderedData = LegacyOptional<
  Omit<HostSponsorDemoAdRenderedData, 'runId' | 'turn' | 'step'>, 'quoteId'
>

/** Renderer-ready one-shot sandbox impression. */
export type SponsorDemoAdImpressionData = LegacyOptional<
  Omit<HostSponsorDemoAdImpressionData, 'runId' | 'turn' | 'step'>, 'quoteId'
>

/** Renderer-ready market-benchmark simulated-value revenue record. */
export type SponsorDemoAdRevenueData = LegacyOptional<
  Omit<HostSponsorDemoAdRevenueData, 'runId' | 'turn' | 'step'>,
  'quoteId' | 'pricingBasis' | 'simulatedAdValueMicros'
>

/** Renderer-ready simulated Tencent server callback accepted by the Host. */
export type SponsorDemoAdVerificationData = LegacyOptional<
  Omit<HostSponsorDemoAdVerificationReceivedData, 'runId' | 'turn' | 'step'>, 'quoteId'
>

/** Renderer-ready Token grant linked to the Host quote. */
export type SponsorDemoTokenGrantData = LegacyOptional<
  Omit<HostSponsorDemoTokenGrantIssuedData, 'runId' | 'turn' | 'step'>,
  'quoteId' | 'operatorPoolId' | 'reservedCreditMicros' | 'expiresAt'
>

/** Renderer-ready final redemption of a provisional grant. */
export type SponsorDemoTokenGrantSettlementData = LegacyOptional<
  Omit<HostSponsorDemoTokenGrantSettledData, 'runId' | 'turn' | 'step'>, 'quoteId'
>

/** Renderer-ready revocation of the unused provisional remainder. */
export type SponsorDemoTokenGrantRevocationData = LegacyOptional<
  Omit<HostSponsorDemoTokenGrantRevokedData, 'runId' | 'turn' | 'step'>,
  'quoteId' | 'fundedBudgetMicros' | 'consumedCostMicrosBeforeRevocation' | 'revokedCreditMicros'
>

/** Renderer-ready accounting for one later model call that consumed the grant. */
export type SponsorDemoTokenGrantConsumptionData = LegacyOptional<
  Omit<HostSponsorDemoTokenGrantConsumedData, 'runId'>,
  | 'quoteId'
  | 'projectedInputTokens'
  | 'projectedInputCostMicros'
  | 'estimatedCostMicros'
  | 'remainingCreditMicros'
>

/** Final keyed Chat payload for one simulated sponsorship run. */
export interface SponsoredRunChatData extends Readonly<Pick<
  SponsorDemoOfferData,
  | 'runId'
  | 'turn'
  | 'step'
  | 'provider'
  | 'model'
  | 'maxSteps'
  | 'maxOutputTokensPerRequest'
  | 'maxTotalTokens'
  | 'maxEstimatedCostMicros'
  | 'currency'
  | 'presentation'
  | 'fundingMode'
  | 'adProvider'
  | 'adFormat'
  | 'rewardTokens'
  | 'adDurationMs'
  | 'assetId'
>> {
  /** Operator-funded input-cost credit; absent in replayed logs recorded before input subsidy. */
  readonly operatorInputSubsidyMicros?: number
  /** Host-owned quote; absent only in replayed logs from the earlier fixed-reward pilot. */
  readonly rewardQuote?: SponsorDemoRewardQuoteData
  readonly decision?: SponsorDemoDecision
  readonly playback?: SponsorDemoPlaybackData
  readonly reward?: SponsorDemoRewardData
  readonly adLoaded?: SponsorDemoAdLoadedData
  readonly adRendered?: SponsorDemoAdRenderedData
  readonly adImpression?: SponsorDemoAdImpressionData
  readonly adRevenue?: SponsorDemoAdRevenueData
  readonly tokenGrant?: SponsorDemoTokenGrantData
  readonly adVerification?: SponsorDemoAdVerificationData
  readonly tokenGrantSettlement?: SponsorDemoTokenGrantSettlementData
  readonly tokenGrantRevocation?: SponsorDemoTokenGrantRevocationData
  readonly tokenConsumptions?: readonly SponsorDemoTokenGrantConsumptionData[]
  readonly receipt?: SponsorDemoReceiptData
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    /** One simulated sponsorship offer, its decision, and its terminal receipt. */
    'sponsored-run': SponsoredRunChatData
  }
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  interface ConversationStepDataMap {
    /** Replayable simulated sponsorship state attached to its exact Agent Step. */
    'sponsored-run': SponsoredRunChatData
  }
}

/** Durable sponsorship event family folded into one independent Chat node. */
export const sponsoredRunDefinition: ConversationNodeDefinition<SponsoredRunChatData> = {
  kind: 'sponsored-run',
  target: 'chat',
  match: (event) => {
    if (event.type === 'sponsorship-demo/offer') {
      return { id: event.data.runId, role: 'start' }
    }
    if (
      event.type === 'sponsorship-demo/decision'
      || event.type === 'sponsorship-demo/playback-started'
      || event.type === 'sponsorship-demo/reward-issued'
      || event.type === 'sponsorship-demo/ad-loaded'
      || event.type === 'sponsorship-demo/ad-rendered'
      || event.type === 'sponsorship-demo/ad-impression'
      || event.type === 'sponsorship-demo/ad-revenue'
      || event.type === 'sponsorship-demo/token-grant-issued'
      || event.type === 'sponsorship-demo/ad-verification-received'
      || event.type === 'sponsorship-demo/token-grant-settled'
      || event.type === 'sponsorship-demo/token-grant-revoked'
      || event.type === 'sponsorship-demo/token-grant-consumed'
      || event.type === 'sponsorship-demo/receipt'
    ) {
      return { id: event.data.runId, role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'sponsorship-demo/offer') {
      throw new Error('sponsored-run start requires sponsorship-demo/offer')
    }
    const offer: Readonly<
      Omit<SponsorDemoOfferData, 'rewardQuote' | 'operatorInputSubsidyMicros'>
      & Partial<Pick<SponsorDemoOfferData, 'rewardQuote' | 'operatorInputSubsidyMicros'>>
    > = match.event.data
    return {
      runId: offer.runId,
      turn: offer.turn,
      step: offer.step,
      provider: offer.provider,
      model: offer.model,
      maxSteps: offer.maxSteps,
      maxOutputTokensPerRequest: offer.maxOutputTokensPerRequest,
      maxTotalTokens: offer.maxTotalTokens,
      maxEstimatedCostMicros: offer.maxEstimatedCostMicros,
      currency: offer.currency,
      presentation: offer.presentation,
      fundingMode: offer.fundingMode,
      ...(offer.operatorInputSubsidyMicros === undefined
        ? {} : { operatorInputSubsidyMicros: offer.operatorInputSubsidyMicros }),
      adProvider: offer.adProvider,
      adFormat: offer.adFormat,
      rewardTokens: offer.rewardTokens,
      ...(offer.rewardQuote === undefined ? {} : { rewardQuote: { ...offer.rewardQuote } }),
      adDurationMs: offer.adDurationMs,
      assetId: offer.assetId,
    }
  },
  update: (context, match) => {
    if (match.event.type === 'sponsorship-demo/decision') {
      return { ...context.state, decision: match.event.data.decision }
    }
    if (match.event.type === 'sponsorship-demo/playback-started') {
      const playback: LegacyOptional<HostSponsorDemoPlaybackStartedData, 'quoteId'>
        = match.event.data
      return {
        ...context.state,
        playback: {
          playbackId: playback.playbackId,
          ...(playback.quoteId === undefined ? {} : { quoteId: playback.quoteId }),
          assetId: playback.assetId,
          durationMs: playback.durationMs,
          rewardTokenCap: playback.rewardTokenCap,
          startedAt: playback.startedAt,
        },
      }
    }
    if (match.event.type === 'sponsorship-demo/reward-issued') {
      const reward: LegacyOptional<HostSponsorDemoRewardIssuedData, 'quoteId'> = match.event.data
      return {
        ...context.state,
        reward: {
          playbackId: reward.playbackId,
          ...(reward.quoteId === undefined ? {} : { quoteId: reward.quoteId }),
          watchedMs: reward.watchedMs,
          grantedTokens: reward.grantedTokens,
          verificationKind: reward.verificationKind,
          completedAt: reward.completedAt,
        },
      }
    }
    if (match.event.type === 'sponsorship-demo/ad-loaded') {
      const loaded: LegacyOptional<
        HostSponsorDemoAdLoadedData,
        'quoteId' | 'scenarioId' | 'pricingBasis' | 'simulatedAdValueMicros'
      > = match.event.data
      return {
        ...context.state,
        adLoaded: {
          requestId: loaded.requestId,
          ...(loaded.quoteId === undefined ? {} : { quoteId: loaded.quoteId }),
          ...(loaded.scenarioId === undefined ? {} : { scenarioId: loaded.scenarioId }),
          ...(loaded.pricingBasis === undefined ? {} : { pricingBasis: loaded.pricingBasis }),
          ...(loaded.simulatedAdValueMicros === undefined
            ? {} : { simulatedAdValueMicros: loaded.simulatedAdValueMicros }),
          adProvider: loaded.adProvider,
          adFormat: loaded.adFormat,
          placementId: loaded.placementId,
          creativeId: loaded.creativeId,
          loadedAt: loaded.loadedAt,
        },
      }
    }
    if (match.event.type === 'sponsorship-demo/ad-rendered') {
      const rendered: LegacyOptional<HostSponsorDemoAdRenderedData, 'quoteId'> = match.event.data
      return {
        ...context.state,
        adRendered: {
          requestId: rendered.requestId,
          ...(rendered.quoteId === undefined ? {} : { quoteId: rendered.quoteId }),
          renderId: rendered.renderId,
          renderedAt: rendered.renderedAt,
        },
      }
    }
    if (match.event.type === 'sponsorship-demo/ad-impression') {
      const impression: LegacyOptional<HostSponsorDemoAdImpressionData, 'quoteId'>
        = match.event.data
      return {
        ...context.state,
        adImpression: {
          requestId: impression.requestId,
          ...(impression.quoteId === undefined ? {} : { quoteId: impression.quoteId }),
          renderId: impression.renderId,
          impressionId: impression.impressionId,
          impressedAt: impression.impressedAt,
        },
      }
    }
    if (match.event.type === 'sponsorship-demo/ad-revenue') {
      const revenue: LegacyOptional<
        HostSponsorDemoAdRevenueData,
        'quoteId' | 'pricingBasis' | 'simulatedAdValueMicros'
      > = match.event.data
      return {
        ...context.state,
        adRevenue: {
          requestId: revenue.requestId,
          impressionId: revenue.impressionId,
          revenueEventId: revenue.revenueEventId,
          ...(revenue.quoteId === undefined ? {} : { quoteId: revenue.quoteId }),
          currency: revenue.currency,
          revenueKind: revenue.revenueKind,
          ...(revenue.pricingBasis === undefined ? {} : { pricingBasis: revenue.pricingBasis }),
          ...(revenue.simulatedAdValueMicros === undefined
            ? {} : { simulatedAdValueMicros: revenue.simulatedAdValueMicros }),
          externalRevenueMicros: revenue.externalRevenueMicros,
          recordedAt: revenue.recordedAt,
        },
      }
    }
    if (match.event.type === 'sponsorship-demo/token-grant-issued') {
      const grant: LegacyOptional<
        HostSponsorDemoTokenGrantIssuedData,
        'quoteId' | 'operatorPoolId' | 'reservedCreditMicros' | 'expiresAt'
      >
        = match.event.data
      return {
        ...context.state,
        tokenGrant: {
          grantId: grant.grantId,
          ...(grant.quoteId === undefined ? {} : { quoteId: grant.quoteId }),
          sourceDecisionEventSeq: grant.sourceDecisionEventSeq,
          grantKind: grant.grantKind,
          grantedTokens: grant.grantedTokens,
          ...(grant.operatorPoolId === undefined ? {} : { operatorPoolId: grant.operatorPoolId }),
          ...(grant.reservedCreditMicros === undefined
            ? {} : { reservedCreditMicros: grant.reservedCreditMicros }),
          verificationKind: grant.verificationKind,
          issuedAt: grant.issuedAt,
          ...(grant.expiresAt === undefined ? {} : { expiresAt: grant.expiresAt }),
        },
      }
    }
    if (match.event.type === 'sponsorship-demo/ad-verification-received') {
      const verification: LegacyOptional<HostSponsorDemoAdVerificationReceivedData, 'quoteId'>
        = match.event.data
      return {
        ...context.state,
        adVerification: {
          callbackId: verification.callbackId,
          ...(verification.quoteId === undefined ? {} : { quoteId: verification.quoteId }),
          requestId: verification.requestId,
          renderId: verification.renderId,
          impressionId: verification.impressionId,
          adProvider: verification.adProvider,
          completionStatus: verification.completionStatus,
          signatureKind: verification.signatureKind,
          signatureVerified: verification.signatureVerified,
          receivedAt: verification.receivedAt,
        },
      }
    }
    if (match.event.type === 'sponsorship-demo/token-grant-settled') {
      const settlement: LegacyOptional<HostSponsorDemoTokenGrantSettledData, 'quoteId'>
        = match.event.data
      return {
        ...context.state,
        tokenGrantSettlement: {
          grantId: settlement.grantId,
          ...(settlement.quoteId === undefined ? {} : { quoteId: settlement.quoteId }),
          settlementStatus: settlement.settlementStatus,
          verificationKind: settlement.verificationKind,
          ...(settlement.sourceCallbackId === undefined
            ? {} : { sourceCallbackId: settlement.sourceCallbackId }),
          ...(settlement.sourcePlaybackId === undefined
            ? {} : { sourcePlaybackId: settlement.sourcePlaybackId }),
          redeemedTokens: settlement.redeemedTokens,
          settledAt: settlement.settledAt,
        },
      }
    }
    if (match.event.type === 'sponsorship-demo/token-grant-revoked') {
      const revocation: LegacyOptional<
        HostSponsorDemoTokenGrantRevokedData,
        | 'quoteId'
        | 'fundedBudgetMicros'
        | 'consumedCostMicrosBeforeRevocation'
        | 'revokedCreditMicros'
      > = match.event.data
      return {
        ...context.state,
        tokenGrantRevocation: {
          grantId: revocation.grantId,
          ...(revocation.quoteId === undefined ? {} : { quoteId: revocation.quoteId }),
          reason: revocation.reason,
          grantedTokens: revocation.grantedTokens,
          consumedTokensBeforeRevocation: revocation.consumedTokensBeforeRevocation,
          revokedTokens: revocation.revokedTokens,
          ...(revocation.fundedBudgetMicros === undefined
            ? {} : { fundedBudgetMicros: revocation.fundedBudgetMicros }),
          ...(revocation.consumedCostMicrosBeforeRevocation === undefined
            ? {} : { consumedCostMicrosBeforeRevocation: revocation.consumedCostMicrosBeforeRevocation }),
          ...(revocation.revokedCreditMicros === undefined
            ? {} : { revokedCreditMicros: revocation.revokedCreditMicros }),
          revokedAt: revocation.revokedAt,
        },
      }
    }
    if (match.event.type === 'sponsorship-demo/token-grant-consumed') {
      const consumption: LegacyOptional<
        HostSponsorDemoTokenGrantConsumedData,
        | 'quoteId'
        | 'projectedInputTokens'
        | 'projectedInputCostMicros'
        | 'estimatedCostMicros'
        | 'remainingCreditMicros'
      > = match.event.data
      return {
        ...context.state,
        tokenConsumptions: [
          ...(context.state.tokenConsumptions ?? []),
          {
            grantId: consumption.grantId,
            ...(consumption.quoteId === undefined ? {} : { quoteId: consumption.quoteId }),
            turn: consumption.turn,
            step: consumption.step,
            provider: consumption.provider,
            model: consumption.model,
            status: consumption.status,
            inputTokens: consumption.inputTokens,
            outputTokens: consumption.outputTokens,
            ...(consumption.projectedInputTokens === undefined
              ? {} : { projectedInputTokens: consumption.projectedInputTokens }),
            ...(consumption.projectedInputCostMicros === undefined
              ? {} : { projectedInputCostMicros: consumption.projectedInputCostMicros }),
            ...(consumption.estimatedCostMicros === undefined
              ? {} : { estimatedCostMicros: consumption.estimatedCostMicros }),
            ...(consumption.remainingCreditMicros === undefined
              ? {} : { remainingCreditMicros: consumption.remainingCreditMicros }),
            remainingTokens: consumption.remainingTokens,
            remainingSteps: consumption.remainingSteps,
            consumedAt: consumption.consumedAt,
          },
        ],
      }
    }
    if (match.event.type === 'sponsorship-demo/receipt') {
      const receipt: LegacyOptional<HostSponsorDemoReceiptData, 'rewardQuote'> = match.event.data
      return {
        ...context.state,
        receipt: {
          status: receipt.status,
          sponsorshipUsed: receipt.sponsorshipUsed,
          provider: receipt.provider,
          model: receipt.model,
          stepsUsed: receipt.stepsUsed,
          inputTokens: receipt.inputTokens,
          outputTokens: receipt.outputTokens,
          maxSteps: receipt.maxSteps,
          maxOutputTokensPerRequest: receipt.maxOutputTokensPerRequest,
          maxTotalTokens: receipt.maxTotalTokens,
          maxEstimatedCostMicros: receipt.maxEstimatedCostMicros,
          estimatedCostMicros: receipt.estimatedCostMicros,
          actualCostMicros: receipt.actualCostMicros,
          currency: receipt.currency,
          costKind: receipt.costKind,
          fundingMode: receipt.fundingMode,
          ...(receipt.rewardQuote === undefined ? {} : { rewardQuote: { ...receipt.rewardQuote } }),
          rewardTokenCap: receipt.rewardTokenCap,
          rewardIssued: receipt.rewardIssued,
          watchedMs: receipt.watchedMs,
          grantedTokens: receipt.grantedTokens,
          grantStatus: receipt.grantStatus,
          redeemedTokens: receipt.redeemedTokens,
          revokedTokens: receipt.revokedTokens,
          ...(receipt.adLedger === undefined ? {} : { adLedger: receipt.adLedger }),
        },
      }
    }
    return context.state
  },
  buildLocationData: (context, scope): ConversationLocationData | null => {
    if (scope !== 'step' || context.state === undefined) return null
    return {
      kind: 'step',
      turn: context.state.turn,
      step: context.state.step,
      key: 'sponsored-run',
      value: context.state,
    }
  },
  buildViewNode: (context): ChatConversationViewNode | null => {
    if (context.start === undefined || context.state?.presentation === 'reasoning-card') return null
    return {
      key: context.key,
      kind: 'sponsored-run',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start.event.seq,
      location: context.start.location,
      visibility: 'visible',
      data: context.state,
    }
  },
}
