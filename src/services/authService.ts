import { api } from '../lib/api'
import { apiRoutes } from '../lib/apiRoutes'
import type { LineIdentity } from '../lib/liff'

export type RegisterPayload = LineIdentity & {
  firstName: string
  lastName: string
  nickname: string
  phone: string
  citizenId: string
  shopPageUrl: string
  storefrontImage: File
}

export type RegisterResponse = {
  message?: string
  id?: string
  data?: unknown
}

export type RegisteredMember = {
  id?: string
  status?: 'pending' | 'approved' | 'rejected' | string
  lineUserId?: string
}

const appendOptional = (formData: FormData, key: string, value?: string) => {
  if (value?.trim()) {
    formData.append(key, value.trim())
  }
}

const getLineHeaders = (lineIdentity?: LineIdentity) => {
  const headers: Record<string, string> = {}

  if (lineIdentity?.lineUserId) {
    headers['X-Line-User-Id'] = lineIdentity.lineUserId
  }
  if (lineIdentity?.lineIdToken) {
    headers['X-Line-ID-Token'] = lineIdentity.lineIdToken
  }
  if (lineIdentity?.lineDisplayName) {
    headers['X-Line-Display-Name'] = lineIdentity.lineDisplayName
  }
  if (lineIdentity?.linePictureUrl) {
    headers['X-Line-Picture-Url'] = lineIdentity.linePictureUrl
  }

  return headers
}

export const getRegisteredMember = async (lineIdentity?: LineIdentity) => {
  const { data } = await api.get<RegisteredMember>(
    apiRoutes.auth.registrationStatus,
    {
      headers: getLineHeaders(lineIdentity),
    },
  )

  return data
}

export const registerUser = async (payload: RegisterPayload) => {
  const formData = new FormData()

  formData.append('firstName', payload.firstName)
  formData.append('lastName', payload.lastName)
  formData.append('nickname', payload.nickname)
  formData.append('phone', payload.phone)
  formData.append('citizenId', payload.citizenId)
  formData.append('shopPageUrl', payload.shopPageUrl)
  formData.append('storefrontImage', payload.storefrontImage)
  appendOptional(formData, 'lineUserId', payload.lineUserId)
  appendOptional(formData, 'lineIdToken', payload.lineIdToken)
  appendOptional(formData, 'lineDisplayName', payload.lineDisplayName)
  appendOptional(formData, 'linePictureUrl', payload.linePictureUrl)

  const { data } = await api.post<RegisterResponse>(
    apiRoutes.auth.register,
    formData,
  )

  return data
}
