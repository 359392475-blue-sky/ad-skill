import type {
  SponsorDemoReceiptData,
  SponsorDemoTokenGrantData,
  SponsorDemoTokenGrantConsumptionData,
} from './sponsor-definition.ts'

/** Offer and grant funding facts needed to explain one receipt. */
export interface SponsorReceiptFunding {
  readonly tokenGrant?: SponsorDemoTokenGrantData | undefined
  readonly operatorInputSubsidyMicros?: number | undefined
}

/** Receipt values derived from the durable cross-Turn consumption ledger. */
export interface SponsorReceiptUsage {
  readonly latestConsumption?: SponsorDemoTokenGrantConsumptionData | undefined
  readonly inputTokens: number
  readonly outputTokens: number
  readonly estimatedCostMicros: number
  readonly effectiveBudgetMicros?: number | undefined
  readonly quotedBudgetMicros?: number | undefined
  readonly simulatedAdContributionMicros?: number | undefined
  readonly operatorInputSubsidyMicros?: number | undefined
  readonly hasConsumptions: boolean
}

/** Keep an immutable offer-Turn receipt current as later sponsored calls arrive. */
export function deriveSponsorReceiptUsage(
  receipt: SponsorDemoReceiptData,
  consumptions: readonly SponsorDemoTokenGrantConsumptionData[] | undefined,
  funding: SponsorReceiptFunding = {},
): SponsorReceiptUsage {
  const values = consumptions ?? []
  const latestConsumption = values[values.length - 1]
  const hasConsumptions = latestConsumption !== undefined
  const hasCompleteConsumptionCosts = hasConsumptions
    && values.every(consumption => consumption.estimatedCostMicros !== undefined)
  const simulatedAdContributionMicros = receipt.rewardQuote?.fundedBudgetMicros
  const operatorInputSubsidyMicros = funding.operatorInputSubsidyMicros
  const quotedReservationMicros = simulatedAdContributionMicros === undefined
    ? undefined
    : Math.min(
      receipt.maxEstimatedCostMicros,
      simulatedAdContributionMicros + (operatorInputSubsidyMicros ?? 0),
    )
  const hasIssuedOrUsedGrant = funding.tokenGrant !== undefined
    || receipt.grantStatus !== 'not-issued'
    || receipt.rewardIssued
    || receipt.sponsorshipUsed
    || hasConsumptions
  return {
    latestConsumption,
    inputTokens: hasConsumptions
      ? values.reduce((total, consumption) => total + consumption.inputTokens, 0)
      : receipt.inputTokens,
    outputTokens: hasConsumptions
      ? values.reduce((total, consumption) => total + consumption.outputTokens, 0)
      : receipt.outputTokens,
    estimatedCostMicros: hasCompleteConsumptionCosts
      ? values.reduce((total, consumption) => total + (consumption.estimatedCostMicros ?? 0), 0)
      : receipt.estimatedCostMicros,
    effectiveBudgetMicros: funding.tokenGrant?.reservedCreditMicros
      ?? (hasIssuedOrUsedGrant ? quotedReservationMicros : undefined),
    quotedBudgetMicros: quotedReservationMicros,
    simulatedAdContributionMicros,
    operatorInputSubsidyMicros,
    hasConsumptions,
  }
}
