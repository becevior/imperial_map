import posthog from 'posthog-js'

type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined
>

const posthogProjectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
const posthogHost =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? '/ingest'

let initialized = false

export function initPostHog() {
  if (initialized || typeof window === 'undefined') {
    return
  }

  if (!posthogProjectToken) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        'PostHog analytics disabled: NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is not configured.'
      )
    }

    return
  }

  posthog.init(posthogProjectToken, {
    api_host: posthogHost,
    ui_host: 'https://us.posthog.com',
    defaults: '2026-05-30',
    capture_exceptions: true,
    debug: process.env.NODE_ENV === 'development',
    loaded: () => {
      initialized = true
    },
  })

  if (process.env.NODE_ENV === 'development') {
    ;(window as Window & { __imperialPostHog?: typeof posthog }).__imperialPostHog =
      posthog
  }
}

export function registerEventProperties(properties: AnalyticsProperties) {
  if (
    typeof window === 'undefined' ||
    !posthogProjectToken
  ) {
    return
  }

  initPostHog()
  posthog.register(properties)
}

export function trackEvent(
  eventName: string,
  properties: AnalyticsProperties = {}
) {
  if (
    typeof window === 'undefined' ||
    !posthogProjectToken
  ) {
    return
  }

  initPostHog()
  posthog.capture(eventName, {
    ...properties,
    source: properties.source ?? 'imperial-map'
  })
}
