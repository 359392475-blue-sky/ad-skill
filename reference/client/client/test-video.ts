import sponsorDemoMp4 from './assets/sponsor-demo.mp4'
import sponsorDemoWebm from './assets/sponsor-demo.webm'

/** Fixed non-secret identity shared with the local Host demo config. */
export const LOCAL_SPONSOR_VIDEO_ASSET_ID = 'sponsor-demo-motion-v1'

/** Packaged sources only; the sponsorship UI never resolves a network URL. */
export const LOCAL_SPONSOR_VIDEO_SOURCES = [
  { src: sponsorDemoMp4, type: 'video/mp4' },
  { src: sponsorDemoWebm, type: 'video/webm' },
] as const
