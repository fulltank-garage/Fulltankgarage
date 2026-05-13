import axios from 'axios'
import type { ChangeEvent, FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getLineIdentity,
  isLiffLoginRedirectError,
  openProfileLiff,
} from './lib/liff'
import fulltankGarageLogo from './assets/fulltank-garage-logo.jpg'
import {
  getRegisteredMember,
  type RegisteredMember,
} from './services/authService'
import {
  checkSerialNumber,
  registerWarranty,
  type WarrantyRegisterPayload,
} from './services/warrantyService'
import type { LineIdentity } from './lib/liff'

type Phase = 'serial' | 'form' | 'success' | 'status'
type NoticeTone = 'info' | 'success' | 'error'
type StatusTone = 'approved' | 'pending' | 'rejected'

type RegistrationForm = Omit<
  WarrantyRegisterPayload,
  'lineDisplayName' | 'lineIdToken' | 'linePictureUrl' | 'lineUserId'
>

const initialForm: RegistrationForm = {
  serialNumber: '',
  customerName: '',
  phone: '',
  carModel: '',
  licensePlate: '',
  filmBrand: '',
  filmModel: '',
  installDate: '',
  branch: '',
  installerName: '',
  receiptFile: null,
  remarks: '',
}

const onlyDigits = (value: string) => value.replace(/\D/g, '')

const getInputClass = (hasError?: boolean) =>
  [
    'h-12 w-full rounded-xl border bg-[#101010] px-4 text-base text-white outline-none transition',
    'placeholder:text-white/38 focus:border-[#ff3a35] focus:ring-4 focus:ring-[#ff3a35]/16',
    hasError ? 'border-[#ff3a35]' : 'border-white/14',
  ].join(' ')

const getApiErrorMessage = (error: unknown) => {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return (
      error.response?.data?.message ||
      'ระบบยังไม่สามารถทำรายการได้ กรุณาลองใหม่อีกครั้ง'
    )
  }

  return error instanceof Error
    ? error.message
    : 'ระบบยังไม่สามารถทำรายการได้ กรุณาลองใหม่อีกครั้ง'
}

function App() {
  const [phase, setPhase] = useState<Phase>('serial')
  const [serialInput, setSerialInput] = useState('')
  const [isConsentAccepted, setIsConsentAccepted] = useState(false)
  const [form, setForm] = useState<RegistrationForm>(initialForm)
  const [registeredMember, setRegisteredMember] =
    useState<RegisteredMember | null>(null)
  const [lineIdentity, setLineIdentity] = useState<LineIdentity | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const [noticeTone, setNoticeTone] = useState<NoticeTone>('info')
  const [isCheckingMember, setIsCheckingMember] = useState(true)
  const [isCheckingSerial, setIsCheckingSerial] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const normalizedSerial = useMemo(
    () => serialInput.trim().toUpperCase(),
    [serialInput],
  )

  const showNotice = (message: string, tone: NoticeTone = 'info') => {
    setNotice(message)
    setNoticeTone(tone)
  }

  const loadRegistrationStatus = useCallback(async () => {
    try {
      setIsCheckingMember(true)
      const identity = await getLineIdentity()
      setLineIdentity(identity)

      if (!identity.lineUserId && !identity.lineIdToken) {
        return
      }

      const member = await getRegisteredMember(identity)
      if (member.id) {
        setRegisteredMember(member)
        setPhase('status')
        setNotice('')
      }
    } catch (error) {
      if (isLiffLoginRedirectError(error)) {
        return
      }
    } finally {
      setIsCheckingMember(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(loadRegistrationStatus)
  }, [loadRegistrationStatus])

  const handleSerialSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrors({})

    if (!normalizedSerial) {
      showNotice('กรุณากรอก Serial Number', 'error')
      return
    }

    if (!isConsentAccepted) {
      showNotice('กรุณายืนยันการเก็บข้อมูลเพื่อรับประกันสินค้า', 'error')
      return
    }

    try {
      setIsCheckingSerial(true)
      setNotice('')
      const result = await checkSerialNumber(normalizedSerial)

      if (result.status !== 'available') {
        showNotice(
          result.status === 'used'
            ? 'Serial Number นี้ถูกลงทะเบียนรับประกันแล้ว'
            : 'ไม่พบ Serial Number นี้ กรุณาตรวจสอบหมายเลขอีกครั้ง',
          'error',
        )
        return
      }

      setForm((current) => ({ ...current, serialNumber: normalizedSerial }))
      setPhase('form')
      showNotice('ตรวจสอบหมายเลขสำเร็จ กรุณากรอกข้อมูลลูกค้า', 'success')
    } catch (error) {
      showNotice(getApiErrorMessage(error), 'error')
    } finally {
      setIsCheckingSerial(false)
    }
  }

  const handleFormChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const target = event.currentTarget
    const field = target.name as keyof RegistrationForm

    if (target instanceof HTMLInputElement && target.type === 'file') {
      setForm((current) => ({
        ...current,
        receiptFile: target.files?.[0] ?? null,
      }))
      setErrors((current) => ({ ...current, receiptFile: '' }))
      return
    }

    const value =
      field === 'phone' ? onlyDigits(target.value) : target.value

    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: '' }))
    setNotice('')
  }

  const validateRegistration = () => {
    const nextErrors: Record<string, string> = {}

    if (!form.customerName.trim()) {
      nextErrors.customerName = 'กรุณากรอกชื่อลูกค้า'
    }
    if (!/^\d{9,10}$/.test(form.phone.trim())) {
      nextErrors.phone = 'กรุณากรอกเบอร์โทร 9-10 หลัก'
    }
    if (!form.carModel.trim()) {
      nextErrors.carModel = 'กรุณากรอกรุ่นรถ'
    }
    if (!form.licensePlate.trim()) {
      nextErrors.licensePlate = 'กรุณากรอกทะเบียนรถ'
    }
    if (!form.filmBrand.trim()) {
      nextErrors.filmBrand = 'กรุณากรอกแบรนด์ฟิล์ม'
    }
    if (!form.filmModel.trim()) {
      nextErrors.filmModel = 'กรุณากรอกรุ่นฟิล์ม'
    }
    if (!form.installDate.trim()) {
      nextErrors.installDate = 'กรุณาเลือกวันที่ติดตั้ง'
    }
    if (!form.branch.trim()) {
      nextErrors.branch = 'กรุณากรอกสาขาที่ติดตั้ง'
    }

    return nextErrors
  }

  const handleRegisterSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validateRegistration()
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      showNotice('กรุณาตรวจสอบข้อมูลที่จำเป็นให้ครบถ้วน', 'error')
      return
    }

    try {
      setIsSubmitting(true)
      setNotice('')
      const lineIdentity = await getLineIdentity()
      await registerWarranty({
        ...form,
        phone: onlyDigits(form.phone),
        ...lineIdentity,
      })
      setPhase('success')
      showNotice('ลงทะเบียนรับประกันสินค้าเรียบร้อยแล้ว', 'success')
    } catch (error) {
      if (isLiffLoginRedirectError(error)) {
        return
      }

      showNotice(getApiErrorMessage(error), 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-dvh bg-[#070707] px-4 py-5 text-white">
      <div className="mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-xl flex-col gap-5">
        {isCheckingMember ? (
          <RegistrationStatusSkeleton />
        ) : phase === 'status' && registeredMember ? (
          <RegistrationStatusPage
            lineIdentity={lineIdentity}
            member={registeredMember}
            onRefresh={loadRegistrationStatus}
          />
        ) : phase === 'serial' ? (
          <SerialGate
            isChecking={isCheckingSerial}
            isConsentAccepted={isConsentAccepted}
            onConsentChange={setIsConsentAccepted}
            onSerialChange={setSerialInput}
            onSubmit={handleSerialSubmit}
            serialNumber={serialInput}
          />
        ) : phase === 'form' ? (
          <WarrantyForm
            errors={errors}
            form={form}
            isSubmitting={isSubmitting}
            onBack={() => {
              setPhase('serial')
              setNotice('')
            }}
            onChange={handleFormChange}
            onSubmit={handleRegisterSubmit}
          />
        ) : (
          <SuccessCard
            serialNumber={form.serialNumber}
            onRestart={() => {
              setPhase('serial')
              setSerialInput('')
              setForm(initialForm)
              setIsConsentAccepted(false)
              setNotice('')
            }}
          />
        )}

        {notice ? <Notice message={notice} tone={noticeTone} /> : null}
        <CompanyFooter />
      </div>
    </main>
  )
}

const getStatusTone = (status?: string): StatusTone => {
  if (status === 'approved') {
    return 'approved'
  }
  if (status === 'rejected') {
    return 'rejected'
  }

  return 'pending'
}

const getStatusMeta = (status?: string) => {
  const tone = getStatusTone(status)

  if (tone === 'approved') {
    return {
      label: 'ลงทะเบียนแล้ว',
      title: 'ข้อมูลของคุณได้รับการอนุมัติแล้ว',
      description: 'สามารถใช้งานเมนูสมาชิกและตรวจสอบสิทธิ์จาก Rich menu ได้ทันที',
      badgeClassName: 'bg-emerald-100 text-emerald-700',
      panelClassName: 'border-emerald-200 bg-emerald-50',
    }
  }

  if (tone === 'rejected') {
    return {
      label: 'ต้องแก้ไขข้อมูล',
      title: 'ข้อมูลยังไม่ผ่านการตรวจสอบ',
      description: 'กรุณาติดต่อร้านผ่าน LINE เพื่อสอบถามรายละเอียดและแก้ไขข้อมูล',
      badgeClassName: 'bg-[#fff1eb] text-[#b4543b]',
      panelClassName: 'border-[#f0c8bb] bg-[#fff1eb]',
    }
  }

  return {
    label: 'รอตรวจสอบ',
    title: 'ร้านได้รับข้อมูลการลงทะเบียนแล้ว',
    description: 'กรุณารอตรวจสอบข้อมูล ระบบจะอัปเดตสถานะให้อัตโนมัติหลังร้านตรวจเสร็จ',
    badgeClassName: 'bg-[#f7e9d8] text-[#765236]',
    panelClassName: 'border-[#ead8c4] bg-[#fffaf3]',
  }
}

const getDisplayValue = (value?: string) => value?.trim() || '-'

function RegistrationStatusSkeleton() {
  return (
    <section className="min-h-[calc(100dvh-2.5rem)] rounded-[1.5rem] bg-[#fbf7f0] p-4 text-[#4b3527]">
      <div className="flex items-center gap-3 border-b border-[#ead8c4] pb-4">
        <div className="size-12 animate-pulse rounded-full bg-[#f1dfcd]" />
        <div className="min-w-0 flex-1">
          <div className="h-4 w-28 animate-pulse rounded-full bg-[#f1dfcd]" />
          <div className="mt-2 h-5 w-36 animate-pulse rounded-full bg-[#f1dfcd]" />
        </div>
      </div>
      <div className="mt-5 space-y-3">
        <div className="h-24 animate-pulse rounded-2xl bg-[#fffaf3]" />
        <div className="h-16 animate-pulse rounded-2xl bg-[#fffaf3]" />
        <div className="h-16 animate-pulse rounded-2xl bg-[#fffaf3]" />
      </div>
    </section>
  )
}

function RegistrationStatusPage({
  lineIdentity,
  member,
  onRefresh,
}: {
  lineIdentity: LineIdentity | null
  member: RegisteredMember
  onRefresh: () => Promise<void>
}) {
  const statusMeta = getStatusMeta(member.status)
  const fullName = [member.firstName, member.lastName]
    .filter(Boolean)
    .join(' ')
  const displayName =
    fullName || lineIdentity?.lineDisplayName || member.nickname || 'FullTank Member'
  const avatarUrl = lineIdentity?.linePictureUrl
  const storefrontImage = member.storefrontImageUrl || member.storefrontImage
  const fields = [
    { label: 'ชื่อ', value: member.firstName },
    { label: 'นามสกุล', value: member.lastName },
    { label: 'ชื่อเล่น', value: member.nickname },
    { label: 'เบอร์โทร', value: member.phone },
    { label: 'ลิงก์ร้าน/เพจ', value: member.shopPageUrl, href: member.shopPageUrl },
  ]

  return (
    <section className="min-h-[calc(100dvh-2.5rem)] overflow-hidden rounded-[1.5rem] bg-[#fbf7f0] text-[#4b3527] shadow-[0_18px_46px_rgba(0,0,0,0.18)]">
      <header className="sticky top-0 z-10 border-b border-[#ead8c4] bg-[#fffaf3]/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+14px)] backdrop-blur">
        <div className="flex items-center gap-3">
          <img
            alt=""
            className="size-11 shrink-0 rounded-full border border-[#ead8c4] object-cover shadow-sm"
            src={avatarUrl || fulltankGarageLogo}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[#8a705b]">
              FullTank Garage
            </p>
            <h1 className="truncate text-lg font-semibold text-[#4b3527]">
              สถานะการลงทะเบียน
            </h1>
          </div>
        </div>
      </header>

      <div className="space-y-4 px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <div className="rounded-2xl border border-[#ead8c4] bg-[#fffaf3] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xl font-bold text-[#4b3527]">
                {displayName}
              </p>
              <p className="mt-1 text-sm leading-6 text-[#8a705b]">
                เปิดจาก LINE Rich menu แล้วพบข้อมูลเดิมของคุณ
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${statusMeta.badgeClassName}`}
            >
              {statusMeta.label}
            </span>
          </div>
        </div>

        <div className={`rounded-2xl border px-4 py-5 text-center ${statusMeta.panelClassName}`}>
          <p className="text-base font-semibold text-[#4b3527]">
            {statusMeta.title}
          </p>
          <p className="mt-2 text-sm leading-6 text-[#8a705b]">
            {statusMeta.description}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {fields.slice(0, 2).map((field) => (
            <StatusField key={field.label} label={field.label} value={field.value} />
          ))}
        </div>

        {fields.slice(2).map((field) => (
          <StatusField
            href={field.href}
            key={field.label}
            label={field.label}
            value={field.value}
          />
        ))}

        <div className="block text-sm font-medium text-[#4b3527]">
          รูปหน้าร้าน
          <div className="mt-1.5 rounded-2xl border border-[#ead8c4] bg-[#fffaf3] p-3">
            {storefrontImage ? (
              <img
                alt="รูปหน้าร้าน"
                className="aspect-[4/3] w-full rounded-xl object-cover"
                src={storefrontImage}
              />
            ) : (
              <div className="grid aspect-[4/3] w-full place-items-center rounded-xl bg-[#f7e9d8] px-5 text-center text-sm leading-6 text-[#8a705b]">
                ยังไม่มีรูปหน้าร้าน
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            className="h-12 rounded-xl border border-[#ead8c4] bg-[#fffaf3] text-sm font-bold text-[#765236]"
            onClick={() => void onRefresh()}
            type="button"
          >
            อัปเดตสถานะ
          </button>
          <button
            className="h-12 rounded-xl bg-[#765236] text-sm font-bold text-white"
            onClick={openProfileLiff}
            type="button"
          >
            เปิดหน้าโปรไฟล์
          </button>
        </div>
      </div>
    </section>
  )
}

function StatusField({
  href,
  label,
  value,
}: {
  href?: string
  label: string
  value?: string
}) {
  return (
    <div className="block text-sm font-medium text-[#4b3527]">
      {label}
      <div className="mt-1.5 flex min-h-12 w-full items-center rounded-xl border border-[#ead8c4] bg-[#fffaf3] px-4 text-base text-[#4b3527]">
        {href && value ? (
          <a
            className="break-all text-[#765236] underline decoration-[#9a704d]/35 underline-offset-4"
            href={href}
            rel="noreferrer"
            target="_blank"
          >
            {value}
          </a>
        ) : (
          <span className="break-words">{getDisplayValue(value)}</span>
        )}
      </div>
    </div>
  )
}

function SerialGate({
  isChecking,
  isConsentAccepted,
  onConsentChange,
  onSerialChange,
  onSubmit,
  serialNumber,
}: {
  isChecking: boolean
  isConsentAccepted: boolean
  onConsentChange: (checked: boolean) => void
  onSerialChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  serialNumber: string
}) {
  return (
    <section className="rounded-[1.75rem] border border-[#2d2d2d] bg-[#181818] p-5 shadow-[0_0_36px_rgba(255,24,20,0.22)]">
      <form className="space-y-5" onSubmit={onSubmit}>
        <img
          alt="FullTank Garage"
          className="mx-auto h-auto w-64 max-w-[82%] rounded-xl object-cover shadow-[0_16px_42px_rgba(0,0,0,0.42)]"
          src={fulltankGarageLogo}
        />
        <h1 className="text-center text-3xl font-black leading-tight text-[#ff3838] sm:text-4xl">
          ลงทะเบียนรับประกันสินค้า
        </h1>

        <input
          autoComplete="off"
          className="h-14 w-full rounded-xl border border-white/14 bg-[#0e0e0e] px-4 text-lg font-semibold uppercase tracking-wide text-white outline-none transition placeholder:normal-case placeholder:tracking-normal placeholder:text-white/45 focus:border-[#ff3a35] focus:ring-4 focus:ring-[#ff3a35]/16"
          onChange={(event) => onSerialChange(event.target.value)}
          placeholder="กรอก Serial Number"
          value={serialNumber}
        />

        <label className="flex items-center gap-2.5 text-[clamp(0.78rem,3.45vw,1rem)] font-semibold leading-6 text-white">
          <input
            checked={isConsentAccepted}
            className="size-5 shrink-0 rounded border-white/35 accent-[#ff2f2b]"
            onChange={(event) => onConsentChange(event.target.checked)}
            type="checkbox"
          />
          <span className="whitespace-nowrap">
            ข้าพเจ้ายินยอมให้เก็บข้อมูลเพื่อการรับประกันสินค้า
          </span>
        </label>

        <button
          className="h-14 w-full rounded-xl bg-gradient-to-r from-[#ff3b3b] to-[#d91605] text-lg font-black text-white shadow-[0_16px_32px_rgba(232,26,13,0.22)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-65"
          disabled={isChecking}
          type="submit"
        >
          {isChecking ? 'กำลังตรวจสอบ...' : 'ตรวจสอบหมายเลข'}
        </button>
      </form>
    </section>
  )
}

function WarrantyForm({
  errors,
  form,
  isSubmitting,
  onBack,
  onChange,
  onSubmit,
}: {
  errors: Record<string, string>
  form: RegistrationForm
  isSubmitting: boolean
  onBack: () => void
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <section className="rounded-[1.5rem] border border-white/12 bg-[#151515] p-4 shadow-[0_0_34px_rgba(255,30,26,0.18)]">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ff4a45]">
            Serial {form.serialNumber}
          </p>
          <h1 className="mt-1 text-2xl font-black text-white">
            ข้อมูลลงทะเบียนลูกค้า
          </h1>
        </div>
        <button
          className="rounded-xl border border-white/14 px-3 py-2 text-sm font-bold text-white/80"
          onClick={onBack}
          type="button"
        >
          ย้อนกลับ
        </button>
      </div>

      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <Field
          error={errors.customerName}
          label="ชื่อลูกค้า"
          name="customerName"
          onChange={onChange}
          placeholder="ชื่อ-นามสกุล"
          value={form.customerName}
        />
        <Field
          error={errors.phone}
          inputMode="tel"
          label="เบอร์โทร"
          maxLength={10}
          name="phone"
          onChange={onChange}
          placeholder="0814452949"
          value={form.phone}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            error={errors.carModel}
            label="รุ่นรถ"
            name="carModel"
            onChange={onChange}
            placeholder="Toyota Camry"
            value={form.carModel}
          />
          <Field
            error={errors.licensePlate}
            label="ทะเบียนรถ"
            name="licensePlate"
            onChange={onChange}
            placeholder="1กก 1234"
            value={form.licensePlate}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            error={errors.filmBrand}
            label="แบรนด์ฟิล์ม"
            name="filmBrand"
            onChange={onChange}
            placeholder="FullTank"
            value={form.filmBrand}
          />
          <Field
            error={errors.filmModel}
            label="รุ่นฟิล์ม"
            name="filmModel"
            onChange={onChange}
            placeholder="Ceramic Black"
            value={form.filmModel}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            error={errors.installDate}
            label="วันที่ติดตั้ง"
            name="installDate"
            onChange={onChange}
            type="date"
            value={form.installDate}
          />
          <Field
            error={errors.branch}
            label="สาขา"
            name="branch"
            onChange={onChange}
            placeholder="บางแค"
            value={form.branch}
          />
        </div>

        <Field
          error={errors.installerName}
          label="ชื่อช่างติดตั้ง"
          name="installerName"
          onChange={onChange}
          placeholder="ชื่อช่าง"
          value={form.installerName}
        />

        <label className="block text-sm font-bold text-white/86">
          รูปใบเสร็จ/หลักฐาน
          <input
            accept="image/*,.pdf"
            className="mt-2 block w-full rounded-xl border border-white/14 bg-[#101010] px-3 py-3 text-sm text-white file:mr-3 file:rounded-lg file:border-0 file:bg-[#ff332f] file:px-3 file:py-2 file:text-sm file:font-bold file:text-white"
            name="receiptFile"
            onChange={onChange}
            type="file"
          />
        </label>

        <label className="block text-sm font-bold text-white/86">
          หมายเหตุ
          <textarea
            className="mt-2 min-h-24 w-full rounded-xl border border-white/14 bg-[#101010] px-4 py-3 text-base text-white outline-none placeholder:text-white/38 focus:border-[#ff3a35] focus:ring-4 focus:ring-[#ff3a35]/16"
            name="remarks"
            onChange={onChange}
            placeholder="ข้อมูลเพิ่มเติม"
            value={form.remarks}
          />
        </label>

        <button
          className="h-14 w-full rounded-xl bg-gradient-to-r from-[#ff3b3b] to-[#d91605] text-lg font-black text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-65"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? 'กำลังบันทึก...' : 'ลงทะเบียนรับประกัน'}
        </button>
      </form>
    </section>
  )
}

function Field({
  error,
  label,
  name,
  onChange,
  placeholder,
  value,
  type = 'text',
  inputMode,
  maxLength,
}: {
  error?: string
  label: string
  name: keyof RegistrationForm
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  value?: string
  type?: string
  inputMode?: 'tel' | 'numeric'
  maxLength?: number
}) {
  return (
    <label className="block text-sm font-bold text-white/86">
      {label}
      <input
        aria-invalid={Boolean(error)}
        className={getInputClass(Boolean(error))}
        inputMode={inputMode}
        maxLength={maxLength}
        name={name}
        onChange={onChange}
        placeholder={placeholder}
        type={type}
        value={value}
      />
      {error ? <span className="mt-1 block text-xs text-[#ff625f]">{error}</span> : null}
    </label>
  )
}

function SuccessCard({
  onRestart,
  serialNumber,
}: {
  onRestart: () => void
  serialNumber: string
}) {
  return (
    <section className="rounded-[1.5rem] border border-white/12 bg-[#151515] p-6 text-center shadow-[0_0_34px_rgba(255,30,26,0.18)]">
      <div className="mx-auto grid size-20 place-items-center rounded-full bg-[#ff332f] text-4xl font-black">
        ✓
      </div>
      <h1 className="mt-5 text-3xl font-black text-white">
        ลงทะเบียนเรียบร้อย
      </h1>
      <p className="mt-3 text-base leading-7 text-white/66">
        ระบบบันทึกการรับประกันของ Serial Number {serialNumber} แล้ว
      </p>
      <button
        className="mt-6 h-12 w-full rounded-xl border border-white/14 bg-white/8 text-base font-bold text-white"
        onClick={onRestart}
        type="button"
      >
        ลงทะเบียนหมายเลขอื่น
      </button>
    </section>
  )
}

function Notice({ message, tone }: { message: string; tone: NoticeTone }) {
  return (
    <div
      className={[
        'rounded-xl border px-4 py-3 text-sm font-bold leading-6',
        tone === 'success'
          ? 'border-emerald-400/30 bg-emerald-500/12 text-emerald-100'
          : tone === 'error'
            ? 'border-[#ff3a35]/35 bg-[#ff3a35]/14 text-[#ffd7d5]'
            : 'border-white/14 bg-white/8 text-white/78',
      ].join(' ')}
      role="status"
    >
      {message}
    </div>
  )
}

function CompanyFooter() {
  return (
    <footer className="mt-auto rounded-[1.25rem] border border-white/12 bg-[#101010] px-4 py-6 text-center text-white/74">
      <img
        alt="FullTank Garage"
        className="mx-auto mb-4 h-auto w-36 rounded-lg object-cover"
        src={fulltankGarageLogo}
      />
      <p className="text-lg font-black text-white">FullTank Garage Co., LTD</p>
      <p className="mt-3 text-base font-semibold leading-7">
        1464/1 ซอยกาญจนาภิเษก 008 แขวงบางแค เขตบางแค กรุงเทพฯ 10160
      </p>
      <p className="text-base font-semibold leading-7">
        โทรศัพท์: <a className="text-[#8fd1ff]" href="tel:0814452949">081 445 2949</a>
      </p>
      <p className="text-base font-semibold leading-7">
        เวลาเปิดทำการ: เปิดทุกวัน (หยุดวันพฤหัสบดี) เวลา 10:00 - 20:00 น.
      </p>
    </footer>
  )
}

export default App
