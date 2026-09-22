import { useCallback, useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SponsorDemoAdFailureReason } from '@deepseek-ai/dsh-sponsor-demo/types'
import type { SponsorDemoKey } from './locales.ts'
import type { SponsorAdAction, SponsorAdActionResult } from './ReasoningSponsor.tsx'
import type {
  SponsoredRunChatData,
  SponsorDemoDecision, SponsorDemoReceiptData, SponsorDemoReceiptStatus,
} from './sponsor-definition.ts'
import { deriveSponsorReceiptUsage, type SponsorReceiptUsage } from './receipt-usage.ts'
import {
  TENCENT_GDT_NATIVE_MOCK_ASSET_ID,
  TENCENT_GDT_NATIVE_MOCK_PLACEMENT_ID,
  TENCENT_PC_LOCAL_MOCK,
  type TencentPcNativeTemplateCreative,
} from './tencent-pc-mock.ts'
import css from './SponsoredRunCard.module.css'

/** User decisions admitted through the typed Host Remote. */
export type SponsorDemoAction = 'accept' | 'decline'

/** Sponsorship action injected from the plugin's typed Remote access. */
export interface SponsorDemoInjected {
  /**
   * Record one sponsorship choice for the exact durable run.
   * @param runId - stable sponsorship run identity.
   * @param action - accept or decline this one-time offer.
   * @returns null after Host admission; a user-visible failure otherwise.
   */
  readonly decideSponsorship: (runId: string, action: SponsorDemoAction) => Promise<string | null>
  /** Advance one Host-owned Tencent sandbox lifecycle; only `load` omits requestId. */
  readonly updateAd: (
    runId: string,
    action: SponsorAdAction,
    requestId?: string,
  ) => Promise<SponsorAdActionResult>
  /** Revoke unused provisional credit after the fixed local creative cannot settle. */
  readonly failAd: (runId: string, reason: SponsorDemoAdFailureReason) => Promise<string | null>
}

/** Complete keyed Chat renderer props. */
export type SponsoredRunCardProps =
  PropsRuntime<'conversation.chat.node', 'sponsored-run'>
  & PropsLocale<'sponsorDemo'>
  & SponsorDemoInjected

const DECISION_KEYS = {
  accepted: 'decision.accepted',
  declined: 'decision.declined',
  expired: 'decision.expired',
  cancelled: 'decision.cancelled',
} as const satisfies Record<SponsorDemoDecision, SponsorDemoKey>

const RECEIPT_STATUS_KEYS = {
  completed: 'receipt.status.completed',
  declined: 'receipt.status.declined',
  capped: 'receipt.status.capped',
  failed: 'receipt.status.failed',
  cancelled: 'receipt.status.cancelled',
} as const satisfies Record<SponsorDemoReceiptStatus, SponsorDemoKey>

const CURRENCY_FORMAT = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})
const COUNT_FORMAT = new Intl.NumberFormat('zh-CN')

function formatMicros(value: number): string {
  return CURRENCY_FORMAT.format(value / 1_000_000)
}

function formatCount(value: number): string {
  return COUNT_FORMAT.format(value)
}

function clock(valueMs: number): string {
  const seconds = Math.max(0, Math.ceil(valueMs / 1_000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function isTencentNativeOffer(data: SponsoredRunChatData): boolean {
  const loadedMatches = data.adLoaded === undefined || (
    data.adLoaded.placementId === TENCENT_GDT_NATIVE_MOCK_PLACEMENT_ID
    && data.adLoaded.creativeId === TENCENT_GDT_NATIVE_MOCK_ASSET_ID
  )
  return data.adProvider === 'tencent-gdt-sandbox'
    && data.adFormat === 'native-template'
    && data.assetId === TENCENT_GDT_NATIVE_MOCK_ASSET_ID
    && loadedMatches
}

function QuoteSummary({ data, t }: {
  readonly data: SponsoredRunChatData
  readonly t: SponsoredRunCardProps['t']
}) {
  if (data.rewardQuote === undefined) return null
  return (
    <div className={css.quote} data-sponsor-quote-id={data.rewardQuote.quoteId}>
      <span>{t('reasoning.quote.label')}</span>
      <strong>{t('reasoning.quote.value', {
        amount: formatMicros(data.rewardQuote.simulatedAdValueMicros),
      })}</strong>
      <span data-sponsor-ad-contribution-micros={data.rewardQuote.fundedBudgetMicros}>
        {t('reasoning.quote.adContribution', {
          amount: formatMicros(data.rewardQuote.fundedBudgetMicros),
        })}
      </span>
      {data.operatorInputSubsidyMicros === undefined ? null : (
        <span data-sponsor-operator-input-subsidy-micros={data.operatorInputSubsidyMicros}>
          {t('reasoning.quote.operatorInputSubsidy', {
            amount: formatMicros(data.operatorInputSubsidyMicros),
          })}
        </span>
      )}
      <b>{t('reasoning.quote.reward', { count: formatCount(data.rewardQuote.rewardTokens) })}</b>
      <small>{t('reasoning.quote.disclosure')}</small>
    </div>
  )
}

function GrantLifecycle({ data, t }: {
  readonly data: SponsoredRunChatData
  readonly t: SponsoredRunCardProps['t']
}) {
  if (data.tokenGrant === undefined && data.tokenGrantSettlement === undefined) return null
  const verified = data.adVerification?.signatureVerified === true
    || data.tokenGrantSettlement !== undefined
  const settled = data.tokenGrantSettlement !== undefined
  const stages = [
    { label: t('reasoning.lifecycle.issued'), done: true },
    { label: t('reasoning.lifecycle.verified'), done: verified },
    { label: t('reasoning.lifecycle.settled'), done: settled },
  ]
  return (
    <ol className={css.grantLifecycle} aria-label={t('reasoning.lifecycle.aria')}>
      {stages.map((stage, index) => (
        <li key={stage.label} data-complete={stage.done ? 'true' : 'false'}>
          <span aria-hidden="true">{stage.done ? '✓' : index + 1}</span>
          {stage.label}
        </li>
      ))}
    </ol>
  )
}

function OfferLimits({ data, t }: {
  readonly data: SponsoredRunCardProps['node']['data']
  readonly t: SponsoredRunCardProps['t']
}) {
  return (
    <dl className={css.limitGrid}>
      <div className={css.limitItem}>
        <dt>{t('limit.route')}</dt>
        <dd>{data.model} <span>/ {data.provider}</span></dd>
      </div>
      <div className={css.limitItem}>
        <dt>{t('limit.steps')}</dt>
        <dd>{t('limit.steps.value', { count: formatCount(data.maxSteps) })}</dd>
      </div>
      <div className={css.limitItem}>
        <dt>{t('limit.output')}</dt>
        <dd>{t('limit.output.value', { count: formatCount(data.maxOutputTokensPerRequest) })}</dd>
      </div>
      <div className={css.limitItem}>
        <dt>{t('limit.globalTotalTokens')}</dt>
        <dd>{t('limit.totalTokens.value', { count: formatCount(data.maxTotalTokens) })}</dd>
      </div>
      <div className={css.limitItem}>
        <dt>{t('limit.globalBudget')}</dt>
        <dd>{formatMicros(data.maxEstimatedCostMicros)}</dd>
      </div>
    </dl>
  )
}

function Receipt({ receipt, usage, t }: {
  readonly receipt: SponsorDemoReceiptData
  readonly usage: SponsorReceiptUsage
  readonly t: SponsoredRunCardProps['t']
}) {
  const sponsorshipUsed = usage.hasConsumptions || receipt.sponsorshipUsed
  const route = usage.latestConsumption !== undefined
    ? `${usage.latestConsumption.model} / ${usage.latestConsumption.provider}`
    : receipt.sponsorshipUsed
      ? `${receipt.model} / ${receipt.provider}`
      : t('receipt.route.unused')
  const configuredCost = receipt.costKind === 'configured-estimate'
    ? t('receipt.simulatedCost.value', { amount: formatMicros(usage.estimatedCostMicros) })
    : t('receipt.simulatedCost.unavailable')
  const externalCost = receipt.actualCostMicros === null
    ? t('receipt.externalCost.unavailable')
    : t('receipt.externalCost.value', { amount: formatMicros(receipt.actualCostMicros) })
  return (
    <div className={css.receipt} data-receipt-status={receipt.status}>
      <div className={css.receiptHeader}>
        <strong>{t('receipt.title')}</strong>
        <span>{sponsorshipUsed ? t('receipt.used') : t('receipt.unused')}</span>
      </div>
      <dl className={css.receiptGrid}>
        <div>
          <dt>{t('receipt.status')}</dt>
          <dd>{t(RECEIPT_STATUS_KEYS[receipt.status])}</dd>
        </div>
        <div>
          <dt>{t('receipt.route')}</dt>
          <dd>{route}</dd>
        </div>
        <div>
          <dt>{t('receipt.steps')}</dt>
          <dd>{t('receipt.steps.value', {
            used: formatCount(receipt.stepsUsed),
            limit: formatCount(receipt.maxSteps),
          })}</dd>
        </div>
        <div>
          <dt>{t('receipt.tokens')}</dt>
          <dd>{t('receipt.tokens.value', {
            input: formatCount(usage.inputTokens),
            output: formatCount(usage.outputTokens),
          })}</dd>
        </div>
        <div>
          <dt>{t('receipt.globalTotalTokens')}</dt>
          <dd>{t('receipt.totalTokens.value', { count: formatCount(receipt.maxTotalTokens) })}</dd>
        </div>
        <div>
          <dt>{t('receipt.simulatedCost')}</dt>
          <dd>{configuredCost}</dd>
        </div>
        <div>
          <dt>{t('receipt.externalCost')}</dt>
          <dd>{externalCost}</dd>
        </div>
        {usage.effectiveBudgetMicros === undefined ? null : (
          <div data-sponsor-effective-budget-micros={usage.effectiveBudgetMicros}>
            <dt>{t('receipt.reservedBudget')}</dt>
            <dd>{formatMicros(usage.effectiveBudgetMicros)}</dd>
          </div>
        )}
        {usage.effectiveBudgetMicros !== undefined || usage.quotedBudgetMicros === undefined ? null : (
          <div data-sponsor-quoted-budget-micros={usage.quotedBudgetMicros}>
            <dt>{t('receipt.quotedBudget')}</dt>
            <dd>{formatMicros(usage.quotedBudgetMicros)}</dd>
          </div>
        )}
        {usage.simulatedAdContributionMicros === undefined ? null : (
          <div data-sponsor-ad-contribution-micros={usage.simulatedAdContributionMicros}>
            <dt>{t('receipt.adContribution')}</dt>
            <dd>{formatMicros(usage.simulatedAdContributionMicros)}</dd>
          </div>
        )}
        {usage.operatorInputSubsidyMicros === undefined ? null : (
          <div data-sponsor-operator-input-subsidy-micros={usage.operatorInputSubsidyMicros}>
            <dt>{t('receipt.operatorInputSubsidy')}</dt>
            <dd>{formatMicros(usage.operatorInputSubsidyMicros)}</dd>
          </div>
        )}
        <div>
          <dt>{t('receipt.globalBudget')}</dt>
          <dd>{formatMicros(receipt.maxEstimatedCostMicros)}</dd>
        </div>
        <div>
          <dt>{t('receipt.outputLimit')}</dt>
          <dd>{t('receipt.outputLimit.value', {
            count: formatCount(receipt.maxOutputTokensPerRequest),
          })}</dd>
        </div>
        {usage.latestConsumption === undefined ? null : (
          <div>
            <dt>{t('reasoning.receipt.remaining')}</dt>
            <dd>{t('reasoning.receipt.remaining.value', {
              tokens: formatCount(usage.latestConsumption.remainingTokens),
              steps: formatCount(usage.latestConsumption.remainingSteps),
            })}</dd>
          </div>
        )}
      </dl>
    </div>
  )
}

/** Render one independent simulated sponsorship offer, its local ad, and transparent receipt. */
export function SponsoredRunCard({
  node, decideSponsorship, updateAd, failAd, t,
}: SponsoredRunCardProps) {
  const [submitting, setSubmitting] = useState<SponsorDemoAction | null>(null)
  const [submitted, setSubmitted] = useState<SponsorDemoAction | null>(null)
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const [adError, setAdError] = useState<'asset' | 'load' | 'render' | 'impression' | null>(null)
  const [nativeCreative, setNativeCreative] = useState<TencentPcNativeTemplateCreative | null>(null)
  const [nativeRequestId, setNativeRequestId] = useState<string | null>(null)
  const [nativeRenderedRequestId, setNativeRenderedRequestId] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const loadRequestedRef = useRef(false)
  const creativeRequestedRef = useRef<string | null>(null)
  const renderRequestedRef = useRef<string | null>(null)
  const impressionRequestedRef = useRef<string | null>(null)
  const failedRunRef = useRef<string | null>(null)
  const mountedRef = useRef(true)

  const data = node.data
  const effectiveDecision: SponsorDemoDecision | undefined = data.decision
    ?? (submitted === 'accept' ? 'accepted' : submitted === 'decline' ? 'declined' : undefined)
  const accepted = effectiveDecision === 'accepted'
  const tencentNative = isTencentNativeOffer(data)
  const terminalGrant = data.tokenGrantSettlement !== undefined
    || data.tokenGrantRevocation !== undefined
  const effectiveNativeRequestId = data.adLoaded?.requestId ?? nativeRequestId
  const nativeRendered = effectiveNativeRequestId !== null && (
    data.adRendered?.requestId === effectiveNativeRequestId
    || nativeRenderedRequestId === effectiveNativeRequestId
  )
  const quotedRewardTokens = data.rewardQuote?.rewardTokens ?? data.rewardTokens
  const remainingMs = Math.max(0, data.adDurationMs - elapsedMs)

  useEffect(() => () => { mountedRef.current = false }, [])

  const reportAdFailure = useCallback((
    reason: SponsorDemoAdFailureReason,
    localError: NonNullable<typeof adError>,
  ): void => {
    if (failedRunRef.current === data.runId) return
    failedRunRef.current = data.runId
    setAdError(localError)
    setConfirming(false)
    void failAd(data.runId, reason).then((failure) => {
      if (failure !== null && mountedRef.current) setDecisionError(failure)
    }).catch(() => {
      if (mountedRef.current) setDecisionError(t('error.transport'))
    })
  }, [data.runId, failAd, t])

  const decide = async (action: SponsorDemoAction): Promise<void> => {
    setSubmitting(action)
    setDecisionError(null)
    try {
      const failure = await decideSponsorship(node.data.runId, action)
      if (failure === null) setSubmitted(action)
      else setDecisionError(failure)
    } catch {
      setDecisionError(t('error.transport'))
    } finally {
      setSubmitting(null)
    }
  }

  useEffect(() => {
    if (
      !accepted || !tencentNative || terminalGrant || data.adImpression !== undefined
      || effectiveNativeRequestId !== null || loadRequestedRef.current
    ) return
    loadRequestedRef.current = true
    void updateAd(data.runId, 'load').then((result) => {
      if (!mountedRef.current) return
      if (result.error !== null || result.opaqueId === undefined) {
        reportAdFailure('load-failed', 'load')
        return
      }
      setNativeRequestId(result.opaqueId)
    }).catch(() => { reportAdFailure('load-failed', 'load') })
  }, [
    accepted, data.adImpression, data.runId, effectiveNativeRequestId,
    reportAdFailure, tencentNative, terminalGrant, updateAd,
  ])

  useEffect(() => {
    const requestId = effectiveNativeRequestId
    if (
      !accepted || !tencentNative || terminalGrant || data.adImpression !== undefined
      || requestId === null || nativeCreative !== null
      || creativeRequestedRef.current === requestId
    ) return
    creativeRequestedRef.current = requestId
    void TENCENT_PC_LOCAL_MOCK.loadNativeAdData({
      placementId: TENCENT_GDT_NATIVE_MOCK_PLACEMENT_ID,
      count: 1,
    }).then(([creative]) => {
      if (!mountedRef.current) return
      const expectedCreativeId = data.adLoaded?.creativeId ?? TENCENT_GDT_NATIVE_MOCK_ASSET_ID
      if (
        creative === undefined
        || creative.placementId !== TENCENT_GDT_NATIVE_MOCK_PLACEMENT_ID
        || creative.advertisementId !== expectedCreativeId
      ) {
        reportAdFailure('load-failed', 'asset')
        return
      }
      setNativeCreative(creative)
    }).catch(() => { reportAdFailure('load-failed', 'asset') })
  }, [
    accepted, data.adImpression, data.adLoaded?.creativeId, effectiveNativeRequestId,
    nativeCreative, reportAdFailure, tencentNative, terminalGrant,
  ])

  useEffect(() => {
    const requestId = effectiveNativeRequestId
    if (
      !accepted || !tencentNative || terminalGrant || data.adImpression !== undefined
      || requestId === null || nativeCreative === null || nativeRendered
      || renderRequestedRef.current === requestId
    ) return
    renderRequestedRef.current = requestId
    void updateAd(data.runId, 'render', requestId).then((result) => {
      if (!mountedRef.current) return
      if (result.error !== null) {
        reportAdFailure('render-failed', 'render')
        return
      }
      setNativeRenderedRequestId(requestId)
    }).catch(() => { reportAdFailure('render-failed', 'render') })
  }, [
    accepted, data.adImpression, data.runId, effectiveNativeRequestId, nativeCreative,
    nativeRendered, reportAdFailure, tencentNative, terminalGrant, updateAd,
  ])

  const recordNativeImpression = useCallback((): void => {
    const requestId = effectiveNativeRequestId
    if (
      requestId === null || data.adImpression !== undefined
      || impressionRequestedRef.current === requestId
    ) return
    impressionRequestedRef.current = requestId
    setConfirming(true)
    void updateAd(data.runId, 'impression', requestId).then((result) => {
      if (result.error === null || !mountedRef.current) return
      reportAdFailure('verification-rejected', 'impression')
    }).catch(() => { reportAdFailure('verification-rejected', 'impression') })
  }, [data.adImpression, data.runId, effectiveNativeRequestId, reportAdFailure, updateAd])

  useEffect(() => {
    if (
      !accepted || !tencentNative || terminalGrant || data.adImpression !== undefined
      || nativeCreative === null || !nativeRendered || data.adDurationMs <= 0
      || adError !== null
    ) return
    let accumulatedVisibleMs = 0
    let visibleSince = document.visibilityState === 'visible' ? Date.now() : null
    let stopped = false
    const measuredVisibleMs = (): number => visibleSince === null
      ? accumulatedVisibleMs
      : accumulatedVisibleMs + Math.max(0, Date.now() - visibleSince)
    const update = (): void => {
      if (stopped) return
      const next = Math.min(data.adDurationMs, measuredVisibleMs())
      setElapsedMs(next)
      if (next >= data.adDurationMs) {
        stopped = true
        recordNativeImpression()
      }
    }
    const visibilityChanged = (): void => {
      if (document.visibilityState === 'visible') {
        if (visibleSince === null) visibleSince = Date.now()
      } else if (visibleSince !== null) {
        accumulatedVisibleMs += Math.max(0, Date.now() - visibleSince)
        visibleSince = null
      }
      update()
    }
    update()
    const timer = window.setInterval(update, 100)
    document.addEventListener('visibilitychange', visibilityChanged)
    return () => {
      stopped = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', visibilityChanged)
    }
  }, [
    accepted, adError, data.adDurationMs, data.adImpression, nativeCreative,
    nativeRendered, recordNativeImpression, tencentNative, terminalGrant,
  ])

  useEffect(() => {
    if (data.adImpression === undefined) return
    setElapsedMs(data.adDurationMs)
    setConfirming(data.tokenGrantSettlement === undefined)
  }, [data.adDurationMs, data.adImpression, data.tokenGrantSettlement])

  const waiting = submitting !== null
  const showNativeFlow = accepted && tencentNative && !terminalGrant
  return (
    <section
      className={css.root}
      aria-label={t('card.aria')}
      data-sponsored-run
      data-sponsorship-decision={effectiveDecision ?? 'offered'}
    >
      <header className={css.header}>
        <span className={css.badge}>{t('card.badge')}</span>
        <div className={css.identity}>
          <strong>{t('card.sponsor')}</strong>
          <span>{t('card.disclosure')}</span>
        </div>
      </header>

      <div className={css.body}>
        <h3>{t('offer.title')}</h3>
        <p>{t('offer.body')}</p>
        <p className={css.fundingWarning} data-sponsor-funding-mode={node.data.fundingMode}>
          {node.data.fundingMode === 'current-credential-simulation'
            ? t('reasoning.funding.simulation')
            : t('reasoning.funding.dedicated')}
        </p>
        <QuoteSummary data={data} t={t} />
        <OfferLimits data={node.data} t={t} />

        {data.tokenGrantRevocation !== undefined && data.tokenGrantSettlement === undefined
          ? (
            <div className={css.adFailure}>
              <p role="status">{t('reasoning.grant.revoked')}</p>
              <GrantLifecycle data={data} t={t} />
              {data.receipt === undefined
                ? null
                : <Receipt
                  receipt={data.receipt}
                  usage={deriveSponsorReceiptUsage(data.receipt, data.tokenConsumptions, {
                    tokenGrant: data.tokenGrant,
                    operatorInputSubsidyMicros: data.operatorInputSubsidyMicros,
                  })}
                  t={t}
                />}
            </div>
          )
          : data.tokenGrantSettlement !== undefined
            ? (
              <div className={css.adSettled} data-sponsor-ad-settled>
                <p role="status">{t('reasoning.tencent.settlement')}</p>
                <GrantLifecycle data={data} t={t} />
                {data.receipt === undefined
                  ? null
                  : <Receipt
                    receipt={data.receipt}
                    usage={deriveSponsorReceiptUsage(data.receipt, data.tokenConsumptions, {
                      tokenGrant: data.tokenGrant,
                      operatorInputSubsidyMicros: data.operatorInputSubsidyMicros,
                    })}
                    t={t}
                  />}
              </div>
            )
            : showNativeFlow
              ? data.adImpression !== undefined
                ? (
                  <div className={css.adLoading} role="status">
                    <span className={css.pulse} aria-hidden="true" />
                    <span>{t('reasoning.tencent.confirming')}</span>
                    <GrantLifecycle data={data} t={t} />
                  </div>
                )
                : nativeCreative === null
                  ? (
                    <div className={css.adLoading} role={adError === null ? 'status' : 'alert'}>
                      <span className={css.pulse} aria-hidden="true" />
                      <span>{adError === null
                        ? t('reasoning.tencent.loading')
                        : t(`reasoning.error.${adError}`)}</span>
                    </div>
                  )
                  : (
                    <section
                      className={css.nativeCard}
                      aria-label={t('reasoning.tencent.aria')}
                      data-sponsored-conversation-ad
                      data-advertisement-id={nativeCreative.advertisementId}
                    >
                      <div className={css.nativeVisual}>
                        <img
                          src={nativeCreative.imageSrc}
                          alt={t('reasoning.video.aria')}
                          onError={() => { reportAdFailure('load-failed', 'asset') }}
                        />
                        <span className={css.nativeAdBadge}>{t('reasoning.tencent.adLabel')}</span>
                      </div>
                      <div className={css.nativeCopy}>
                        <div className={css.nativeTopline}>
                          <strong>{t('reasoning.tencent.contract')}</strong>
                          <span>{confirming
                            ? t('reasoning.tencent.confirming')
                            : t('reasoning.tencent.remaining', { time: clock(remainingMs) })}</span>
                        </div>
                        <span className={css.nativeAdvertiser}>{nativeCreative.advertiser}</span>
                        <h4>{nativeCreative.title}</h4>
                        <p>{nativeCreative.description}</p>
                        {adError === null ? null : (
                          <p className={css.nativeError} role="alert">{t(`reasoning.error.${adError}`)}</p>
                        )}
                        <div className={css.nativeReward}>
                          {t('reasoning.video.reward', { count: formatCount(quotedRewardTokens) })}
                        </div>
                        <GrantLifecycle data={data} t={t} />
                      </div>
                      <div className={css.progressTrack} aria-hidden="true">
                        <span style={{
                          width: `${Math.min(100, data.adDurationMs <= 0
                            ? 0 : (elapsedMs / data.adDurationMs) * 100)}%`,
                        }} />
                      </div>
                      <p className={css.nativeDisclosure}>{t('reasoning.tencent.disclosure')}</p>
                    </section>
                  )
              : data.receipt !== undefined
                ? <Receipt
                  receipt={data.receipt}
                  usage={deriveSponsorReceiptUsage(data.receipt, data.tokenConsumptions, {
                    tokenGrant: data.tokenGrant,
                    operatorInputSubsidyMicros: data.operatorInputSubsidyMicros,
                  })}
                  t={t}
                />
                : effectiveDecision !== undefined
                  ? <p className={css.status} role="status">{t(DECISION_KEYS[effectiveDecision])}</p>
                  : (
                    <div className={css.actions}>
                      <button
                        type="button"
                        className={css.primaryAction}
                        disabled={waiting}
                        onClick={() => { void decide('accept') }}
                      >
                        {waiting ? t('action.recording') : t('action.accept')}
                      </button>
                      <button
                        type="button"
                        className={css.secondaryAction}
                        disabled={waiting}
                        onClick={() => { void decide('decline') }}
                      >
                        {t('action.decline')}
                      </button>
                    </div>
                  )}
        {decisionError === null ? null : <p className={css.error} role="alert">{decisionError}</p>}
      </div>
    </section>
  )
}
