import { api } from '../lib/api'
import type { LineIdentity } from '../lib/liff'

export type SerialCheckResponse = {
  serialNumber: string
  status: 'available' | 'used' | 'missing'
  message?: string
}

export type WarrantyRegisterPayload = LineIdentity & {
  serialNumber: string
  customerName: string
  phone: string
  carModel: string
  licensePlate: string
  filmBrand: string
  filmModel: string
  installDate: string
  branch: string
  installerName: string
  receiptFile: File | null
  remarks: string
}

export type WarrantyRegistration = {
  id: number
  uuid?: string
  serialNumber: string
  customerName: string
  phone: string
  carModel: string
  licensePlate: string
  filmBrand: string
  filmModel: string
  installDate?: string | null
  branch: string
  installerName?: string
  receiptFile?: string
  remarks?: string
  lineUserId?: string
  lineDisplayName?: string
  linePictureUrl?: string
  createdAt?: string
  updatedAt?: string
}

export type WarrantyRegisterResponse = {
  data: WarrantyRegistration
  richMenuSynced?: boolean
}

const appendOptional = (formData: FormData, key: string, value?: string) => {
  if (value?.trim()) {
    formData.append(key, value.trim())
  }
}

export const checkSerialNumber = async (serialNumber: string) => {
  const { data } = await api.get<SerialCheckResponse>(
    `/serial-numbers/${encodeURIComponent(serialNumber)}`,
  )

  return data
}

export const registerWarranty = async (payload: WarrantyRegisterPayload) => {
  const formData = new FormData()

  formData.append('serialNumber', payload.serialNumber)
  formData.append('customerName', payload.customerName)
  formData.append('phone', payload.phone)
  formData.append('carModel', payload.carModel)
  formData.append('licensePlate', payload.licensePlate)
  formData.append('filmBrand', payload.filmBrand)
  formData.append('filmModel', payload.filmModel)
  formData.append('installDate', payload.installDate)
  formData.append('branch', payload.branch)
  appendOptional(formData, 'installerName', payload.installerName)
  appendOptional(formData, 'remarks', payload.remarks)
  appendOptional(formData, 'lineUserId', payload.lineUserId)
  appendOptional(formData, 'lineIdToken', payload.lineIdToken)
  appendOptional(formData, 'lineDisplayName', payload.lineDisplayName)
  appendOptional(formData, 'linePictureUrl', payload.linePictureUrl)

  if (payload.receiptFile) {
    formData.append('receiptFile', payload.receiptFile)
  }

  const { data } = await api.post<WarrantyRegisterResponse>(
    '/warranty/register',
    formData,
  )
  return data
}

export const linkWarrantyBySerial = async (
  serialNumber: string,
  lineIdentity?: LineIdentity,
) => {
  const lineUserId = lineIdentity?.lineUserId?.trim()
  if (!lineUserId) {
    return null
  }

  const { data } = await api.post<WarrantyRegisterResponse>('/warranty/link', {
    serialNumber,
    lineUserId,
    lineDisplayName: lineIdentity?.lineDisplayName,
    linePictureUrl: lineIdentity?.linePictureUrl,
  })

  return data
}

export const getWarrantyStatus = async (lineIdentity?: LineIdentity) => {
  const lineUserId = lineIdentity?.lineUserId?.trim()
  if (!lineUserId) {
    return null
  }

  const { data } = await api.get<WarrantyRegistration>('/warranty/status', {
    params: { lineUserId },
  })

  return data
}
