import liff from '@line/liff'

export type LineIdentity = {
  lineUserId?: string
  lineIdToken?: string
  lineDisplayName?: string
  linePictureUrl?: string
}

class LiffLoginRedirectError extends Error {
  constructor() {
    super('Redirecting to LINE login')
    this.name = 'LiffLoginRedirectError'
  }
}

let initPromise: Promise<void> | null = null

const getLiffId = () => import.meta.env.VITE_LIFF_ID?.trim()
const getProfileLiffId = () =>
  import.meta.env.VITE_PROFILE_LIFF_ID?.trim() || '2010003223-KfDmnya6'
const getLiffUrl = (liffId: string) => `https://liff.line.me/${liffId}`
const getCleanRedirectUri = () =>
  `${window.location.origin}${window.location.pathname}`
const tokenExpiryLeewaySeconds = 60

const decodeJwtPayload = (token: string) => {
  const payload = token.split('.')[1]
  if (!payload) {
    return null
  }

  try {
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/')
    const paddedPayload = normalizedPayload.padEnd(
      normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
      '=',
    )
    return JSON.parse(window.atob(paddedPayload)) as { exp?: number }
  } catch {
    return null
  }
}

const isExpiredIdToken = (token?: string | null) => {
  if (!token) {
    return false
  }

  const payload = decodeJwtPayload(token)
  if (!payload?.exp) {
    return false
  }

  return payload.exp <= Math.floor(Date.now() / 1000) + tokenExpiryLeewaySeconds
}

const initLiff = async () => {
  const liffId = getLiffId()
  if (!liffId) {
    return false
  }

  if (!initPromise) {
    initPromise = liff.init({ liffId, withLoginOnExternalBrowser: true }).catch((error) => {
      initPromise = null
      throw error
    })
  }

  await initPromise
  return true
}

export const refreshLineLogin = async () => {
  const liffId = getLiffId()
  const isReady = await initLiff()
  if (!isReady || !liffId) {
    return
  }

  if (liff.isLoggedIn()) {
    liff.logout()
  }

  if (liff.isInClient()) {
    liff.login({ redirectUri: getCleanRedirectUri() })
  } else {
    window.location.replace(getLiffUrl(liffId))
  }

  throw new LiffLoginRedirectError()
}

export const openProfileLiff = () => {
  window.location.replace(getLiffUrl(getProfileLiffId()))
}

export const closeLiffWindow = async () => {
  const isReady = await initLiff()

  if (!isReady || !liff.isInClient()) {
    return false
  }

  liff.closeWindow()
  return true
}

export const closeLiffWindowOrOpenProfile = async () => {
  if (await closeLiffWindow()) {
    return
  }

  openProfileLiff()
}

export const getLineIdentity = async (): Promise<LineIdentity> => {
  const liffId = getLiffId()
  const isReady = await initLiff()
  if (!isReady || !liffId) {
    return {}
  }

  if (!liff.isLoggedIn()) {
    if (liff.isInClient()) {
      liff.login({ redirectUri: getCleanRedirectUri() })
      throw new LiffLoginRedirectError()
    } else {
      window.location.replace(getLiffUrl(liffId))
      throw new LiffLoginRedirectError()
    }
  }

  const [profile, lineIdToken] = await Promise.all([
    liff.getProfile(),
    Promise.resolve(liff.getIDToken()),
  ])

  if (isExpiredIdToken(lineIdToken)) {
    await refreshLineLogin()
  }

  return {
    lineUserId: profile.userId,
    lineIdToken: lineIdToken ?? undefined,
    lineDisplayName: profile.displayName,
    linePictureUrl: profile.pictureUrl,
  }
}

export const isLiffLoginRedirectError = (error: unknown) =>
  error instanceof LiffLoginRedirectError
