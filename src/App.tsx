import axios from 'axios'
import type { ChangeEvent, FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getEntryView,
  getLineIdentity,
  isLiffLoginRedirectError,
  openProfileLiff,
} from './lib/liff'
import fulltankGarageLogo from './assets/fulltank-garage-logo.jpg'
import warrantyCardBackground from './assets/warranty-card-bg.png'
import {
  getRegisteredMember,
  type RegisteredMember,
} from './services/authService'
import {
  checkSerialNumber,
  getWarrantyRegistrations,
  linkWarrantyBySerial,
  registerWarranty,
  type WarrantyRegistration,
  type WarrantyRegisterPayload,
} from './services/warrantyService'
import type { LineIdentity } from './lib/liff'

type Phase = 'serial' | 'form' | 'success' | 'status' | 'warranty-status'
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
const onlyEnglishLettersAndDigits = (value: string) =>
  value.replace(/[^a-zA-Z0-9]/g, '')

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
  const [warrantyRegistration, setWarrantyRegistration] =
    useState<WarrantyRegistration | null>(null)
  const [warrantyRegistrations, setWarrantyRegistrations] = useState<
    WarrantyRegistration[]
  >([])
  const [lineIdentity, setLineIdentity] = useState<LineIdentity | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const [noticeTone, setNoticeTone] = useState<NoticeTone>('info')
  const [isCheckingMember, setIsCheckingMember] = useState(true)
  const [isCheckingSerial, setIsCheckingSerial] = useState(false)
  const [isCheckingWalletSerial, setIsCheckingWalletSerial] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isCardEntry = getEntryView() === 'card'

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

      try {
        const warranties = await getWarrantyRegistrations(identity)
        if (warranties.length > 0) {
          setWarrantyRegistrations(warranties)
          setWarrantyRegistration(warranties[0])
          setPhase('warranty-status')
          setNotice('')
          return
        }
      } catch (error) {
        if (!axios.isAxiosError(error) || error.response?.status !== 404) {
          throw error
        }
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
        if (result.status === 'used') {
          const identity = await getLineIdentity()
          const linked = await linkWarrantyBySerial(normalizedSerial, identity)
          if (linked?.data) {
            const warranties = await getWarrantyRegistrations(identity)
            setLineIdentity(identity)
            setWarrantyRegistration(linked.data)
            setWarrantyRegistrations(warranties.length > 0 ? warranties : [linked.data])
            setPhase('warranty-status')
            showNotice('พบข้อมูลเดิมและผูกบัตรรับประกันกับ LINE นี้แล้ว', 'success')
            return
          }
        }

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

  const handleWalletSerialSubmit = async (serialNumber: string) => {
    const normalizedWalletSerial = onlyEnglishLettersAndDigits(serialNumber)
      .trim()
      .toUpperCase()
    if (!normalizedWalletSerial) {
      showNotice('กรุณากรอก Serial Number', 'error')
      return
    }

    try {
      setIsCheckingWalletSerial(true)
      setNotice('')
      const result = await checkSerialNumber(normalizedWalletSerial)

      if (result.status !== 'available') {
        if (result.status === 'used') {
          const identity = await getLineIdentity()
          const linked = await linkWarrantyBySerial(normalizedWalletSerial, identity)
          if (linked?.data) {
            const warranties = await getWarrantyRegistrations(identity)
            setLineIdentity(identity)
            setWarrantyRegistrations(warranties.length > 0 ? warranties : [linked.data])
            setWarrantyRegistration(linked.data)
            setPhase('warranty-status')
            showNotice('พบบัตรเดิมและอัปเดตรายการให้แล้ว', 'success')
            return
          }
        }

        showNotice(
          result.status === 'used'
            ? 'Serial Number นี้ถูกลงทะเบียนรับประกันแล้ว'
            : 'ไม่พบ Serial Number นี้ กรุณาตรวจสอบหมายเลขอีกครั้ง',
          'error',
        )
        return
      }

      const latestWarranty = warrantyRegistrations[0] ?? warrantyRegistration
      setForm({
        ...initialForm,
        serialNumber: normalizedWalletSerial,
        customerName: latestWarranty?.customerName ?? '',
        phone: latestWarranty?.phone ?? '',
        branch: latestWarranty?.branch ?? '',
      })
      setPhase('form')
      showNotice('ตรวจสอบหมายเลขสำเร็จ กรุณากรอกข้อมูลรถ/ฟิล์ม', 'success')
    } catch (error) {
      if (isLiffLoginRedirectError(error)) {
        return
      }

      showNotice(getApiErrorMessage(error), 'error')
    } finally {
      setIsCheckingWalletSerial(false)
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
      const result = await registerWarranty({
        ...form,
        phone: onlyDigits(form.phone),
        ...lineIdentity,
      })
      setWarrantyRegistration(result.data)
      setWarrantyRegistrations((current) => [
        result.data,
        ...current.filter((item) => item.id !== result.data.id),
      ])
      setPhase('warranty-status')
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
    <main className="min-h-dvh bg-[#070707] p-3 text-white">
      <div className="mx-auto flex min-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col gap-2">
        {isCheckingMember ? (
          isCardEntry ? <WarrantyStatusSkeleton /> : <RegistrationGateSkeleton />
        ) : phase === 'warranty-status' && warrantyRegistration ? (
          <WarrantyStatusPage
            isCheckingSerial={isCheckingWalletSerial}
            key={warrantyRegistration.id}
            lineIdentity={lineIdentity}
            onAddSerial={handleWalletSerialSubmit}
            onRefresh={loadRegistrationStatus}
            registrations={warrantyRegistrations}
            selectedRegistration={warrantyRegistration}
          />
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
        {phase === 'warranty-status' ? null : (
          <CompanyFooter fillAvailable={phase === 'serial'} />
        )}
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

const formatThaiDate = (value?: string | null) => {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function RegistrationGateSkeleton() {
  return (
    <section className="rounded-[1.5rem] border border-[#2d2d2d] bg-[#181818] p-[clamp(1rem,2.2dvh,1.25rem)] shadow-[0_0_30px_rgba(255,24,20,0.2)]">
      <div className="flex w-full flex-col gap-[clamp(0.9rem,1.8dvh,1.15rem)]">
        <div className="mx-auto aspect-square w-[clamp(8.75rem,22dvh,12.5rem)] max-w-[58%] rounded-xl skeleton-shimmer" />
        <div className="space-y-[clamp(0.8rem,1.55dvh,1rem)]">
          <div className="mx-auto h-8 w-4/5 rounded-xl skeleton-shimmer sm:h-9" />
          <div className="h-12 w-full rounded-xl border border-white/14 bg-[#0e0e0e] skeleton-shimmer" />
          <div className="flex items-center gap-2.5">
            <div className="size-5 shrink-0 rounded border border-white/20 skeleton-shimmer" />
            <div className="h-5 min-w-0 flex-1 rounded-xl skeleton-shimmer" />
          </div>
          <div className="h-12 w-full rounded-xl skeleton-shimmer" />
        </div>
      </div>
    </section>
  )
}

function WarrantyStatusSkeleton() {
  return (
    <section className="flex min-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[1.5rem] border border-white/12 bg-[#111] text-white shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0a0a0a]/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+14px)] backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="size-11 shrink-0 rounded-xl border border-white/12 skeleton-shimmer" />
          <div className="min-w-0 flex-1">
            <div className="h-4 w-32 rounded-xl skeleton-shimmer" />
            <div className="mt-2 h-6 w-44 max-w-full rounded-xl skeleton-shimmer" />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <div className="rounded-2xl border border-[#ff3a35]/35 bg-[#151515] p-4 shadow-[0_16px_38px_rgba(255,42,35,0.12)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="h-7 w-44 max-w-full rounded-xl skeleton-shimmer" />
              <div className="mt-3 h-4 w-56 max-w-full rounded-xl skeleton-shimmer" />
            </div>
            <div className="h-6 w-20 shrink-0 rounded-full skeleton-shimmer" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="min-w-0 rounded-xl border border-white/10 bg-[#0d0d0d] px-3 py-3" key={index}>
              <div className="h-3 w-20 rounded-xl skeleton-shimmer" />
              <div className="mt-3 h-5 w-full rounded-xl skeleton-shimmer" />
            </div>
          ))}
        </div>

        <div className="min-w-0 rounded-xl border border-white/10 bg-[#0d0d0d] px-3 py-3">
          <div className="h-3 w-24 rounded-xl skeleton-shimmer" />
          <div className="mt-3 h-5 w-3/4 rounded-xl skeleton-shimmer" />
        </div>
        <div className="min-w-0 rounded-xl border border-white/10 bg-[#0d0d0d] px-3 py-3">
          <div className="h-3 w-24 rounded-xl skeleton-shimmer" />
          <div className="mt-3 h-5 w-2/3 rounded-xl skeleton-shimmer" />
        </div>

        <div className="h-12 w-full rounded-xl skeleton-shimmer" />
      </div>
    </section>
  )
}

function WarrantyStatusPage({
  isCheckingSerial,
  lineIdentity,
  onAddSerial,
  onRefresh,
  registrations,
  selectedRegistration,
}: {
  isCheckingSerial: boolean
  lineIdentity: LineIdentity | null
  onAddSerial: (serialNumber: string) => Promise<void>
  onRefresh: () => Promise<void>
  registrations: WarrantyRegistration[]
  selectedRegistration: WarrantyRegistration
}) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [isAddingSerial, setIsAddingSerial] = useState(false)
  const [walletSerialInput, setWalletSerialInput] = useState('')
  const visibleRegistrations =
    registrations.length > 0 ? registrations : [selectedRegistration]
  const displayNameFallback =
    lineIdentity?.lineDisplayName ||
    'FullTank Customer'
  const warrantyCount = Math.max(visibleRegistrations.length, 1)

  const toggleExpanded = (id: number) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleAddSerial = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onAddSerial(walletSerialInput)
    setWalletSerialInput('')
    setIsAddingSerial(false)
  }

  return (
    <section className="flex min-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[1.5rem] border border-white/12 bg-[#111] text-white shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0a0a0a]/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+14px)] backdrop-blur">
        <div className="flex items-center gap-3">
          <img
            alt=""
            className="size-11 shrink-0 rounded-xl border border-white/12 object-cover"
            src={lineIdentity?.linePictureUrl || fulltankGarageLogo}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#ff4038]">
              FullTank Garage
            </p>
            <h1 className="truncate text-lg font-bold">
              บัตรรับประกันสินค้า
            </h1>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+18px)]">
        {visibleRegistrations.map((registration, index) => (
          <WarrantyVehicleCard
            displayNameFallback={displayNameFallback}
            index={index}
            isExpanded={expandedIds.has(registration.id)}
            key={registration.id}
            onToggle={() => toggleExpanded(registration.id)}
            registration={registration}
            warrantyCount={warrantyCount}
          />
        ))}

        <div className="relative overflow-hidden rounded-2xl border border-dashed border-[#ff4038]/45 bg-[#151515] shadow-[0_16px_38px_rgba(255,42,35,0.12)]">
          <img
            alt=""
            className="absolute inset-0 size-full object-fill opacity-50"
            src={warrantyCardBackground}
          />
          <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(0,0,0,0.82),rgba(0,0,0,0.46)_52%,rgba(0,0,0,0.82))]" />
          <button
            className="relative flex aspect-[667/374] min-h-[12.5rem] w-full flex-col items-center justify-center gap-2 p-5 text-center transition active:scale-[0.99]"
            onClick={() => setIsAddingSerial((current) => !current)}
            type="button"
          >
            <span className="grid size-12 place-items-center rounded-2xl border border-[#ff4038]/45 bg-[#ff4038]/12 text-3xl font-black text-[#ff625d]">
              +
            </span>
            <span className="text-xl font-black text-white">
              เพิ่มบัตรรับประกัน
            </span>
            <span className="text-sm font-bold text-white/54">
              กรอก Serial Number สำหรับรถคันใหม่
            </span>
          </button>

          {isAddingSerial ? (
            <form
              className="relative grid gap-2 border-t border-white/10 bg-black/32 p-4 backdrop-blur-[2px]"
              onSubmit={handleAddSerial}
            >
              <input
                autoComplete="off"
                className="h-11 w-full rounded-xl border border-white/14 bg-[#0e0e0e] px-3 text-base font-bold uppercase tracking-wide text-white outline-none transition placeholder:normal-case placeholder:tracking-normal placeholder:text-white/42 focus:border-[#ff3a35] focus:ring-4 focus:ring-[#ff3a35]/16"
                inputMode="text"
                onChange={(event) =>
                  setWalletSerialInput(
                    onlyEnglishLettersAndDigits(event.target.value),
                  )
                }
                pattern="[A-Za-z0-9]*"
                placeholder="กรอก Serial Number เพิ่ม"
                value={walletSerialInput}
              />
              <button
                className="h-11 rounded-xl bg-gradient-to-r from-[#ff4038] to-[#df160d] text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-65"
                disabled={isCheckingSerial}
                type="submit"
              >
                {isCheckingSerial ? 'กำลังตรวจสอบ...' : 'ตรวจสอบและเพิ่มบัตร'}
              </button>
            </form>
          ) : null}
        </div>

        <button
          className="h-12 w-full rounded-xl bg-gradient-to-r from-[#ff4038] to-[#df160d] text-sm font-bold text-white shadow-[0_14px_30px_rgba(255,58,53,0.24)]"
          onClick={() => void onRefresh()}
          type="button"
        >
          อัปเดตข้อมูลบัตร
        </button>
      </div>
    </section>
  )
}

function WarrantyVehicleCard({
  displayNameFallback,
  index,
  isExpanded,
  onToggle,
  registration,
  warrantyCount,
}: {
  displayNameFallback: string
  index: number
  isExpanded: boolean
  onToggle: () => void
  registration: WarrantyRegistration
  warrantyCount: number
}) {
  const displayName = registration.customerName || displayNameFallback
  const vehicleTitle =
    registration.licensePlate || registration.carModel || `คันที่ ${index + 1}`
  const fields = [
    { label: 'เบอร์โทร', value: registration.phone },
    { label: 'รุ่นรถ', value: registration.carModel },
    { label: 'ทะเบียนรถ', value: registration.licensePlate },
    {
      label: 'ฟิล์ม',
      value: [registration.filmBrand, registration.filmModel]
        .filter(Boolean)
        .join(' '),
    },
    {
      label: 'วันที่ติดตั้ง',
      value: formatThaiDate(registration.installDate),
    },
    { label: 'สาขาที่ติดตั้ง', value: registration.branch },
    { label: 'ผู้ติดตั้ง', value: registration.installerName },
  ]

  return (
    <article className="relative overflow-hidden rounded-2xl border border-[#ff3a35]/35 bg-[#151515] shadow-[0_16px_38px_rgba(255,42,35,0.16)]">
      <img
        alt=""
        className="absolute inset-0 size-full object-fill"
        src={warrantyCardBackground}
      />
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(0,0,0,0.76),rgba(0,0,0,0.2)_52%,rgba(0,0,0,0.72))]" />

      <button
        aria-expanded={isExpanded}
        className="relative flex aspect-[667/374] min-h-[12.5rem] w-full flex-col justify-between p-4 text-left transition active:scale-[0.99]"
        onClick={onToggle}
        type="button"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-white/58">
              FullTank Garage
            </p>
            <h2 className="mt-1 truncate text-xl font-black leading-tight text-white">
              บัตรรับประกันสินค้า
            </h2>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-400/18 px-3 py-1 text-xs font-black text-emerald-200">
            ใช้งานได้
          </span>
        </div>

        <div className="min-w-0 space-y-3">
          <div>
            <p className="truncate text-xl font-black text-white">
              {displayName}
            </p>
            <p className="mt-1 truncate text-sm font-bold text-white/62">
              {vehicleTitle}
            </p>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-white/45">
                Serial Number
              </p>
              <p className="truncate text-base font-black tracking-wide text-white">
                {registration.serialNumber}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <p className="rounded-full border border-white/16 bg-black/24 px-3 py-1 text-xs font-black text-white/78">
                {warrantyCount} ใบ
              </p>
              <span className="grid size-7 place-items-center rounded-full border border-white/16 bg-black/24 text-sm font-black text-white/78">
                {isExpanded ? '−' : '+'}
              </span>
            </div>
          </div>
        </div>
      </button>

      <div
        className={[
          'relative grid transition-[grid-template-rows] duration-300 ease-out',
          isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        ].join(' ')}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="grid grid-cols-2 gap-2 border-t border-white/10 bg-black/28 p-4 backdrop-blur-[2px]">
            {fields.map((field) => (
              <WarrantyCardField
                key={field.label}
                label={field.label}
                value={field.value}
              />
            ))}

            {registration.remarks ? (
              <div className="col-span-2">
                <WarrantyCardField
                  label="หมายเหตุ"
                  value={registration.remarks}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}

function WarrantyCardField({
  label,
  value,
}: {
  label: string
  value?: string
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/24 px-3 py-2 backdrop-blur-[2px]">
      <p className="truncate text-[0.66rem] font-black text-white/42">{label}</p>
      <p className="mt-1 break-words text-sm font-black leading-5 text-white">
        {getDisplayValue(value)}
      </p>
    </div>
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
    <section className="rounded-[1.5rem] border border-[#2d2d2d] bg-[#181818] p-[clamp(1rem,2.2dvh,1.25rem)] shadow-[0_0_30px_rgba(255,24,20,0.2)]">
      <form
        className="flex w-full flex-col gap-[clamp(0.9rem,1.8dvh,1.15rem)]"
        onSubmit={onSubmit}
      >
        <img
          alt="FullTank Garage"
          className="mx-auto aspect-square w-[clamp(8.75rem,22dvh,12.5rem)] max-w-[58%] rounded-xl object-cover shadow-[0_12px_32px_rgba(0,0,0,0.38)]"
          src={fulltankGarageLogo}
        />

        <div className="space-y-[clamp(0.8rem,1.55dvh,1rem)]">
          <h1 className="text-center text-2xl font-black leading-tight text-[#ff3838] sm:text-3xl">
            ลงทะเบียนรับประกันสินค้า
          </h1>

          <input
            autoComplete="off"
            className="h-12 w-full rounded-xl border border-white/14 bg-[#0e0e0e] px-4 text-base font-semibold uppercase tracking-wide text-white outline-none transition placeholder:normal-case placeholder:tracking-normal placeholder:text-white/45 focus:border-[#ff3a35] focus:ring-4 focus:ring-[#ff3a35]/16"
            inputMode="text"
            onChange={(event) =>
              onSerialChange(onlyEnglishLettersAndDigits(event.target.value))
            }
            pattern="[A-Za-z0-9]*"
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
            className="h-12 w-full rounded-xl bg-gradient-to-r from-[#ff3b3b] to-[#d91605] text-base font-black text-white shadow-[0_14px_28px_rgba(232,26,13,0.2)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-65"
            disabled={isChecking}
            type="submit"
          >
            {isChecking ? 'กำลังตรวจสอบ...' : 'ลงทะเบียนรับประกัน'}
          </button>
        </div>
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

function CompanyFooter({ fillAvailable = false }: { fillAvailable?: boolean }) {
  return (
    <footer
      className={[
        'rounded-[1rem] border border-white/12 bg-[#101010] px-4 text-center text-white/74',
        fillAvailable
          ? 'flex flex-1 py-[clamp(1rem,3dvh,2rem)]'
          : 'py-3',
      ].join(' ')}
    >
      <div
        className={
          fillAvailable
            ? 'flex min-h-0 w-full flex-1 flex-col justify-evenly'
            : ''
        }
      >
        <p
          className={[
            'font-black text-white',
            fillAvailable
              ? 'text-[clamp(1.25rem,5.1vw,1.8rem)] leading-tight'
              : 'text-sm leading-5',
          ].join(' ')}
        >
          FullTank Garage Co., LTD
        </p>
        <p
          className={[
            'font-semibold',
            fillAvailable
              ? 'text-[clamp(0.9rem,3.75vw,1.18rem)] leading-[1.75]'
              : 'mt-1.5 text-xs leading-5',
          ].join(' ')}
        >
          1464/1 ซอยกาญจนาภิเษก 008 แขวงบางแค เขตบางแค กรุงเทพฯ 10160
        </p>
        <p
          className={[
            'font-semibold',
            fillAvailable
              ? 'text-[clamp(0.9rem,3.75vw,1.18rem)] leading-[1.75]'
              : 'text-xs leading-5',
          ].join(' ')}
        >
          โทรศัพท์: <a className="text-[#8fd1ff]" href="tel:0814452949">081 445 2949</a>
        </p>
        <p
          className={[
            'font-semibold',
            fillAvailable
              ? 'text-[clamp(0.9rem,3.75vw,1.18rem)] leading-[1.75]'
              : 'text-xs leading-5',
          ].join(' ')}
        >
          เวลาเปิดทำการ: เปิดทุกวัน (หยุดวันพฤหัสบดี) เวลา 10:00 - 20:00 น.
        </p>
      </div>
    </footer>
  )
}

export default App
