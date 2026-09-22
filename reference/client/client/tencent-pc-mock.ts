import tencentNativeTemplateImage from './assets/kfc-thursday-concept-demo.jpg'

const LOCAL_PACKAGED_ASSET_REFS = new Set([tencentNativeTemplateImage])

/** Host-selected identity for the local Tencent-compatible native-template fixture. */
export const TENCENT_GDT_NATIVE_MOCK_ASSET_ID = 'tencent-gdt-native-mock-v1'

/** Local placement key mirrored in the inject-data response. */
export const TENCENT_GDT_NATIVE_MOCK_PLACEMENT_ID = 'tencent-gdt-sandbox-placement-v1'

/** One Tencent PC self-rendered ad row consumed by the local adapter. */
export interface TencentPcInjectedAdInfo {
  readonly traceid: string
  readonly advertisement_id: string
  readonly placement_id: string
  readonly title: string
  readonly desc: string
  readonly img: string
  readonly button_txt: string
  readonly advertiser: string
  readonly ecpm: number
}

/** One placement result inside the public Tencent-compatible inject-data envelope. */
export interface TencentPcInjectedPlacementResult {
  readonly ret: number
  readonly list: readonly TencentPcInjectedAdInfo[]
}

/** Local equivalent of `{ data: { [posId]: { ret, list } } }`. */
export interface TencentPcInjectAdDataResponse {
  readonly data: Readonly<Record<string, TencentPcInjectedPlacementResult>>
}

/** Parameters accepted by the local equivalent of `loadNativeAdData`. */
export interface TencentPcLoadNativeAdOptions {
  readonly placementId: string
  readonly count?: number
}

/** UI-safe native-template fields returned by the local adapter. */
export interface TencentPcNativeTemplateCreative {
  readonly traceId: string
  readonly advertisementId: string
  readonly placementId: string
  readonly title: string
  readonly description: string
  readonly imageSrc: string
  readonly buttonText: string
  readonly advertiser: string
  readonly ecpmFen: number
}

/** Stable failure names for deterministic local-ad diagnostics. */
export type TencentPcMockErrorCode =
  | 'invalid-count'
  | 'placement-not-injected'
  | 'placement-rejected'
  | 'placement-mismatch'
  | 'remote-asset-refused'

/** Error returned by the local Tencent-compatible adapter. */
export class TencentPcMockError extends Error {
  /** Machine-readable local adapter failure. */
  readonly code: TencentPcMockErrorCode

  /**
   * Create one deterministic local adapter error.
   * @param code Stable failure category.
   * @param message User-independent diagnostic text.
   */
  constructor(code: TencentPcMockErrorCode, message: string) {
    super(message)
    this.name = 'TencentPcMockError'
    this.code = code
  }
}

/**
 * In-memory Tencent PC adapter for contract tests and the closed UI pilot.
 * It never loads a script, resolves a remote asset, or sends tracking events.
 */
export class TencentPcLocalMockProvider {
  readonly #responses = new Map<string, TencentPcInjectAdDataResponse>()

  /**
   * Store one Tencent-compatible response under its requested placement.
   * @param placementId Placement later supplied to `loadNativeAdData`.
   * @param response Local response envelope; no field is transmitted.
   */
  injectAdData(placementId: string, response: TencentPcInjectAdDataResponse): void {
    this.#responses.set(placementId, response)
  }

  /**
   * Read pre-injected native-template rows without performing I/O.
   * @param options Placement and optional result count, matching the Tencent PC API names.
   * @returns UI-safe local creative fields in response order.
   * @throws {TencentPcMockError} When the placement, count, response, or asset reference is unusable.
   */
  loadNativeAdData(
    options: TencentPcLoadNativeAdOptions,
  ): Promise<readonly TencentPcNativeTemplateCreative[]> {
    return Promise.resolve().then(() => {
      const count = options.count ?? 1
      if (!Number.isSafeInteger(count) || count < 1 || count > 10) {
        throw new TencentPcMockError('invalid-count', 'local Tencent mock count must be between 1 and 10')
      }
      const response = this.#responses.get(options.placementId)
      if (response === undefined) {
        throw new TencentPcMockError(
          'placement-not-injected',
          `local Tencent mock placement ${JSON.stringify(options.placementId)} was not injected`,
        )
      }
      const result = response.data[options.placementId]
      if (result === undefined || result.ret !== 0) {
        throw new TencentPcMockError(
          'placement-rejected',
          `local Tencent mock placement ${JSON.stringify(options.placementId)} was rejected`,
        )
      }
      return result.list.slice(0, count).map((item) => {
        if (item.placement_id !== options.placementId) {
          throw new TencentPcMockError(
            'placement-mismatch',
            `local Tencent mock response named placement ${JSON.stringify(item.placement_id)}`,
          )
        }
        if (!item.img.startsWith('data:') && !LOCAL_PACKAGED_ASSET_REFS.has(item.img)) {
          throw new TencentPcMockError(
            'remote-asset-refused',
            'local Tencent mock accepts only packaged data URL assets',
          )
        }
        return {
          traceId: item.traceid,
          advertisementId: item.advertisement_id,
          placementId: item.placement_id,
          title: item.title,
          description: item.desc,
          imageSrc: item.img,
          buttonText: item.button_txt,
          advertiser: item.advertiser,
          ecpmFen: item.ecpm,
        }
      })
    })
  }
}

/** Fixed response used by the local closed pilot; it represents no advertiser or settlement. */
export const TENCENT_PC_NATIVE_TEMPLATE_FIXTURE: TencentPcInjectAdDataResponse = {
  data: {
    [TENCENT_GDT_NATIVE_MOCK_PLACEMENT_ID]: {
      ret: 0,
      list: [{
        traceid: 'local-tencent-contract-trace-1',
        advertisement_id: TENCENT_GDT_NATIVE_MOCK_ASSET_ID,
        placement_id: TENCENT_GDT_NATIVE_MOCK_PLACEMENT_ID,
        title: '疯狂星期四 · 概念广告',
        desc: '原创生成的本地概念素材，仅用于验证广告换 Token 产品流程。',
        img: tencentNativeTemplateImage,
        button_txt: '继续任务',
        advertiser: 'KFC 概念演示（非官方、非真实合作）',
        // Illustrative Tencent-compatible metadata only; Host quote events own reward pricing.
        ecpm: 2_000,
      }],
    },
  },
}

/** Pre-injected provider used by the browser card. */
export const TENCENT_PC_LOCAL_MOCK = new TencentPcLocalMockProvider()
TENCENT_PC_LOCAL_MOCK.injectAdData(
  TENCENT_GDT_NATIVE_MOCK_PLACEMENT_ID,
  TENCENT_PC_NATIVE_TEMPLATE_FIXTURE,
)
