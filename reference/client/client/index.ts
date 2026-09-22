/** Browser plugin for the simulated sponsorship Conversation Node. */

import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SponsorDemoAdFailureReason } from '@deepseek-ai/dsh-sponsor-demo/types'
import {
  ReasoningSponsor,
  type ReasoningSponsorInjected,
  type SponsorAdAction,
  type SponsorAdActionResult,
  type SponsorPlaybackAction,
} from './ReasoningSponsor.tsx'
import { SponsoredRunCard, type SponsorDemoAction, type SponsorDemoInjected } from './SponsoredRunCard.tsx'
import { en, NS, type SponsorDemoKey, zh } from './locales.ts'
import { sponsoredRunDefinition } from './sponsor-definition.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Simulated sponsorship card copy. */
    sponsorDemo: SponsorDemoKey
  }
}

/** Required services for the Definition, keyed renderer, sponsor Remote, and copy. */
export const inject = ['conversationEvents', 'slots', 'remote', 'remote.sponsorDemo', 'locale']

const SAFE_RUN_ID = /^[a-zA-Z0-9._:-]+$/
const SAFE_OPAQUE_ID = /^[a-zA-Z0-9._:-]{1,200}$/

async function executeSponsorRemote(
  ctx: ClientContext,
  sessionId: SessionId,
  action: SponsorDemoAction | SponsorPlaybackAction,
  runId: string,
): Promise<string | null> {
  if (!SAFE_RUN_ID.test(runId)) return 'invalid sponsorship run id'
  const remote = ctx.remote.sponsorDemo
  const result = action === 'accept'
    ? await remote.accept(sessionId, runId)
    : action === 'decline'
      ? await remote.decline(sessionId, runId)
      : action === 'start'
        ? await remote.start(sessionId, runId)
        : await remote.complete(sessionId, runId)
  if (!result.ok) return `${result.error.message} (${result.error.code})`
  return result.value.ok ? null : result.value.message
}

async function executeSponsorAdRemote(
  ctx: ClientContext,
  sessionId: SessionId,
  action: SponsorAdAction,
  runId: string,
  requestId?: string,
): Promise<SponsorAdActionResult> {
  if (!SAFE_RUN_ID.test(runId)) return { error: 'invalid sponsorship run id' }
  if (action !== 'load' && (requestId === undefined || !SAFE_OPAQUE_ID.test(requestId))) {
    return { error: 'invalid sponsorship ad request id' }
  }
  const remote = ctx.remote.sponsorDemo
  const opaqueRequestId = requestId ?? ''
  const result = action === 'load'
    ? await remote.loadAd(sessionId, runId)
    : action === 'render'
      ? await remote.renderAd(sessionId, runId, opaqueRequestId)
      : await remote.recordAdImpression(sessionId, runId, opaqueRequestId)
  if (!result.ok) return { error: `${result.error.message} (${result.error.code})` }
  if (!result.value.ok) return { error: result.value.message }
  return {
    error: null,
    ...(result.value.opaqueId === undefined ? {} : { opaqueId: result.value.opaqueId }),
  }
}

async function executeSponsorAdFailureRemote(
  ctx: ClientContext,
  sessionId: SessionId,
  runId: string,
  reason: SponsorDemoAdFailureReason,
): Promise<string | null> {
  if (!SAFE_RUN_ID.test(runId)) return 'invalid sponsorship run id'
  const result = await ctx.remote.sponsorDemo.failAd(sessionId, runId, reason)
  if (!result.ok) return `${result.error.message} (${result.error.code})`
  return result.value.ok ? null : result.value.message
}

/** Register the sponsorship Definition, dictionary, and keyed Chat renderer. */
export function apply(ctx: ClientContext): void {
  ctx.conversationEvents.register(sponsoredRunDefinition)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sponsor-demo: dictionaries')
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'sponsored-run',
    locale: NS,
    inject: (sessionId: SessionId): SponsorDemoInjected => ({
      decideSponsorship: (runId: string, action: SponsorDemoAction) =>
        executeSponsorRemote(ctx, sessionId, action, runId),
      updateAd: (runId: string, action: SponsorAdAction, requestId?: string) =>
        executeSponsorAdRemote(ctx, sessionId, action, runId, requestId),
      failAd: (runId: string, reason: SponsorDemoAdFailureReason) =>
        executeSponsorAdFailureRemote(ctx, sessionId, runId, reason),
    }),
  }, SponsoredRunCard))
  ctx.slots.inject('conversation.chat.reasoning.sponsor', () => ctx.slots.register({
    name: 'conversation.chat.reasoning.sponsor',
    locale: NS,
    inject: (sessionId: SessionId): ReasoningSponsorInjected => ({
      acceptSponsorship: (runId: string) =>
        executeSponsorRemote(ctx, sessionId, 'accept', runId),
      updatePlayback: (runId: string, action: SponsorPlaybackAction) =>
        executeSponsorRemote(ctx, sessionId, action, runId),
      updateAd: (runId: string, action: SponsorAdAction, requestId?: string) =>
        executeSponsorAdRemote(ctx, sessionId, action, runId, requestId),
      failAd: (runId: string, reason: SponsorDemoAdFailureReason) =>
        executeSponsorAdFailureRemote(ctx, sessionId, runId, reason),
    }),
  }, ReasoningSponsor))
}
