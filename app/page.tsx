"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import type { LucideIcon } from "lucide-react"
import {
  AlertCircle,
  Archive,
  ArrowDownUp,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  FileCheck2,
  FileDown,
  FileText,
  Filter,
  Inbox,
  LayoutDashboard,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Upload,
  UserRound,
  WalletCards,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Role =
  | "Administrador"
  | "Radicador"
  | "Aprobador"
  | "Contabilidad"
  | "Rechazos DIAN manuales"
  | "Tesorería"
  | "Legalizaciones"

type Stage = "Nueva" | "En revisión" | "Devuelta" | "Por rechazar" | "En pago" | "Archivada"

type Comment = {
  id: string
  author: string
  role: Role
  text: string
  date: string
}

type ReturnEvent = {
  category: string
  detail: string
  route: string
  at: string
}

type WorkflowVisit = {
  role: Role
  user: string
  startedAt: string
  endedAt?: string
  durationSeconds?: number
}

type Invoice = {
  id: string
  number: string
  prefix: string
  folio: string
  supplier: string
  nit: string
  amount: number
  dueDate: string
  dueSource: string
  received: string
  area: string
  costCenter: string
  recipientName: string
  recipientNit: string
  stage: Stage
  currentRole: Role
  assignedTo?: string
  paymentTerm?: string
  documentType?: string
  sourceSubject?: string
  documentReference?: string
  routingHint?: string
  relatedDocumentReference?: string
  documentReason?: string
  legalizationDocument?: string
  description: string
  attachments: number
  sourceTime: string
  sourceFiles: string[]
  sourceFileUrls?: Record<string, string>
  supportFiles?: string[]
  supportFileUrls?: Record<string, string>
  pdfUrl?: string
  xmlUrl?: string
  cufe?: string
  causationDocument?: string
  internalReturnReason?: string
  accountingReturnReason?: string
  treasuryReturnReason?: string
  rejectionReason?: string
  returnReasonCategory?: string
  rejectionCertificate?: string
  rejectionCertificateUrl?: string
  paymentProof?: string
  paymentProofUrl?: string
  stageEnteredAt?: string
  lastMovement?: string
  returnEvents?: ReturnEvent[]
  workflowVisits?: WorkflowVisit[]
  comments: Comment[]
  history: string[]
}

type MailboxState = {
  mailbox: string
  configured: boolean
  message: string
  lastSyncAt: string | null
}

type AppUserOption = { email: string; area: string; costCenter: string }

type DianRowSummary = {
  rowNumber: number
  documentType: string
  cufe: string
  prefix: string
  folio: string
  supplierNit: string
  supplierName: string
  recipientNit: string
  recipientName: string
  total: number
  issueDate: string
  receivedAt: string
  state: string
  group: string
}

type DianConciliationResult = {
  fileName: string
  uploadedAt: string
  expectedRecipientNit: string
  totalRows: number
  invoiceRows: number
  alreadyRadicated: number
  missingDocuments: number
  invalidRecipient: number
  notRadicable: number
  matchedBy: { cufe: number; supplierDocument: number }
  notes: string[]
  missing: DianRowSummary[]
  invalid: DianRowSummary[]
  notRadicableRows: DianRowSummary[]
  radicatedNow?: number
}

const expectedRecipientNit = "901373083"
const today = new Date()
const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})
const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
})

const costCenterOptions = [
  "TIC",
  "Contabilidad",
  "Tesorería",
  "Sistemas",
  "Oficina EEUU",
  "Oficina UK",
  "Beneficio",
  "Producción",
]

const roleConfig: Record<Role, { title: string; subtitle: string; icon: LucideIcon; nav: string[] }> = {
  Administrador: {
    title: "Vista general",
    subtitle: "Consulta el estado de los documentos y administra las bandejas que requieren tu intervención.",
    icon: LayoutDashboard,
    nav: ["Resumen", "Indicadores", "Consulta", "Entrada automática", "Por aprobar", "Rechazos manuales", "Contabilidad", "Legalizaciones", "Tesorería", "Archivo"],
  },
  Radicador: {
    title: "Entrada automática",
    subtitle: "Valida el destinatario, revisa los documentos recibidos y asígnalos a un Aprobador.",
    icon: Inbox,
    nav: ["Entrada automática", "Devueltas", "Archivo"],
  },
  Aprobador: {
    title: "Mis tareas",
    subtitle: "Completa el área y centro de costos, revisa la compra y decide el siguiente paso.",
    icon: FileCheck2,
    nav: ["Mis tareas", "Devueltas", "Archivo"],
  },
  Contabilidad: {
    title: "Revisión contable",
    subtitle: "Verifica los soportes, registra la causación o envía el documento a Legalizaciones cuando fue pagado de contado.",
    icon: FileCheck2,
    nav: ["Por revisar", "Causadas", "Archivo"],
  },
  "Rechazos DIAN manuales": {
    title: "Rechazos DIAN manuales",
    subtitle: "Completa el rechazo directamente en la DIAN, adjunta el certificado y archiva el expediente.",
    icon: ShieldAlert,
    nav: ["Por rechazar", "Archivadas"],
  },
  Tesorería: {
    title: "Tesorería",
    subtitle: "Gestiona la factura hasta adjuntar el comprobante de pago y cerrar el expediente.",
    icon: WalletCards,
    nav: ["Por pagar", "Archivadas"],
  },
  Legalizaciones: {
    title: "Legalizaciones",
    subtitle: "Confirma en qué documento de legalización quedó registrado el gasto y envía el expediente a Archivo.",
    icon: Archive,
    nav: ["Por confirmar", "Archivadas"],
  },
}

const tabsByRole: Record<Role, string[]> = {
  Administrador: ["Todos", "Entrada automática", "Por aprobar", "Contabilidad", "Legalizaciones", "Tesorería", "Rechazos manuales", "Archivadas"],
  Radicador: ["Entrada automática", "Devueltas", "Todos", "Archivadas"],
  Aprobador: ["Pendientes", "Devueltas", "Todos", "Archivadas"],
  Contabilidad: ["Por revisar", "Causadas", "Todos", "Archivadas"],
  "Rechazos DIAN manuales": ["Por rechazar", "Archivadas"],
  Tesorería: ["Por pagar", "Archivadas"],
  Legalizaciones: ["Por confirmar", "Archivadas"],
}

const returnReasonOptions = [
  "Falta de documentos o soportes",
  "Mala asignación",
  "Datos incompletos o incorrectos",
  "Centro de costos o área",
  "Corrección solicitada al proveedor",
  "Diferencia de valor o concepto",
  "Otro",
]

function formatDate(date?: string) {
  if (!date) return "No registrada"
  const parsed = new Date(date.includes("T") ? date : date + "T12:00:00")
  if (Number.isNaN(parsed.getTime())) return "No registrada"
  return dateFormatter.format(parsed).replace(/\./g, "")
}

function normalizeNit(value: string) {
  return value.replace(/\D/g, "")
}

function matchesRecipientNit(value: string) {
  return normalizeNit(value).slice(0, 9) === expectedRecipientNit
}

function daysUntil(date?: string) {
  if (!date) return 9999
  return Math.round((new Date(date + "T12:00:00").getTime() - today.getTime()) / 86400000)
}

function formatElapsedSince(value?: string) {
  if (!value) return "No registrado"
  const start = new Date(value).getTime()
  if (Number.isNaN(start)) return "No registrado"
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - start) / 60000))
  const days = Math.floor(elapsedMinutes / 1440)
  const hours = Math.floor((elapsedMinutes % 1440) / 60)
  const minutes = elapsedMinutes % 60
  if (days > 0) return `${days} día${days === 1 ? "" : "s"} ${hours} h`
  if (hours > 0) return `${hours} h ${minutes} min`
  return `${minutes} min`
}

function formatDurationSeconds(value?: number) {
  if (!value || value < 60) return "Menos de 1 min"
  const totalMinutes = Math.floor(value / 60)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days} día${days === 1 ? "" : "s"} ${hours} h`
  if (hours > 0) return `${hours} h ${minutes} min`
  return `${minutes} min`
}

const roleStageLabels: Record<Role, string> = {
  Administrador: "Administración",
  Radicador: "Radicación",
  Aprobador: "Aprobación",
  Contabilidad: "Contabilidad",
  "Rechazos DIAN manuales": "Rechazo manual DIAN",
  Tesorería: "Tesorería",
  Legalizaciones: "Legalizaciones",
}

function stageLabelFor(role: Role) {
  return roleStageLabels[role]
}

function getVisitSeconds(visit: WorkflowVisit) {
  if (visit.durationSeconds !== undefined) return visit.durationSeconds
  const start = new Date(visit.startedAt).getTime()
  return Number.isNaN(start) ? 0 : Math.max(0, Math.floor((Date.now() - start) / 1000))
}

function avatarLetters(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words.map((word) => word[0]).slice(0, 2).join("") : name.slice(0, 2)).toUpperCase()
}

function StageBadge({ stage }: { stage: Stage }) {
  const styles: Record<Stage, string> = {
    Nueva: "border-[#cfe3e5] bg-[#eef7f7] text-[#3f6870]",
    "En revisión": "border-[#cde5e1] bg-[#edf8f6] text-[#12675f]",
    Devuelta: "border-[#e8cdb9] bg-[#fff5ed] text-[#a34b18]",
    "Por rechazar": "border-[#efc7c7] bg-[#fff1f1] text-[#b54d4d]",
    "En pago": "border-[#d9d2f2] bg-[#f4f1ff] text-[#62529b]",
    Archivada: "border-[#d6e1e1] bg-[#f5f8f8] text-[#657b80]",
  }
  return (
    <Badge variant="outline" className={"rounded-full px-2.5 py-1 text-xs font-medium " + styles[stage]}>
      {stage}
    </Badge>
  )
}

function DueMark({ date, archived = false }: { date: string; archived?: boolean }) {
  if (!date) return <span className="text-xs text-[#718089]">No informada</span>
  const days = daysUntil(date)
  if (archived) return <span className="text-xs text-[#718089]">Cerrada</span>
  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#b54d4d]">
        <AlertCircle className="size-3.5" />
        Vencida
      </span>
    )
  }
  if (days === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#a34b18]">
        <Clock3 className="size-3.5" />
        Vence hoy
      </span>
    )
  }
  if (days <= 3) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#a34b18]">
        <Clock3 className="size-3.5" />
        Revisar pronto
      </span>
    )
  }
  return <span className="text-xs text-[#718089]">En plazo</span>
}

function getRoleInvoices(invoices: Invoice[], role: Role) {
  if (role === "Administrador") return invoices
  return invoices.filter((invoice) => invoice.currentRole === role)
}

function matchesTab(invoice: Invoice, role: Role, tab: string) {
  if (tab === "Todos") return true
  if (tab === "Archivadas") return invoice.stage === "Archivada"
  if (tab === "Entrada automática") return invoice.currentRole === "Radicador" && (role === "Administrador" ? invoice.stage !== "Archivada" : invoice.stage === "Nueva")
  if (tab === "Devueltas") return invoice.stage === "Devuelta"
  if (role === "Administrador" && tab === "Por aprobar") return invoice.currentRole === "Aprobador" && invoice.stage !== "Archivada"
  if (role === "Administrador" && tab === "Rechazos manuales") return invoice.currentRole === "Rechazos DIAN manuales" && invoice.stage !== "Archivada"
  if (role === "Administrador" && tab === "Contabilidad") return invoice.currentRole === "Contabilidad" && invoice.stage !== "Archivada"
  if (role === "Administrador" && tab === "Tesorería") return invoice.currentRole === "Tesorería" && invoice.stage !== "Archivada"
  if (role === "Administrador" && tab === "Legalizaciones") return invoice.currentRole === "Legalizaciones" && invoice.stage !== "Archivada"
  if (role === "Administrador" && tab === "Archivo") return invoice.stage === "Archivada"
  if (tab === "Pendientes") return invoice.stage !== "Archivada"
  if (tab === "Por revisar") return invoice.currentRole === "Contabilidad" && invoice.stage !== "Archivada"
  if (tab === "Causadas") return invoice.currentRole === "Contabilidad" && Boolean(invoice.causationDocument)
  if (tab === "Por pagar") return invoice.currentRole === "Tesorería" && invoice.stage === "En pago"
  if (tab === "Por rechazar") return invoice.currentRole === "Rechazos DIAN manuales" && invoice.stage === "Por rechazar"
  if (tab === "Por confirmar") return invoice.currentRole === "Legalizaciones" && invoice.stage !== "Archivada"
  return role === "Administrador"
}

function navigationTab(label: string, role: Role) {
  if (role === "Administrador") {
    const adminTabs: Record<string, string> = {
      Resumen: "Todos",
      "Entrada automática": "Entrada automática",
      "Por aprobar": "Por aprobar",
      Indicadores: "Seguimiento",
      Consulta: "Consulta",
      "Rechazos manuales": "Rechazos manuales",
      Contabilidad: "Por revisar",
      Legalizaciones: "Por confirmar",
      Tesorería: "Por pagar",
      Archivo: "Archivadas",
    }
    return adminTabs[label] ?? "Todos"
  }
  if (label === "Mis tareas") return "Pendientes"
  if (label === "Archivo") return "Archivadas"
  return label
}

export default function Home() {
  const { data: session } = useSession()
  const role = (session?.user?.appRole as Role | undefined) ?? "Radicador"
  const activeUser = session?.user?.name ?? session?.user?.email ?? "Usuario"
  const activeUserEmail = session?.user?.email?.toLowerCase() ?? ""
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [approvers, setApprovers] = useState<AppUserOption[]>([])
  const [activeUserProfile, setActiveUserProfile] = useState({ area: "", costCenter: "" })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("Todos")
  const [search, setSearch] = useState("")
  const [sortAscending, setSortAscending] = useState(true)
  const [assignment, setAssignment] = useState("")
  const [costCenterDraft, setCostCenterDraft] = useState("")
  const [causationDraft, setCausationDraft] = useState("")
  const [relatedDocumentDraft, setRelatedDocumentDraft] = useState("")
  const [documentReasonDraft, setDocumentReasonDraft] = useState("")
  const [legalizationDraft, setLegalizationDraft] = useState("")
  const [commentDraft, setCommentDraft] = useState("")
  const [supportDraft, setSupportDraft] = useState<File | null>(null)
  const [pdfZoom, setPdfZoom] = useState(1)
  const [rejectionCertificateDraft, setRejectionCertificateDraft] = useState("")
  const [rejectionCertificateUpload, setRejectionCertificateUpload] = useState<File | null>(null)
  const [paymentProofDraft, setPaymentProofDraft] = useState("")
  const [paymentProofUpload, setPaymentProofUpload] = useState<File | null>(null)
  const [savingFile, setSavingFile] = useState(false)
  const [decisionMode, setDecisionMode] = useState<"return" | "returnToApprover" | "returnToAccounting" | "rejection" | null>(null)
  const [decisionReason, setDecisionReason] = useState("")
  const [decisionReasonCategory, setDecisionReasonCategory] = useState("")
  const [trackingProcess, setTrackingProcess] = useState<Role>("Aprobador")
  const [trackingThresholdHours, setTrackingThresholdHours] = useState("24")
  const [trackingQueueFilter, setTrackingQueueFilter] = useState<"Todos" | Role>("Todos")
  const [consultationSearch, setConsultationSearch] = useState("")
  const [consultationDateFrom, setConsultationDateFrom] = useState("")
  const [consultationDateTo, setConsultationDateTo] = useState("")
  const [consultationStage, setConsultationStage] = useState<"Todos" | Role>("Todos")
  const [, setClockTick] = useState(Date.now())
  const [mobileNav, setMobileNav] = useState(false)
  const [toast, setToast] = useState("")
  const [syncingMailbox, setSyncingMailbox] = useState(false)
  const [dianLoading, setDianLoading] = useState(false)
  const [dianResult, setDianResult] = useState<DianConciliationResult | null>(null)
  const [mailboxState, setMailboxState] = useState<MailboxState>({
    mailbox: "No configurado",
    configured: false,
    message: "Configura el buzón corporativo en el entorno de despliegue.",
    lastSyncAt: null,
  })

  const config = roleConfig[role]
  const isTrackingView = role === "Administrador" && activeTab === "Seguimiento"
  const isConsultationView = role === "Administrador" && activeTab === "Consulta"
  const isAdminUtilityView = isTrackingView || isConsultationView
  const pageTitle = isTrackingView ? "Indicadores de gestión" : isConsultationView ? "Consulta de documentos" : config.title
  const activeApproverProfile = activeUserProfile
  const selected = invoices.find((invoice) => invoice.id === expandedId)
  const roleInvoices = useMemo(() => {
    const base = getRoleInvoices(invoices, role)
    return role === "Aprobador" ? base.filter((invoice) => invoice.assignedTo?.toLowerCase() === activeUserEmail) : base
  }, [activeUserEmail, invoices, role])
  const tabs = tabsByRole[role]

  const visibleInvoices = useMemo(() => {
    const query = search.toLowerCase().trim()
    return roleInvoices
      .filter((invoice) => {
        const matchesSearch =
          !query ||
          [invoice.number, invoice.prefix, invoice.folio, invoice.supplier, invoice.nit, invoice.cufe, invoice.area, invoice.costCenter, invoice.recipientNit, invoice.documentType, String(invoice.amount), money.format(invoice.amount)]
            .join(" ")
            .toLowerCase()
            .includes(query)
        return matchesTab(invoice, role, activeTab) && matchesSearch
      })
      .sort((a, b) => {
        const difference = a.dueDate.localeCompare(b.dueDate)
        return sortAscending ? difference : difference * -1
      })
  }, [activeTab, role, roleInvoices, search, sortAscending])

  const pendingCount = roleInvoices.filter((invoice) => invoice.stage !== "Archivada").length
  const dueSoonCount = roleInvoices.filter(
    (invoice) => invoice.stage !== "Archivada" && daysUntil(invoice.dueDate) <= 3,
  ).length
  const totalAmount = roleInvoices
    .filter((invoice) => invoice.stage !== "Archivada")
    .reduce((sum, invoice) => sum + invoice.amount, 0)
  const adminQueueCards = [
    {
      label: "Sin asignar",
      detail: "En la bandeja del Radicador",
      tab: "Entrada automática",
      count: invoices.filter((invoice) => invoice.currentRole === "Radicador" && invoice.stage !== "Archivada").length,
      icon: Inbox,
      tone: "bg-[#e8f6f3] text-[#147c70]",
    },
    {
      label: "Por aprobar",
      detail: "Pendientes del Aprobador",
      tab: "Por aprobar",
      count: invoices.filter((invoice) => invoice.currentRole === "Aprobador" && invoice.stage !== "Archivada").length,
      icon: FileCheck2,
      tone: "bg-[#eef7f7] text-[#3f6870]",
    },
    {
      label: "Contabilidad",
      detail: "En revisión contable",
      tab: "Contabilidad",
      count: invoices.filter((invoice) => invoice.currentRole === "Contabilidad" && invoice.stage !== "Archivada").length,
      icon: FileText,
      tone: "bg-[#fff1e5] text-[#b55d25]",
    },
    {
      label: "Legalizaciones",
      detail: "Pendientes de confirmar",
      tab: "Legalizaciones",
      count: invoices.filter((invoice) => invoice.currentRole === "Legalizaciones" && invoice.stage !== "Archivada").length,
      icon: Archive,
      tone: "bg-[#e8f6f3] text-[#147c70]",
    },
    {
      label: "Tesorería",
      detail: "Pendientes de pago",
      tab: "Tesorería",
      count: invoices.filter((invoice) => invoice.currentRole === "Tesorería" && invoice.stage !== "Archivada").length,
      icon: WalletCards,
      tone: "bg-[#f4f1ff] text-[#62529b]",
    },
  ]

  async function hydratePersistedInvoices() {
    try {
      const response = await fetch("/api/invoices", { cache: "no-store" })
      if (!response.ok) return
      const payload = (await response.json()) as { invoices?: Invoice[] }
      setInvoices(payload.invoices ?? [])
    } catch {
      // The page remains empty until the authenticated API is available.
    }
  }

  async function uploadInvoiceFile(invoiceId: string, file: File, kind: string) {
    const form = new FormData()
    form.set("file", file)
    form.set("kind", kind)
    const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/files`, {
      method: "POST",
      body: form,
      cache: "no-store",
    })
    const payload = (await response.json()) as { error?: string }
    if (!response.ok) throw new Error(payload.error || "No fue posible guardar el documento.")
    await hydratePersistedInvoices()
  }

  async function syncMailbox(silent = false): Promise<{ processed: number; rejected: number; skipped: number } | null> {
    if (syncingMailbox) return null
    setSyncingMailbox(true)
    try {
      const response = await fetch("/api/inbox/sync", { method: "POST", cache: "no-store" })
      const payload = (await response.json()) as {
        error?: string
        mailbox?: string
        processed?: number
        rejected?: number
        skipped?: number
        synchronizedAt?: string
      }
      if (!response.ok) throw new Error(payload.error || "No fue posible revisar el buzón.")
      await hydratePersistedInvoices()
      const processed = payload.processed ?? 0
      const rejected = payload.rejected ?? 0
      const skipped = payload.skipped ?? 0
      setMailboxState({
        mailbox: payload.mailbox || "No configurado",
        configured: true,
        message: `${processed} factura${processed === 1 ? "" : "s"} nueva${processed === 1 ? "" : "s"}, ${skipped} ya registrada${skipped === 1 ? "" : "s"}${rejected ? ` y ${rejected} no radicada${rejected === 1 ? "" : "s"} por NIT` : ""}.`,
        lastSyncAt: payload.synchronizedAt || new Date().toISOString(),
      })
      if (!silent) showToast("Buzón sincronizado correctamente.")
      return { processed, rejected, skipped }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible revisar el buzón."
      setMailboxState((current) => ({ ...current, configured: false, message }))
      if (!silent) showToast(message)
      return null
    } finally {
      setSyncingMailbox(false)
    }
  }

  useEffect(() => {
    const initialSync = window.setTimeout(() => {
      void hydratePersistedInvoices()
      void fetch("/api/inbox/sync", { cache: "no-store" })
        .then((response) => response.json())
        .then((payload: MailboxState) => setMailboxState((current) => ({ ...current, ...payload })))
        .catch(() => undefined)
    }, 0)
    const interval = window.setInterval(() => void hydratePersistedInvoices(), 60_000)
    return () => {
      window.clearTimeout(initialSync)
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => setClockTick(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!session?.user?.email) return
    void fetch("/api/users", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("No fue posible cargar los usuarios configurados.")
        return response.json() as Promise<{ users?: AppUserOption[]; profile?: { area: string; costCenter: string } }>
      })
      .then((payload) => {
        const users = payload.users ?? []
        setApprovers(users)
        setActiveUserProfile(payload.profile ?? { area: "", costCenter: "" })
        setAssignment((current) => current || users[0]?.email || "")
      })
      .catch(() => showToast("No fue posible cargar la configuración de usuarios."))
  }, [session?.user?.email])

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(""), 3000)
  }

  async function handleDianUpload(file: File | undefined) {
    if (!file || dianLoading) return
    setDianLoading(true)
    try {
      // Si el buzón está configurado, se revisa antes del cruce para que los ZIP
      // nuevos que ya llegaron puedan convertirse en radicaciones automáticamente.
      const mailboxSync = mailboxState.configured ? await syncMailbox(true) : null
      const form = new FormData()
      form.append("file", file)
      const response = await fetch("/api/dian/conciliate", { method: "POST", body: form, cache: "no-store" })
      const payload = (await response.json()) as DianConciliationResult & { error?: string }
      if (!response.ok) throw new Error(payload.error || "No fue posible leer el listado DIAN.")
      await hydratePersistedInvoices()
      setDianResult({ ...payload, radicatedNow: mailboxSync?.processed ?? 0 })
      showToast("Listado DIAN conciliado correctamente.")
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No fue posible conciliar el listado DIAN.")
    } finally {
      setDianLoading(false)
      const input = document.getElementById("dian-upload") as HTMLInputElement | null
      if (input) input.value = ""
    }
  }

  function renderDianMissingRows() {
    if (!dianResult || dianResult.missing.length === 0) return null
    return (
      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#a34b18]">Faltantes identificados</p>
        <p className="mt-1 text-xs leading-5 text-[#84959a]">El Excel de la DIAN no incluye el XML ni el PDF. Los documentos faltantes se incorporan al sincronizar el buzón con el ZIP original.</p>
        <div className="mt-2 space-y-2">
          {dianResult.missing.slice(0, 6).map((row) => {
            return (
              <Fragment key={`${row.rowNumber}-${row.cufe}`}>
                <div className="flex flex-col gap-2 rounded-lg border border-[#f0dfd2] bg-[#fffaf6] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-[#7e421f]">{row.prefix ? `${row.prefix}-` : ""}{row.folio} · {row.supplierName}</p>
                    <p className="truncate text-[11px] text-[#986642]">{row.documentType}</p>
                    <p className="truncate font-mono text-[10px] text-[#a27b61]">CUFE: {row.cufe || "No informado"}</p>
                  </div>
                </div>
              </Fragment>
            )
          })}
        </div>
        {dianResult.missing.length > 6 && <p className="mt-2 text-xs text-[#84959a]">Se muestran 6 faltantes. Descarga el informe para verlos todos o procesa los demás en otra revisión.</p>}
      </div>
    )
  }

  function renderDianInvalidRows() {
    if (!dianResult || dianResult.invalid.length === 0) return null
    return (
      <div className="mt-3 rounded-xl border border-[#efc7c7] bg-[#fff7f7] p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#b54d4d]">NIT no válido · no se puede radicar</p>
        <p className="mt-1 text-xs leading-5 text-[#9a5b5b]">Estas facturas no podrán radicarse aunque se consulte su XML. El nombre del receptor no reemplaza la validación obligatoria del NIT {expectedRecipientNit}.</p>
        <div className="mt-2 space-y-1.5">{dianResult.invalid.slice(0, 6).map((row) => <div key={`${row.rowNumber}-${row.cufe}`} className="flex flex-col gap-1 rounded-lg bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs font-semibold text-[#7f3f3f]">{row.prefix ? `${row.prefix}-` : ""}{row.folio} · {row.supplierName}</span><span className="font-mono text-[10px] text-[#b54d4d]">NIT receptor leído: {row.recipientNit || "No informado"}</span></div>)}</div>
        {dianResult.invalid.length > 6 && <p className="mt-2 text-xs text-[#9a5b5b]">Se muestran 6 casos. Descarga el informe para verlos todos.</p>}
      </div>
    )
  }

  function downloadDianConciliation() {
    if (!dianResult) return
    const rows = [
      ...dianResult.missing.map((row) => ({ ...row, result: "No estaba radicada · pendiente XML/PDF" })),
      ...dianResult.invalid.map((row) => ({ ...row, result: "No radicada · NIT receptor no coincide" })),
      ...dianResult.notRadicableRows.map((row) => ({ ...row, result: "No aplica para radicación automática" })),
    ]
    const headers = ["Fila DIAN", "Resultado", "Tipo de documento", "CUFE/CUDE", "NIT emisor", "Nombre emisor", "Prefijo", "Folio", "NIT receptor", "Nombre receptor", "Fecha emisión", "Fecha recepción", "Total", "Estado DIAN"]
    const escapeCell = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;")
    const cell = (value: string, className = "") => `<td class="${className}">${escapeCell(value)}</td>`
    const body = rows.map((row, index) => `<tr class="${index % 2 ? "alt" : ""}">${cell(String(row.rowNumber), "center")}${cell(row.result, "text")}${cell(row.documentType, "text")}${cell(row.cufe || "—", "cufe")}${cell(row.supplierNit, "text")}${cell(row.supplierName, "text")}${cell(row.prefix || "—", "center")}${cell(row.folio, "center")}${cell(row.recipientNit, "text")}${cell(row.recipientName, "text")}${cell(row.issueDate, "text")}${cell(row.receivedAt, "text")}${cell(row.total.toLocaleString("es-CO"), "money")}${cell(row.state, "text")}</tr>`).join("")
    const table = `<!DOCTYPE html><html xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>body{font-family:Aptos,Arial,sans-serif;color:#21414b}.report{width:100%;border-collapse:collapse}.title{padding:16px;background:#0d2833;color:#fff;font-size:18px;font-weight:700}.meta{padding:8px;background:#e8f6f3;color:#147c70;font-size:11px}th{padding:8px;border:1px solid #0f665e;background:#147c70;color:#fff;font-size:10px;text-align:left}td{padding:7px;border:1px solid #dce7e7;font-size:10px;vertical-align:top;word-break:break-word}tr.alt td{background:#f7fbfb}.center{text-align:center}.money{text-align:right;white-space:nowrap}.cufe{font-family:Consolas,monospace;font-size:8px;word-break:break-all}.text{mso-number-format:"@"}</style></head><body><table class="report"><tr><td colspan="${headers.length}" class="title">Informe de conciliación con listado DIAN</td></tr><tr><td colspan="${headers.length}" class="meta">${escapeCell(dianResult.fileName)} · NIT receptor esperado ${dianResult.expectedRecipientNit} · Faltantes identificados: ${dianResult.missingDocuments}</td></tr><tr>${headers.map((header) => `<th>${escapeCell(header)}</th>`).join("")}</tr>${body}</table></body></html>`
    const blob = new Blob([table], { type: "application/vnd.ms-excel;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "informe-conciliacion-dian.xls"
    anchor.click()
    URL.revokeObjectURL(url)
    showToast("Informe de conciliación descargado.")
  }

  function changePdfZoom(delta: number) {
    setPdfZoom((current) => Math.min(1.75, Math.max(0.75, Math.round((current + delta) * 100) / 100)))
  }

  function loadInvoice(invoice: Invoice) {
    setExpandedId(invoice.id)
    setCostCenterDraft(invoice.costCenter)
    setCausationDraft(invoice.causationDocument ?? "")
    setRelatedDocumentDraft(invoice.relatedDocumentReference ?? "")
    setDocumentReasonDraft(invoice.documentReason ?? "")
    setLegalizationDraft(invoice.legalizationDocument ?? "")
    setSupportDraft(null)
    setPdfZoom(1)
    setRejectionCertificateDraft(invoice.rejectionCertificate ?? "")
    setRejectionCertificateUpload(null)
    setPaymentProofDraft(invoice.paymentProof ?? "")
    setPaymentProofUpload(null)
    setDecisionMode(null)
    setDecisionReason("")
    setDecisionReasonCategory("")
    setCommentDraft("")
  }

  function selectInvoice(invoice: Invoice) {
    if (expandedId === invoice.id) {
      setExpandedId(null)
      return
    }
    loadInvoice(invoice)
  }

  function updateSelected(updates: Partial<Invoice>, message: string) {
    if (!selected) return
    const trackedUpdates = { ...updates, lastMovement: message }
    const history = [message, ...selected.history]
    setInvoices((current) =>
      current.map((invoice) =>
        invoice.id === selected.id
          ? { ...invoice, ...trackedUpdates, history }
          : invoice,
      ),
    )
    const persistedUpdates = { ...trackedUpdates }
    delete persistedUpdates.history
    void fetch(`/api/invoices/${encodeURIComponent(selected.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates: persistedUpdates }),
    }).then(async (response) => {
      if (!response.ok) throw new Error("No fue posible guardar el cambio.")
      await hydratePersistedInvoices()
    }).catch(() => {
      setInvoices((current) => current.map((invoice) => invoice.id === selected.id ? selected : invoice))
      showToast("No se guardó el cambio. Verifica tu conexión y tus permisos.")
    })
    showToast(message)
  }

  function assignInvoice() {
    if (!selected) return
    if (!matchesRecipientNit(selected.recipientNit)) {
      showToast("No se puede radicar: el NIT destinatario no coincide.")
      return
    }
    updateSelected(
      { currentRole: "Aprobador", stage: "En revisión", assignedTo: assignment },
      "Factura validada y asignada a " + assignment + ".",
    )
  }

  function sendToAccounting() {
    if (!costCenterDraft) {
      showToast("Selecciona el centro de costos antes de enviar.")
      return
    }
    const isCreditNote = (selected?.documentType || "").toLowerCase().includes("nota")
    if (isCreditNote && (!relatedDocumentDraft.trim() || !documentReasonDraft.trim())) {
      showToast("Para una nota crédito registra la factura relacionada y el motivo del ajuste.")
      return
    }
    updateSelected(
      {
        area: activeApproverProfile.area,
        costCenter: costCenterDraft,
        currentRole: "Contabilidad",
        stage: "En revisión",
        relatedDocumentReference: relatedDocumentDraft.trim() || undefined,
        documentReason: documentReasonDraft.trim() || undefined,
      },
      isCreditNote ? "Nota crédito relacionada y enviada a Contabilidad." : "Documento aprobado y enviado a Contabilidad.",
    )
  }

  function submitDecision() {
    if (!decisionMode || !decisionReasonCategory || !decisionReason.trim()) {
      showToast("Selecciona una categoría y escribe el motivo para continuar.")
      return
    }
    if (decisionMode === "return") {
      updateSelected(
        {
          currentRole: "Radicador",
          stage: "Devuelta",
          internalReturnReason: decisionReason.trim(),
          returnReasonCategory: decisionReasonCategory,
        },
        "Factura devuelta al Radicador. Motivo: " + decisionReason.trim(),
      )
    }
    if (decisionMode === "returnToApprover") {
      updateSelected(
        {
          currentRole: "Aprobador",
          stage: "En revisión",
          accountingReturnReason: decisionReason.trim(),
          returnReasonCategory: decisionReasonCategory,
        },
        "Factura devuelta al Aprobador por Contabilidad. Motivo: " + decisionReason.trim(),
      )
    }
    if (decisionMode === "returnToAccounting") {
      updateSelected(
        {
          currentRole: "Contabilidad",
          stage: "En revisión",
          treasuryReturnReason: decisionReason.trim(),
          returnReasonCategory: decisionReasonCategory,
        },
        "Factura devuelta a Contabilidad por Tesorería. Motivo: " + decisionReason.trim(),
      )
    }
    if (decisionMode === "rejection") {
      updateSelected(
        {
          currentRole: "Rechazos DIAN manuales",
          stage: "Por rechazar",
          rejectionReason: decisionReason.trim(),
          returnReasonCategory: decisionReasonCategory,
        },
        "Factura enviada a la bandeja de rechazos DIAN manuales. Motivo: " + decisionReason.trim(),
      )
    }
    setDecisionMode(null)
    setDecisionReason("")
    setDecisionReasonCategory("")
  }

  function saveCausation() {
    if (!causationDraft.trim()) {
      showToast("Escribe el documento de causación.")
      return
    }
    updateSelected(
      { causationDocument: causationDraft.trim() },
      "Documento de causación guardado: " + causationDraft.trim(),
    )
  }

  function sendToTreasury() {
    if (!selected?.causationDocument) {
      showToast("Guarda primero el documento de causación.")
      return
    }
    updateSelected(
      { currentRole: "Tesorería", stage: "En pago" },
      "Factura enviada a Tesorería con causación registrada.",
    )
  }

  function sendToLegalizations() {
    updateSelected(
      { currentRole: "Legalizaciones", stage: "En revisión" },
      "Documento enviado a Legalizaciones para confirmar el soporte del viaje.",
    )
  }

  function saveDocumentContext() {
    if (!selected) return
    const isCreditNote = (selected.documentType || "").toLowerCase().includes("nota")
    if (isCreditNote && (!relatedDocumentDraft.trim() || !documentReasonDraft.trim())) {
      showToast("Para una nota crédito registra la factura relacionada y el motivo del ajuste.")
      return
    }
    updateSelected(
      {
        relatedDocumentReference: relatedDocumentDraft.trim() || undefined,
        documentReason: documentReasonDraft.trim() || undefined,
      },
      isCreditNote ? "Relación y motivo de la nota crédito guardados." : "Información adicional del documento guardada.",
    )
  }

  function confirmLegalization() {
    if (!legalizationDraft.trim()) {
      showToast("Escribe el documento de legalización antes de enviar a Archivo.")
      return
    }
    updateSelected(
      { legalizationDocument: legalizationDraft.trim(), stage: "Archivada" },
      "Documento de legalización registrado y expediente enviado a Archivo. No se genera CxP porque el gasto fue pagado de contado.",
    )
  }

  async function saveRejectionCertificate() {
    if (!rejectionCertificateUpload || !selected) {
      showToast("Selecciona el certificado de rechazo.")
      return
    }
    setSavingFile(true)
    try {
      await uploadInvoiceFile(selected.id, rejectionCertificateUpload, "rejection_certificate")
      setRejectionCertificateDraft("")
      setRejectionCertificateUpload(null)
      showToast("Certificado de rechazo guardado en SharePoint.")
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No fue posible guardar el certificado.")
    } finally {
      setSavingFile(false)
    }
  }

  function archiveRejectedInvoice() {
    if (!selected?.rejectionCertificate) {
      showToast("Adjunta el certificado antes de archivar.")
      return
    }
    updateSelected(
      { stage: "Archivada" },
      "Rechazo manual realizado, certificado adjunto y expediente archivado.",
    )
  }

  async function savePaymentProof() {
    if (!paymentProofUpload || !selected) {
      showToast("Selecciona el comprobante de pago.")
      return
    }
    setSavingFile(true)
    try {
      await uploadInvoiceFile(selected.id, paymentProofUpload, "payment_proof")
      setPaymentProofDraft("")
      setPaymentProofUpload(null)
      showToast("Comprobante de pago guardado en SharePoint.")
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No fue posible guardar el comprobante.")
    } finally {
      setSavingFile(false)
    }
  }

  function archivePaidInvoice() {
    if (!selected?.paymentProof) {
      showToast("Adjunta y guarda el comprobante antes de archivar.")
      return
    }
    updateSelected({ stage: "Archivada" }, "Pago confirmado y expediente archivado.")
  }

  function addComment() {
    if (!commentDraft.trim()) {
      showToast("Escribe un comentario.")
      return
    }
    if (!selected) return
    updateSelected(
      {
        comments: [
          {
            id: String(Date.now()),
            author: activeUser,
            role,
            text: commentDraft.trim(),
            date: "Ahora",
          },
          ...selected.comments,
        ],
      },
      "Comentario agregado al expediente.",
    )
    setCommentDraft("")
  }

  async function saveSupport() {
    if (!supportDraft || !selected) {
      showToast("Selecciona un archivo de soporte.")
      return
    }
    const currentSupportFiles = selected.supportFiles ?? []
    if (selected.sourceFiles.length + currentSupportFiles.length >= 6) {
      showToast("Este expediente ya tiene el máximo de seis archivos.")
      return
    }
    setSavingFile(true)
    try {
      await uploadInvoiceFile(selected.id, supportDraft, "support")
      setSupportDraft(null)
      setPdfZoom(1)
      const input = document.getElementById("support-" + selected.id) as HTMLInputElement | null
      if (input) input.value = ""
      showToast("Soporte guardado en SharePoint.")
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No fue posible guardar el soporte.")
    } finally {
      setSavingFile(false)
    }
  }

  function downloadExcel() {
    const headers = [
      "N.º",
      "NIT proveedor",
      "Razón social",
      "Tipo documental",
      "Referencia documental",
      "CUFE/CUDE",
      "Factura relacionada",
      "Motivo / justificación",
      "Documento de causación",
      "Documento de legalización",
      "Prefijo",
      "Folio",
      "Fecha factura recibida",
      "Fecha de vencimiento",
      "Valor",
      "Área",
      "Centro de costos",
      "Bandeja actual",
      "Estado",
    ]
    const escapeCell = (value: string) =>
      value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    const sortedInvoices = [...invoices].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    const totalAmount = sortedInvoices.reduce((sum, invoice) => sum + invoice.amount, 0)
    const cell = (value: string, className = "") => `<td class="${className}">${escapeCell(value)}</td>`
    const rows = sortedInvoices
      .map((invoice, index) => {
        const days = daysUntil(invoice.dueDate)
        const dueClass = days < 0 ? " overdue" : days <= 3 ? " due-soon" : ""
        const dueLabel = days < 0 ? "Vencida" : days === 0 ? "Vence hoy" : days <= 3 ? "Revisar pronto" : "En plazo"
        const rowClass = index % 2 === 1 ? "alt" : ""
        return `<tr class="${rowClass}">${cell(String(index + 1), "center")}${cell(invoice.nit, "text")}${cell(invoice.supplier, "text supplier")}${cell(invoice.documentType ?? "Factura electrónica", "text")}${cell(invoice.documentReference ?? "—", "text")}${cell(invoice.cufe ?? "No encontrado", "cufe text")}${cell(invoice.relatedDocumentReference ?? "—", "text")}${cell(invoice.documentReason ?? "—", "text")}${cell(invoice.causationDocument ?? "Pendiente", "text")}${cell(invoice.legalizationDocument ?? "—", "text")}${cell(invoice.prefix || "—", "center text")}${cell(invoice.folio, "center text")}${cell(invoice.received, "text")}${`<td class="text${dueClass}">${escapeCell(formatDate(invoice.dueDate))}<br><span class="due-label">${dueLabel}</span></td>`}${`<td class="money">${invoice.amount}</td>`}${cell(invoice.area || "Pendiente", "text")}${cell(invoice.costCenter || "Pendiente", "text")}${cell(invoice.currentRole, "text")}${cell(invoice.stage, "text")}</tr>`
      })
      .join("")
    const table = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <style>
    @page { margin: 0.45in; }
    body { font-family: Aptos, Arial, sans-serif; color: #21414b; }
    .report { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .title { padding: 18px 16px; background: #0d2833; color: #ffffff; font-size: 20px; font-weight: 700; text-align: left; }
    .subtitle { padding: 9px 16px; background: #e8f6f3; color: #147c70; font-size: 12px; font-weight: 600; text-align: left; }
    .meta { padding: 7px 16px; background: #f4f8f8; color: #688187; font-size: 11px; text-align: left; }
    .spacer { height: 10px; border: 0; }
    .metric { padding: 10px 12px; border: 1px solid #dce7e7; background: #f7fbfb; font-size: 11px; text-align: left; }
    .metric-label { color: #688187; }
    .metric-value { color: #21414b; font-size: 15px; font-weight: 700; }
    th { padding: 9px 8px; border: 1px solid #0f665e; background: #147c70; color: #ffffff; font-size: 10px; font-weight: 700; text-align: left; vertical-align: middle; }
    td { padding: 8px; border: 1px solid #dce7e7; font-size: 10px; vertical-align: top; word-wrap: break-word; }
    tr.alt td { background: #f7fbfb; }
    .center { text-align: center; }
    .right, .money { text-align: right; white-space: nowrap; }
    .text { mso-number-format: "@"; }
    .money { mso-number-format: "$ #,##0"; }
    .supplier { width: 17%; }
    .cufe { width: 26%; font-family: Consolas, monospace; font-size: 8px; word-break: break-all; }
    .overdue { background: #fff1f1 !important; color: #b54d4d; font-weight: 700; }
    .due-soon { background: #fff8f2 !important; color: #a34b18; font-weight: 700; }
    .due-label { font-size: 9px; font-weight: 600; }
    .footer { padding: 10px 12px; background: #f4f8f8; color: #688187; font-size: 10px; text-align: left; }
  </style>
</head>
<body>
  <table class="report">
    <tr><td colspan="${headers.length}" class="title">Relación de facturas recibidas</td></tr>
    <tr><td colspan="${headers.length}" class="subtitle">Inversora Arcilaza S.A.S. · NIT ${expectedRecipientNit}</td></tr>
    <tr><td colspan="${headers.length}" class="meta">Generado el ${formatDate("2026-09-15")} · Facturas ordenadas por fecha de vencimiento · Destinatario validado</td></tr>
    <tr><td colspan="${headers.length}" class="spacer"></td></tr>
    <tr>
      <td colspan="4" class="metric"><span class="metric-label">Documentos incluidos</span><br><span class="metric-value">${sortedInvoices.length}</span></td>
      <td colspan="5" class="metric"><span class="metric-label">Valor total</span><br><span class="metric-value">$ ${totalAmount.toLocaleString("es-CO")}</span></td>
      <td colspan="5" class="metric"><span class="metric-label">Corte de información</span><br><span class="metric-value">${formatDate("2026-09-15")}</span></td>
      <td colspan="5" class="metric"><span class="metric-label">Fuente</span><br><span class="metric-value">Correo electrónico / DIAN</span></td>
    </tr>
    <tr><td colspan="${headers.length}" class="spacer"></td></tr>
    <tr>${headers.map((header) => `<th>${escapeCell(header)}</th>`).join("")}</tr>
    ${rows}
    <tr><td colspan="${headers.length}" class="footer">Relación preparada para revisión y conciliación con el listado de facturas recibidas de la DIAN.</td></tr>
  </table>
</body>
</html>`
    const blob = new Blob([table], { type: "application/vnd.ms-excel;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "relacion-facturas-recibidas-inversora-arcilaza.xls"
    anchor.click()
    URL.revokeObjectURL(url)
    showToast("Relación para Excel descargada.")
  }

  function countForTab(tab: string) {
    return roleInvoices.filter((invoice) => matchesTab(invoice, role, tab)).length
  }

  function renderConsultationView() {
    const query = consultationSearch.trim().toLowerCase()
    const results = invoices
      .filter((invoice) => {
        const searchableText = [
          invoice.number,
          invoice.prefix,
          invoice.folio,
          invoice.supplier,
          invoice.nit,
          invoice.recipientName,
          invoice.recipientNit,
          invoice.cufe,
          invoice.area,
          invoice.costCenter,
          invoice.currentRole,
          invoice.assignedTo,
          invoice.stage,
          invoice.documentType,
          invoice.description,
          invoice.causationDocument,
          String(invoice.amount),
          money.format(invoice.amount),
          invoice.dueDate,
          invoice.received,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        const matchesText = !query || searchableText.includes(query)
        const matchesStage = consultationStage === "Todos" || invoice.currentRole === consultationStage
        const matchesFrom = !consultationDateFrom || invoice.dueDate >= consultationDateFrom
        const matchesTo = !consultationDateTo || invoice.dueDate <= consultationDateTo
        return matchesText && matchesStage && matchesFrom && matchesTo
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    const openResults = results.filter((invoice) => invoice.stage !== "Archivada")
    const archivedResults = results.filter((invoice) => invoice.stage === "Archivada")
    const dueResults = results.filter((invoice) => invoice.stage !== "Archivada" && daysUntil(invoice.dueDate) <= 3)
    const clearFilters = () => {
      setConsultationSearch("")
      setConsultationDateFrom("")
      setConsultationDateTo("")
      setConsultationStage("Todos")
    }

    return (
      <div className="space-y-5">
        <div>
          <p className="text-sm font-semibold text-[#36525a]">Consulta de documentos</p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#84959a]">Busca una factura por número, proveedor, NIT, CUFE, valor u otro dato. Haz clic en el resultado para abrir el expediente y revisar todo su recorrido.</p>
        </div>

        <Card className="rounded-2xl border-[#dce7e7] py-0 shadow-[0_8px_22px_rgb(32_69_77/3%)]">
          <CardContent className="p-5 sm:p-6">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_190px_auto] lg:items-end">
              <div className="min-w-0">
                <label htmlFor="consultation-search" className="mb-1.5 block text-xs font-semibold text-[#557079]">Dato de búsqueda</label>
                <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8aa0a5]" /><Input id="consultation-search" value={consultationSearch} onChange={(event) => setConsultationSearch(event.target.value)} placeholder="Factura, proveedor, NIT, CUFE o valor" className="h-10 rounded-xl border-[#d7e4e4] bg-[#fbfdfd] pl-9 text-sm shadow-none placeholder:text-[#93a5a9] focus-visible:ring-[#6ed1c2]/40" /></div>
              </div>
              <div>
                <label htmlFor="consultation-date-from" className="mb-1.5 block text-xs font-semibold text-[#557079]">Vencimiento desde</label>
                <Input id="consultation-date-from" type="date" value={consultationDateFrom} onChange={(event) => setConsultationDateFrom(event.target.value)} className="h-10 rounded-xl border-[#d7e4e4] bg-[#fbfdfd] text-sm text-[#36525a] shadow-none focus-visible:ring-[#6ed1c2]/40" />
              </div>
              <div>
                <label htmlFor="consultation-date-to" className="mb-1.5 block text-xs font-semibold text-[#557079]">Vencimiento hasta</label>
                <Input id="consultation-date-to" type="date" value={consultationDateTo} onChange={(event) => setConsultationDateTo(event.target.value)} className="h-10 rounded-xl border-[#d7e4e4] bg-[#fbfdfd] text-sm text-[#36525a] shadow-none focus-visible:ring-[#6ed1c2]/40" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#557079]">Bandeja actual</label>
                <Select value={consultationStage} onValueChange={(value) => setConsultationStage(value as "Todos" | Role)}>
                  <SelectTrigger className="h-10 rounded-xl border-[#d7e4e4] bg-[#fbfdfd] text-sm text-[#36525a] shadow-none"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Todos">Todas las bandejas</SelectItem>
                    {(["Radicador", "Aprobador", "Contabilidad", "Rechazos DIAN manuales", "Tesorería", "Legalizaciones"] as Role[]).map((option) => <SelectItem key={option} value={option}>{stageLabelFor(option)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" onClick={clearFilters} variant="outline" className="h-10 rounded-xl border-[#d7e4e4] bg-white px-3.5 text-sm text-[#557079] shadow-none hover:bg-[#f2f7f7]"><RotateCcw className="size-4" />Limpiar</Button>
            </div>
            <p className="mt-3 text-xs leading-5 text-[#84959a]">La fecha consulta el vencimiento leído del documento. Para revisar el día de recepción, usa la fecha mostrada en cada resultado.</p>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Encontrados", results.length, "bg-[#edf3f4] text-[#557079]"],
            ["En trámite", openResults.length, "bg-[#e8f6f3] text-[#147c70]"],
            ["En Archivo", archivedResults.length, "bg-[#f4f8f8] text-[#657b80]"],
            ["Vencen pronto", dueResults.length, "bg-[#fff1e5] text-[#b55d25]"],
          ].map(([label, count, tone]) => <div key={String(label)} className={"rounded-2xl px-4 py-3 " + tone}><p className="text-xs font-medium opacity-80">{label}</p><p className="mt-1 text-2xl font-semibold">{count}</p></div>)}
        </div>

        <Card className="overflow-hidden rounded-2xl border-[#dce7e7] py-0 shadow-[0_8px_22px_rgb(32_69_77/3%)]">
          <CardHeader className="border-b border-[#e5eeee] px-5 py-5 sm:px-6"><CardTitle className="text-lg tracking-[-0.02em] text-[#21414b]">Resultados de la consulta</CardTitle><p className="mt-1 text-sm text-[#84959a]">{results.length} documento{results.length === 1 ? "" : "s"}. Haz clic en una fila para abrir su trazabilidad.</p></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left">
              <thead className="bg-[#f8fbfb] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#83949a]"><tr><th className="w-16 px-4 py-3 text-center">N.º</th><th className="px-5 py-3">Documento</th><th className="px-4 py-3">Proveedor</th><th className="px-4 py-3">Dónde está</th><th className="px-4 py-3">Tiempo allí</th><th className="px-4 py-3">Vencimiento</th><th className="px-4 py-3">Valor</th></tr></thead>
              <tbody className="divide-y divide-[#edf2f2]">
                {results.map((invoice, index) => {
                  const currentVisit = [...(invoice.workflowVisits ?? [])].reverse().find((visit) => !visit.endedAt) ?? [...(invoice.workflowVisits ?? [])].reverse()[0]
                  const currentLocation = invoice.stage === "Archivada" ? "Archivo" : stageLabelFor(invoice.currentRole)
                  const currentResponsible = currentVisit?.user || invoice.assignedTo || "Sin asignar"
                  return (
                    <tr key={invoice.id} onClick={() => loadInvoice(invoice)} className="cursor-pointer bg-white transition hover:bg-[#f7fbfa]">
                      <td className="px-4 py-4 text-center"><span className="inline-flex size-7 items-center justify-center rounded-full bg-[#eef4f4] text-xs font-semibold text-[#557079]">{index + 1}</span></td>
                      <td className="px-5 py-4"><p className="text-sm font-semibold text-[#21414b]">{invoice.number}</p><p className="mt-0.5 text-xs text-[#84959a]">{invoice.documentType || "Factura electrónica"} · Recibida {invoice.received}</p></td>
                      <td className="max-w-[250px] px-4 py-4"><p className="truncate text-sm font-medium text-[#36525a]">{invoice.supplier}</p><p className="mt-0.5 text-xs text-[#84959a]">NIT {invoice.nit}</p></td>
                      <td className="px-4 py-4"><p className="text-sm font-semibold text-[#36525a]">{currentLocation}</p><p className="mt-0.5 text-xs text-[#84959a]">{currentResponsible}</p><div className="mt-1"><StageBadge stage={invoice.stage} /></div></td>
                      <td className="px-4 py-4"><p className={"text-sm font-semibold " + (invoice.stage === "Archivada" ? "text-[#657b80]" : "text-[#147c70]")}>{invoice.stage === "Archivada" ? "Cerrada" : formatElapsedSince(invoice.stageEnteredAt)}</p><p className="mt-0.5 text-xs text-[#84959a]">{currentVisit?.startedAt ? `Desde ${formatDate(currentVisit.startedAt)}` : "Sin registro"}</p></td>
                      <td className="px-4 py-4"><p className="whitespace-nowrap text-sm font-semibold text-[#36525a]">{formatDate(invoice.dueDate)}</p><DueMark date={invoice.dueDate} archived={invoice.stage === "Archivada"} /></td>
                      <td className="px-4 py-4 text-sm font-semibold text-[#2e4e57]">{money.format(invoice.amount).replace(" ", " ")}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {results.length === 0 && <div className="px-6 py-16 text-center"><div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-[#edf5f4] text-[#6f8a8d]"><Search className="size-5" /></div><p className="text-sm font-medium text-[#36525a]">No encontramos documentos con esos filtros</p><p className="mt-1 text-sm text-[#84959a]">Prueba con el número, proveedor, NIT, CUFE o limpia la búsqueda.</p></div>}
          </div>
        </Card>
      </div>
    )
  }

  function renderTrackingView() {
    const openInvoices = invoices.filter((invoice) => invoice.stage !== "Archivada")
    const stageLabel: Record<Role, string> = {
      Administrador: "Administración",
      Radicador: "Radicación",
      Aprobador: "Aprobación",
      Contabilidad: "Contabilidad",
      "Rechazos DIAN manuales": "Rechazo manual DIAN",
      Tesorería: "Tesorería",
      Legalizaciones: "Legalizaciones",
    }
    const returns = invoices.flatMap((invoice) => (invoice.returnEvents ?? []).map((event) => ({ ...event, invoice })))
    const returnCounts = Array.from(new Set(returns.map((item) => item.category)))
      .map((category) => ({ category, count: returns.filter((item) => item.category === category).length }))
      .sort((a, b) => b.count - a.count)
    const workflowRows = invoices.flatMap((invoice) => (invoice.workflowVisits ?? []).map((visit, index) => ({ invoice, visit, index }))).sort((a, b) => a.visit.startedAt.localeCompare(b.visit.startedAt))
    const thresholdSeconds = Number(trackingThresholdHours) * 60 * 60
    const globalMatches = invoices.map((invoice) => {
      const visits = (invoice.workflowVisits ?? []).filter((visit) => visit.role === trackingProcess)
      const totalSeconds = visits.reduce((total, visit) => total + (visit.durationSeconds ?? Math.max(0, Math.floor((Date.now() - new Date(visit.startedAt).getTime()) / 1000))), 0)
      return { invoice, totalSeconds }
    }).filter((item) => item.totalSeconds > thresholdSeconds).sort((a, b) => b.totalSeconds - a.totalSeconds)
    const queueCards = [
      { label: "Todos los documentos abiertos", role: "Todos" as const, count: openInvoices.length, tone: "bg-[#edf3f4] text-[#557079]" },
      { label: "Documentos sin asignar", role: "Radicador" as Role, count: openInvoices.filter((invoice) => invoice.currentRole === "Radicador").length, tone: "bg-[#e8f6f3] text-[#147c70]" },
      { label: "Documentos por aprobar", role: "Aprobador" as Role, count: openInvoices.filter((invoice) => invoice.currentRole === "Aprobador").length, tone: "bg-[#eef7f7] text-[#3f6870]" },
      { label: "Documentos en Contabilidad", role: "Contabilidad" as Role, count: openInvoices.filter((invoice) => invoice.currentRole === "Contabilidad").length, tone: "bg-[#fff1e5] text-[#b55d25]" },
      { label: "Documentos en Tesorería", role: "Tesorería" as Role, count: openInvoices.filter((invoice) => invoice.currentRole === "Tesorería").length, tone: "bg-[#f4f1ff] text-[#62529b]" },
      { label: "Documentos en otras bandejas", role: "Legalizaciones" as Role, count: openInvoices.filter((invoice) => invoice.currentRole === "Legalizaciones" || invoice.currentRole === "Rechazos DIAN manuales").length, tone: "bg-[#faf8ff] text-[#62529b]" },
    ]
    const filteredQueueInvoices = trackingQueueFilter === "Todos" ? openInvoices : trackingQueueFilter === "Legalizaciones" ? openInvoices.filter((invoice) => invoice.currentRole === "Legalizaciones" || invoice.currentRole === "Rechazos DIAN manuales") : openInvoices.filter((invoice) => invoice.currentRole === trackingQueueFilter)
    const selectedQueueLabel = queueCards.find((card) => card.role === trackingQueueFilter)?.label ?? "Documentos abiertos"
    return (
      <div className="space-y-5">
        <div>
          <p className="text-sm font-semibold text-[#36525a]">Seguimiento de gestión</p>
          <p className="mt-1 text-sm leading-6 text-[#84959a]">Consulta cuánto tiempo lleva cada documento en su etapa actual y quién lo tiene asignado. No se calculan promedios ni tiempos objetivo.</p>
        </div>
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-[#84959a]">Selecciona qué documentos deseas revisar</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {queueCards.map((card) => (
            <button key={card.label} type="button" onClick={() => setTrackingQueueFilter(card.role)} className={"rounded-2xl border bg-white p-4 text-left shadow-[0_8px_22px_rgb(32_69_77/3%)] transition hover:-translate-y-0.5 hover:border-[#abd6cf] " + (trackingQueueFilter === card.role ? "border-[#147c70] ring-2 ring-[#6ed1c2]/25" : "border-[#dce7e7]")}>
              <p className="text-xs text-[#84959a]">{card.label}</p>
              <p className="mt-2 text-2xl font-semibold text-[#21414b]">{card.count}</p>
              <span className={"mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-medium " + card.tone}>Documentos abiertos</span>
            </button>
          ))}
          </div>
        </div>
        <Card className="overflow-hidden rounded-2xl border-[#dce7e7] py-0 shadow-[0_8px_22px_rgb(32_69_77/3%)]">
          <CardHeader className="border-b border-[#e5eeee] px-5 py-5 sm:px-6"><CardTitle className="text-lg tracking-[-0.02em] text-[#21414b]">{selectedQueueLabel}</CardTitle><p className="mt-1 text-sm text-[#84959a]">Cada documento aparece una sola vez. Haz clic para abrir su información y continuar el circuito.</p></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left"><thead className="bg-[#f8fbfb] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#83949a]"><tr><th className="px-5 py-3">Documento</th><th className="px-4 py-3">Etapa</th><th className="px-4 py-3">Responsable</th><th className="px-4 py-3">Vencimiento</th><th className="px-4 py-3">Tiempo actual</th></tr></thead><tbody className="divide-y divide-[#edf2f2]">{filteredQueueInvoices.map((invoice) => <tr key={invoice.id} onClick={() => loadInvoice(invoice)} className="cursor-pointer bg-white transition hover:bg-[#f7fbfa]"><td className="px-5 py-4"><p className="text-sm font-semibold text-[#21414b]">{invoice.number}</p><p className="mt-0.5 text-xs text-[#84959a]">{invoice.supplier}</p></td><td className="px-4 py-4 text-sm text-[#36525a]">{stageLabel[invoice.currentRole]}</td><td className="px-4 py-4 text-sm text-[#36525a]">{invoice.assignedTo || "Sin asignar"}</td><td className="px-4 py-4 text-sm text-[#36525a]">{formatDate(invoice.dueDate)}</td><td className="px-4 py-4 text-sm font-semibold text-[#147c70]">{formatElapsedSince(invoice.stageEnteredAt)}</td></tr>)}</tbody></table>
            {filteredQueueInvoices.length === 0 && <div className="px-6 py-10 text-center text-sm text-[#84959a]">No hay documentos en esta bandeja.</div>}
          </div>
        </Card>
        <Card className="rounded-2xl border-[#dce7e7] py-0 shadow-[0_8px_22px_rgb(32_69_77/3%)]">
          <CardHeader className="border-b border-[#e5eeee] px-5 py-5 sm:px-6">
            <CardTitle className="text-lg tracking-[-0.02em] text-[#21414b]">Consulta global de tiempos</CardTitle>
            <p className="mt-1 text-sm leading-6 text-[#84959a]">Haz una consulta puntual sin establecer un tiempo objetivo. Cada documento se cuenta una sola vez y se acumulan sus permanencias en la etapa seleccionada.</p>
          </CardHeader>
          <div className="p-5 sm:p-6">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#557079]">Etapa analizada</label>
                <Select value={trackingProcess} onValueChange={(value) => setTrackingProcess(value as Role)}>
                  <SelectTrigger className="h-10 rounded-xl border-[#d7e4e4] bg-[#fbfdfd] text-sm text-[#36525a] shadow-none"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["Radicador", "Aprobador", "Contabilidad", "Rechazos DIAN manuales", "Tesorería", "Legalizaciones"] as Role[]).map((option) => <SelectItem key={option} value={option}>{stageLabel[option]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#557079]">Más de</label>
                <Select value={trackingThresholdHours} onValueChange={setTrackingThresholdHours}>
                  <SelectTrigger className="h-10 rounded-xl border-[#d7e4e4] bg-[#fbfdfd] text-sm text-[#36525a] shadow-none"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4">4 horas</SelectItem>
                    <SelectItem value="8">8 horas</SelectItem>
                    <SelectItem value="24">1 día</SelectItem>
                    <SelectItem value="48">2 días</SelectItem>
                    <SelectItem value="72">3 días</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-xl bg-[#e8f6f3] px-4 py-2.5 md:min-w-[180px]">
                <p className="text-xs text-[#147c70]">Documentos encontrados</p>
                <p className="mt-0.5 text-2xl font-semibold text-[#12675f]">{globalMatches.length}</p>
              </div>
            </div>
            {globalMatches.length > 0 ? <div className="mt-4 space-y-2">{globalMatches.map(({ invoice, totalSeconds }) => <button key={invoice.id} type="button" onClick={() => loadInvoice(invoice)} className="flex w-full flex-col gap-1 rounded-xl border border-[#dce7e7] bg-[#fbfdfd] px-4 py-3 text-left transition hover:border-[#abd6cf] hover:bg-[#f5fbf9] sm:flex-row sm:items-center sm:justify-between"><span><span className="text-sm font-semibold text-[#21414b]">{invoice.number}</span><span className="ml-2 text-sm text-[#557079]">{invoice.supplier}</span></span><span className="text-sm font-semibold text-[#a34b18]">{formatDurationSeconds(totalSeconds)} en {stageLabel[trackingProcess]}</span></button>)}</div> : <div className="mt-4 rounded-xl border border-dashed border-[#dce7e7] bg-[#fbfdfd] px-4 py-4 text-sm text-[#84959a]">No hay documentos que superen este umbral en la etapa seleccionada.</div>}
          </div>
        </Card>
        <Card className="overflow-hidden rounded-2xl border-[#dce7e7] py-0 shadow-[0_8px_22px_rgb(32_69_77/3%)]">
          <CardHeader className="border-b border-[#e5eeee] px-5 py-5 sm:px-6">
            <CardTitle className="text-lg tracking-[-0.02em] text-[#21414b]">Detalle de permanencias</CardTitle>
            <p className="mt-1 text-sm text-[#84959a]">Cada fila representa una permanencia del documento con un responsable. Si fue devuelto, el recorrido anterior se conserva.</p>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left">
              <thead className="bg-[#f8fbfb] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#83949a]"><tr><th className="px-5 py-3">Documento</th><th className="px-4 py-3">Etapa</th><th className="px-4 py-3">Responsable</th><th className="px-4 py-3">Tiempo con el responsable</th><th className="px-4 py-3">Situación</th></tr></thead>
              <tbody className="divide-y divide-[#edf2f2]">
                {workflowRows.map(({ invoice, visit, index }) => (
                  <tr key={`${invoice.id}-${index}`} className="bg-white">
                    <td className="px-5 py-4"><p className="text-sm font-semibold text-[#21414b]">{invoice.number}</p><p className="mt-0.5 text-xs text-[#84959a]">{invoice.supplier}</p></td>
                    <td className="px-4 py-4"><p className="text-sm font-medium text-[#36525a]">{stageLabel[visit.role]}</p><p className="mt-0.5 text-xs text-[#84959a]">{visit.endedAt ? "Etapa completada" : invoice.stage}</p></td>
                    <td className="px-4 py-4 text-sm text-[#36525a]">{visit.user}</td>
                    <td className="px-4 py-4"><p className="text-sm font-semibold text-[#147c70]">{visit.endedAt ? formatDurationSeconds(visit.durationSeconds) : formatElapsedSince(visit.startedAt)}</p><p className="mt-0.5 text-xs text-[#84959a]">Desde {formatDate(visit.startedAt)}</p></td>
                    <td className="max-w-[300px] px-4 py-4 text-sm leading-5 text-[#557079]">{visit.endedAt ? "El documento avanzó a la siguiente etapa" : invoice.lastMovement || "En gestión"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {workflowRows.length === 0 && <div className="px-6 py-12 text-center text-sm text-[#84959a]">No hay permanencias registradas para seguimiento.</div>}
          </div>
        </Card>
        <Card className="overflow-hidden rounded-2xl border-[#dce7e7] py-0 shadow-[0_8px_22px_rgb(32_69_77/3%)]">
          <CardHeader className="border-b border-[#e5eeee] px-5 py-5 sm:px-6"><CardTitle className="text-lg tracking-[-0.02em] text-[#21414b]">Devoluciones por motivo</CardTitle><p className="mt-1 text-sm text-[#84959a]">Cada devolución exige una categoría y un comentario para facilitar el seguimiento.</p></CardHeader>
          <div className="p-5 sm:p-6">
            {returnCounts.length > 0 ? <div className="space-y-2">{returnCounts.map((item) => <div key={item.category} className="flex items-center justify-between gap-4 rounded-xl bg-[#fff8f2] px-4 py-3"><span className="text-sm text-[#7e421f]">{item.category}</span><span className="rounded-full bg-[#f3dfcf] px-2.5 py-1 text-sm font-semibold text-[#a34b18]">{item.count}</span></div>)}</div> : <div className="rounded-xl border border-dashed border-[#dce7e7] bg-[#fbfdfd] px-4 py-5 text-sm text-[#84959a]">Aún no hay devoluciones registradas.</div>}
          </div>
        </Card>
      </div>
    )
  }

  function renderDocuments(invoice: Invoice) {
    const isSupportDocument = /cuenta de cobro|documento soporte/i.test(invoice.documentType || "")
    const documents = [
      ...invoice.sourceFiles.map((name) => {
        const isPdf = name.toLowerCase().endsWith(".pdf")
        const isXml = name.toLowerCase().endsWith(".xml")
        return {
          name,
          url: isPdf ? invoice.pdfUrl || invoice.sourceFileUrls?.[name] : isXml ? invoice.xmlUrl || invoice.sourceFileUrls?.[name] : invoice.supportFileUrls?.[name],
          label: isPdf ? (isSupportDocument ? "Cuenta de cobro o documento soporte en PDF" : "Factura original en PDF") : isXml ? "Archivo estructurado de la factura" : "Soporte adicional recibido",
          kind: isPdf ? "pdf" : isXml ? "xml" : "support",
        }
      }),
      ...(invoice.supportFiles ?? [])
        .filter((name) => !invoice.sourceFiles.includes(name))
        .map((name) => ({
          name,
          url: invoice.supportFileUrls?.[name],
          label: "Soporte adicional recibido",
          kind: "support",
        })),
    ]
    return (
      <div className="space-y-2">
        {documents.map((document) => (
          <div key={document.name} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e0ebeb] bg-[#fbfdfd] p-3">
            <span className={"flex size-8 shrink-0 items-center justify-center rounded-lg " + (document.kind === "pdf" ? "bg-[#fff1e5] text-[#b55d25]" : document.kind === "xml" ? "bg-[#eef0fb] text-[#6b63a6]" : "bg-[#e8f6f3] text-[#147c70]")}>
              {document.kind === "pdf" ? <FileText className="size-4" /> : <Paperclip className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-medium text-[#36525a]">{document.name}</p>
              <p className="text-xs text-[#84959a]">{document.label}</p>
            </div>
            {document.url ? (
              <a href={document.url} download className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[#147c70] hover:underline">
                <Download className="size-3.5" />
                Descargar
              </a>
            ) : (
              <span className="shrink-0 text-xs text-[#9aabad]">No disponible</span>
            )}
          </div>
        ))}
      </div>
    )
  }

  function renderPdfPreview(invoice: Invoice) {
    if (!invoice.pdfUrl) return null
    const previewHeight = Math.max(520, Math.round(760 * pdfZoom))
    return (
      <div className="mt-4 overflow-hidden rounded-xl border border-[#cfe3e5] bg-[#f3fafb]">
        <div className="flex flex-col gap-3 border-b border-[#d6e8e8] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#36525a]">Previsualización de la factura</p>
            <p className="mt-1 text-xs leading-5 text-[#688187]">Revisa todas las páginas aquí sin descargar el PDF. Usa los controles para ajustar el tamaño.</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={() => changePdfZoom(-0.1)} disabled={pdfZoom <= 0.75} className="flex size-9 items-center justify-center rounded-lg border border-[#cfe3e5] bg-white text-[#36525a] transition hover:bg-[#eef8f5] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Alejar PDF" title="Alejar">
              <ZoomOut className="size-4" />
            </button>
            <span className="min-w-[52px] text-center text-xs font-semibold text-[#36525a]">{Math.round(pdfZoom * 100)}%</span>
            <button type="button" onClick={() => changePdfZoom(0.1)} disabled={pdfZoom >= 1.75} className="flex size-9 items-center justify-center rounded-lg border border-[#cfe3e5] bg-white text-[#36525a] transition hover:bg-[#eef8f5] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Acercar PDF" title="Acercar">
              <ZoomIn className="size-4" />
            </button>
            <button type="button" onClick={() => setPdfZoom(1)} className="ml-1 rounded-lg border border-transparent px-2.5 py-2 text-xs font-semibold text-[#147c70] transition hover:bg-white" aria-label="Restablecer tamaño del PDF">Restablecer</button>
          </div>
        </div>
        <div className="h-[560px] overflow-auto bg-[#e7eeee] p-2 sm:h-[760px]">
          <div className="min-w-full rounded-lg bg-white shadow-sm" style={{ height: previewHeight }}>
            <iframe
              title={`Previsualización PDF de ${invoice.number}`}
              src={`${invoice.pdfUrl}#toolbar=1&navpanes=0&view=FitH`}
              className="block origin-top-left border-0 bg-white"
              style={{ width: "100%", height: "760px", transform: `scale(${pdfZoom})`, transformOrigin: "top left" }}
            />
          </div>
        </div>
      </div>
    )
  }

  function renderDecisionForm() {
    if (!decisionMode) return null
    const title =
      decisionMode === "return"
        ? "Motivo de devolución al Radicador"
        : decisionMode === "returnToApprover"
          ? "Motivo de devolución al Aprobador"
          : decisionMode === "returnToAccounting"
            ? "Motivo de devolución a Contabilidad"
            : "Motivo para enviar a rechazo manual"
    const action =
      decisionMode === "return"
        ? "Devolver al Radicador"
        : decisionMode === "returnToApprover"
          ? "Devolver al Aprobador"
          : decisionMode === "returnToAccounting"
            ? "Devolver a Contabilidad"
            : "Enviar a rechazo"
    return (
      <div className="rounded-xl border border-[#e8cdb9] bg-[#fff8f2] p-4">
        <p className="text-sm font-semibold text-[#7e421f]">{title}</p>
        <p className="mt-1 text-xs leading-5 text-[#986642]">Este motivo quedará guardado en el historial del expediente.</p>
        <Select value={decisionReasonCategory} onValueChange={setDecisionReasonCategory}>
          <SelectTrigger className="mt-3 h-10 rounded-xl border-[#e6cdbb] bg-white text-sm text-[#36525a] shadow-none">
            <SelectValue placeholder="Selecciona el motivo principal" />
          </SelectTrigger>
          <SelectContent>
            {returnReasonOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          value={decisionReason}
          onChange={(event) => setDecisionReason(event.target.value)}
          placeholder="Amplía el motivo, si es necesario"
          className="mt-2 h-10 rounded-xl border-[#e6cdbb] bg-white text-sm shadow-none focus-visible:ring-[#efb47f]/50"
          aria-label={title}
        />
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setDecisionMode(null)} className="h-9 rounded-xl text-sm text-[#6d7475]">
            Cancelar
          </Button>
          <Button type="button" onClick={submitDecision} className="h-9 rounded-xl bg-[#a34b18] text-sm text-white hover:bg-[#873d13]">
            {action}
          </Button>
        </div>
      </div>
    )
  }

  function renderExpanded(invoice: Invoice) {
    const recipientOk = matchesRecipientNit(invoice.recipientNit)
    const isCurrentRole = role === invoice.currentRole
    const isCreditNote = (invoice.documentType || "").toLowerCase().includes("nota")
    const isSupportDocument = /cuenta de cobro|documento soporte/i.test(invoice.documentType || "")
    const workflowVisits = invoice.workflowVisits ?? []
    return (
      <div className="border-t border-[#dce9e8] bg-[#fbfdfd] px-5 py-5 sm:px-8">
        <div className="max-w-5xl space-y-5">
          <div className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#147c70]">1 · Datos de la factura</p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#10242e]">{invoice.number}</h2>
                <p className="mt-1 break-words text-sm text-[#667a82]">{invoice.supplier}</p>
              </div>
              <div className="flex items-center gap-2">
                <StageBadge stage={invoice.stage} />
                <button type="button" onClick={() => selectInvoice(invoice)} className="rounded-lg p-1.5 text-[#718089] hover:bg-[#edf5f4]" aria-label="Cerrar detalle">
                  <ChevronDown className="size-5 rotate-180" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 rounded-xl border border-[#dce7e7] bg-white p-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-[#84959a]">Vencimiento</p>
                <p className="mt-1 text-sm font-semibold text-[#294a54]">{formatDate(invoice.dueDate)}</p>
                <p className="mt-1 text-xs text-[#a34b18]">{invoice.dueSource}</p>
              </div>
              <div>
                <p className="text-xs text-[#84959a]">Valor total</p>
                <p className="mt-1 text-sm font-semibold text-[#294a54]">{money.format(invoice.amount).replace(" ", " ")}</p>
              </div>
              <div>
                <p className="text-xs text-[#84959a]">NIT proveedor</p>
                <p className="mt-1 text-sm text-[#36525a]">{invoice.nit}</p>
              </div>
              <div>
                <p className="text-xs text-[#84959a]">Plazo de pago</p>
                <p className="mt-1 text-sm text-[#36525a]">{invoice.paymentTerm ?? "No informado"}</p>
              </div>
              <div className="col-span-2 sm:col-span-4">
                <p className="text-xs text-[#84959a]">CUFE/CUDE</p>
                <p className="mt-1 break-all font-mono text-[11px] text-[#36525a]">{invoice.cufe ?? "No encontrado"}</p>
              </div>
              <div className="col-span-2 sm:col-span-4">
                <p className="text-xs text-[#84959a]">Tipo documental</p>
                <p className="mt-1 break-words text-sm font-semibold text-[#36525a]">{invoice.documentType || "Factura electrónica"}{invoice.documentReference ? ` · Ref. ${invoice.documentReference}` : ""}</p>
              </div>
            </div>

            <div className="rounded-xl border border-[#cfe3e5] bg-[#f3fafb] p-4">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#44767d]"><Inbox className="size-4" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#44767d]">2 · Origen y validación</p>
                  <p className="mt-1.5 break-all text-sm font-semibold text-[#284f57]">facturacionelectronica@cofinet.com.au</p>
                  <p className="mt-1 text-xs leading-5 text-[#688187]">Recibida automáticamente el {invoice.received}. El sistema conserva XML y PDF para revisión humana.</p>
                </div>
                <span className={"inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold " + (recipientOk ? "border-[#cce7e1] bg-white text-[#147c70]" : "border-[#efc7c7] bg-white text-[#b54d4d]")}>
                  {recipientOk ? <ShieldCheck className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
                  {recipientOk ? "NIT válido" : "NIT no coincide"}
                </span>
              </div>
              <div className="mt-3 grid gap-3 border-t border-[#d6e8e8] pt-3 text-xs sm:grid-cols-2">
                <p className="text-[#688187]"><span className="font-semibold text-[#36525a]">Destinatario:</span> {invoice.recipientName}</p>
                <p className="text-[#688187]"><span className="font-semibold text-[#36525a]">NIT leído:</span> {invoice.recipientNit}</p>
                <p className="text-[#688187] sm:col-span-2"><span className="font-semibold text-[#36525a]">Regla:</span> solo se puede radicar si los primeros 9 dígitos coinciden con {expectedRecipientNit}.</p>
                {isSupportDocument && <p className="text-[#688187] sm:col-span-2"><span className="font-semibold text-[#36525a]">Tratamiento:</span> no exige XML. El PDF y sus anexos se revisan como documento soporte; si genera una obligación se envía a Contabilidad y, si corresponde a una legalización pagada de contado, se envía a Legalizaciones.</p>}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#84959a]">3 · Recorrido del expediente</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-5">
                {[
                  ["1", "Recibida", invoice.currentRole === "Radicador" || invoice.stage !== "Nueva"],
                  ["2", "Asignada", invoice.currentRole !== "Radicador"],
                  ["3", "Revisada", ["Contabilidad", "Tesorería"].includes(invoice.currentRole) || invoice.stage === "Archivada"],
                  ["4", "Pagada", invoice.stage === "Archivada" && Boolean(invoice.paymentProof)],
                  ["5", "Archivada", invoice.stage === "Archivada"],
                ].map(([number, label, complete]) => (
                  <div key={String(label)} className="flex items-center gap-2 rounded-lg border border-[#e1ebeb] bg-white px-3 py-2">
                    <span className={"flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold " + (complete ? "bg-[#d9f2ec] text-[#147c70]" : "bg-[#eef3f4] text-[#8aa0a5]")}>
                      {complete ? <Check className="size-3.5" /> : number}
                    </span>
                    <span className={"text-xs " + (complete ? "font-semibold text-[#36525a]" : "text-[#84959a]")}>{label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-xl border border-[#dce7e7] bg-white p-3">
                <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-[#557079]">Tiempo registrado por bandeja</p><span className="text-[11px] text-[#84959a]">Se actualiza mientras está abierta</span></div>
                {workflowVisits.length > 0 ? <div className="mt-3 space-y-2">{workflowVisits.map((visit, index) => <div key={`${visit.startedAt}-${index}`} className="flex flex-col gap-1 rounded-lg bg-[#f7fbfb] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-xs font-semibold text-[#36525a]">{stageLabelFor(visit.role)} · {visit.user}</p><p className="mt-0.5 text-[11px] text-[#84959a]">{visit.endedAt ? `Completada ${formatDate(visit.endedAt)}` : "En curso"}</p></div><span className={"shrink-0 text-xs font-semibold " + (visit.endedAt ? "text-[#557079]" : "text-[#147c70]")}>{formatDurationSeconds(getVisitSeconds(visit))}</span></div>)}</div> : <p className="mt-2 text-xs text-[#84959a]">Aún no hay permanencias registradas.</p>}
              </div>
            </div>

            <div className="border-t border-[#e5eeee] pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#84959a]">4 · Información de la compra</p>
              <p className="mt-2 text-sm leading-6 text-[#4e6870]">{invoice.description}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-[#f4f8f8] px-3 py-2">
                  <p className="text-xs text-[#84959a]">Área</p>
                  <p className="mt-1 break-words text-sm text-[#36525a]">{invoice.area || "Se registrará según el área del Aprobador"}</p>
                </div>
                <div className="rounded-lg bg-[#f4f8f8] px-3 py-2">
                  <p className="text-xs text-[#84959a]">Centro de costos</p>
                  <p className="mt-1 break-words text-sm text-[#36525a]">{invoice.costCenter || "Pendiente de diligenciar por el Aprobador"}</p>
                </div>
              </div>
              {isCreditNote && (
                <div className="mt-3 rounded-xl border border-[#d8d6ea] bg-[#faf8ff] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#62529b]">Nota crédito · información obligatoria</p>
                  <p className="mt-1 text-xs leading-5 text-[#756ca1]">El Gestor debe indicar qué factura modifica y por qué se originó.</p>
                  {invoice.relatedDocumentReference && <p className="mt-2 text-xs text-[#51458a]"><span className="font-semibold">Factura relacionada:</span> {invoice.relatedDocumentReference}</p>}
                  {invoice.documentReason && <p className="mt-1 break-words text-xs text-[#51458a]"><span className="font-semibold">Motivo registrado:</span> {invoice.documentReason}</p>}
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 space-y-5">
            <div className="rounded-xl border border-[#dce7e7] bg-white p-4">
              <div className="mb-3 flex items-center gap-2"><FileDown className="size-4 text-[#147c70]" /><p className="text-sm font-semibold text-[#36525a]">5 · Documentos y soportes</p></div>
              {renderDocuments(invoice)}
              {renderPdfPreview(invoice)}
              {invoice.supportFiles && invoice.supportFiles.length > 0 && <p className="mt-3 rounded-lg bg-[#eef8f5] px-3 py-2 text-xs font-medium text-[#147c70]">{invoice.supportFiles.length} soporte{invoice.supportFiles.length === 1 ? "" : "s"} adicional{invoice.supportFiles.length === 1 ? "" : "es"} guardado{invoice.supportFiles.length === 1 ? "" : "s"} en el expediente y disponible{invoice.supportFiles.length === 1 ? "" : "s"} para el siguiente rol.</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#e8efef] pt-3">
                <label htmlFor={"support-" + invoice.id} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-[#c6d9d8] px-3 py-2 text-xs font-semibold text-[#147c70] hover:bg-[#f2f9f7]">
                  <Upload className="size-3.5" />
                  Subir soporte
                </label>
                <input
                  id={"support-" + invoice.id}
                  type="file"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    setSupportDraft(file ?? null)
                  }}
                />
                {supportDraft && (
                  <>
                    <span className="max-w-[180px] truncate text-xs text-[#718089]">{supportDraft.name}</span>
                    <Button type="button" onClick={saveSupport} disabled={savingFile} variant="outline" className="h-8 rounded-lg border-[#d7e4e4] px-2.5 text-xs text-[#36525a]">Guardar soporte</Button>
                  </>
                )}
              </div>
            </div>

            {(invoice.internalReturnReason || invoice.accountingReturnReason || invoice.treasuryReturnReason || invoice.rejectionReason) && <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#84959a]">Motivos registrados</p>}
            {invoice.internalReturnReason && (
              <div className="min-w-0 rounded-xl border border-[#e8cdb9] bg-[#fff8f2] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#a34b18]">Devolución interna al Radicador</p>
                <p className="mt-1.5 break-words text-sm leading-5 text-[#7e421f]">{invoice.internalReturnReason}</p>
              </div>
            )}
            {invoice.accountingReturnReason && (
              <div className="min-w-0 rounded-xl border border-[#e8cdb9] bg-[#fff8f2] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#a34b18]">Devolución de Contabilidad al Aprobador</p>
                <p className="mt-1.5 break-words text-sm leading-5 text-[#7e421f]">{invoice.accountingReturnReason}</p>
              </div>
            )}
            {invoice.treasuryReturnReason && (
              <div className="min-w-0 rounded-xl border border-[#d8d6ea] bg-[#faf8ff] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#62529b]">Devolución de Tesorería a Contabilidad</p>
                <p className="mt-1.5 break-words text-sm leading-5 text-[#51458a]">{invoice.treasuryReturnReason}</p>
              </div>
            )}
            {invoice.rejectionReason && (
              <div className="min-w-0 rounded-xl border border-[#efc7c7] bg-[#fff1f1] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#b54d4d]">Motivo de rechazo manual</p>
                <p className="mt-1.5 break-words text-sm leading-5 text-[#7f3f3f]">{invoice.rejectionReason}</p>
              </div>
            )}

            {isCurrentRole && role === "Radicador" && invoice.stage !== "Archivada" && (
              <div className="rounded-xl border border-[#dce7e7] bg-white p-4">
                <p className="text-sm font-semibold text-[#36525a]">6 · Asignar al Aprobador</p>
                <p className="mt-1 text-xs leading-5 text-[#84959a]">La asignación solo está disponible cuando el NIT del destinatario es válido.</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <label htmlFor={"assignment-" + invoice.id} className="mb-1.5 block text-xs font-semibold text-[#557079]">Aprobador responsable <span className="text-[#b54d4d]">*</span></label>
                    <Select value={assignment} onValueChange={setAssignment}>
                      <SelectTrigger id={"assignment-" + invoice.id} className="h-10 rounded-xl border-[#d7e4e4] bg-[#fbfdfd] text-sm text-[#36525a] shadow-none"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {approvers.map((approver) => (
                          <SelectItem key={approver.email} value={approver.email}>
                            {approver.email}{approver.area ? ` · ${approver.area}` : ""}{approver.costCenter ? ` · ${approver.costCenter}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={assignInvoice} disabled={!recipientOk || !assignment} className="h-10 rounded-xl bg-[#147c70] px-4 text-white hover:bg-[#10685f] disabled:cursor-not-allowed disabled:opacity-50">
                    <Send className="size-4" />
                    Radicar y asignar
                  </Button>
                </div>
              </div>
            )}

            {isCurrentRole && role === "Aprobador" && invoice.stage !== "Archivada" && (
              <div className="space-y-3 rounded-xl border border-[#dce7e7] bg-white p-4">
                <div><p className="text-sm font-semibold text-[#36525a]">6 · Decisión del Aprobador</p><p className="mt-1 text-xs leading-5 text-[#84959a]">El área se muestra automáticamente según la persona asumida. Solo debes seleccionar el centro de costos.</p></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[#d7e4e4] bg-[#f7fbfb] px-3 py-2.5">
                    <p className="text-xs text-[#84959a]">Área del Aprobador</p>
                    <p className="mt-1 text-sm font-semibold text-[#36525a]">{activeApproverProfile.area}</p>
                    <p className="mt-1 text-xs text-[#84959a]">Asociada a {activeUser}</p>
                  </div>
                  <div className="min-w-0">
                    <label htmlFor={"cost-center-" + invoice.id} className="mb-1.5 block text-xs font-semibold text-[#557079]">Centro de costos <span className="text-[#b54d4d]">*</span></label>
                    <Select value={costCenterDraft} onValueChange={setCostCenterDraft}>
                      <SelectTrigger id={"cost-center-" + invoice.id} className="h-10 rounded-xl border-[#d7e4e4] bg-[#fbfdfd] text-sm text-[#36525a] shadow-none"><SelectValue placeholder="Seleccionar centro de costos" /></SelectTrigger>
                      <SelectContent>
                        {costCenterOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {isCreditNote && (
                  <div className="rounded-xl border border-[#d8d6ea] bg-[#faf8ff] p-3">
                    <p className="text-xs font-semibold text-[#62529b]">Datos de la nota crédito</p>
                    <p className="mt-1 text-xs leading-5 text-[#756ca1]">Antes de enviarla a Contabilidad, registra la factura que modifica y la razón del ajuste.</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor={"related-document-" + invoice.id} className="mb-1.5 block text-xs font-semibold text-[#557079]">Factura relacionada <span className="text-[#b54d4d]">*</span></label>
                        <Input id={"related-document-" + invoice.id} value={relatedDocumentDraft} onChange={(event) => setRelatedDocumentDraft(event.target.value)} placeholder="Ej. FELM-8510" className="h-10 rounded-xl border-[#d7e4e4] bg-white text-sm shadow-none focus-visible:ring-[#6ed1c2]/40" />
                      </div>
                      <div>
                        <label htmlFor={"document-reason-" + invoice.id} className="mb-1.5 block text-xs font-semibold text-[#557079]">Motivo del ajuste <span className="text-[#b54d4d]">*</span></label>
                        <Input id={"document-reason-" + invoice.id} value={documentReasonDraft} onChange={(event) => setDocumentReasonDraft(event.target.value)} placeholder="Explica por qué se originó" className="h-10 rounded-xl border-[#d7e4e4] bg-white text-sm shadow-none focus-visible:ring-[#6ed1c2]/40" />
                      </div>
                    </div>
                    <Button type="button" onClick={saveDocumentContext} variant="outline" className="mt-3 h-9 rounded-xl border-[#d8d6ea] text-xs text-[#62529b] shadow-none hover:bg-white"><Check className="size-3.5" />Guardar información de la nota</Button>
                  </div>
                )}
                <div className="grid gap-2 pt-1 sm:grid-cols-3">
                  <Button onClick={() => setDecisionMode("return")} variant="outline" className="h-10 rounded-xl border-[#d8e4e4] text-sm text-[#4d6870] shadow-none hover:bg-[#f7fbfb]"><RotateCcw className="size-4" />Devolver al Radicador</Button>
                  <Button onClick={sendToAccounting} variant="outline" className="h-10 rounded-xl border-[#cce7e1] text-sm text-[#147c70] shadow-none hover:bg-[#f0faf7]"><Check className="size-4" />Enviar a Contabilidad</Button>
                  <Button onClick={() => setDecisionMode("rejection")} variant="outline" className="h-10 rounded-xl border-[#efc7c7] text-sm text-[#b54d4d] shadow-none hover:bg-[#fff4f4]"><ShieldAlert className="size-4" />Enviar a rechazo manual</Button>
                </div>
                {renderDecisionForm()}
              </div>
            )}

            {isCurrentRole && role === "Contabilidad" && invoice.stage !== "Archivada" && (
              <div className="space-y-3 rounded-xl border border-[#dce7e7] bg-white p-4">
                <div><p className="text-sm font-semibold text-[#36525a]">Revisión contable</p><p className="mt-1 text-xs leading-5 text-[#84959a]">Registra la causación solo cuando el documento genere una obligación de pago. Si fue un gasto de viaje pagado de contado, envíalo a Legalizaciones.</p></div>
                {isCreditNote && <div className="rounded-xl border border-[#d8d6ea] bg-[#faf8ff] px-3 py-2.5 text-xs text-[#51458a]"><span className="font-semibold">Nota crédito relacionada:</span> {invoice.relatedDocumentReference || "Pendiente de registrar por el Gestor"}. <span className="font-semibold">Motivo:</span> {invoice.documentReason || "Pendiente"}.</div>}
                <label htmlFor={"causation-" + invoice.id} className="text-xs font-semibold text-[#557079]">Documento de causación <span className="text-[#b54d4d]">*</span></label>
                <Input id={"causation-" + invoice.id} value={causationDraft} onChange={(event) => setCausationDraft(event.target.value)} placeholder="Ej. CXP-2026-00984" className="h-10 rounded-xl border-[#d7e4e4] bg-[#fbfdfd] text-sm shadow-none focus-visible:ring-[#6ed1c2]/40" aria-label="Documento de causación" />
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Button onClick={() => setDecisionMode("returnToApprover")} variant="outline" className="h-10 rounded-xl border-[#d8e4e4] text-sm text-[#4d6870] shadow-none hover:bg-[#f7fbfb]"><RotateCcw className="size-4" />Devolver al Aprobador</Button>
                  <Button onClick={saveCausation} variant="outline" className="h-10 rounded-xl border-[#d7e4e4] text-sm text-[#36525a] shadow-none hover:bg-[#f7fbfb]"><Check className="size-4" />Guardar causación</Button>
                  <Button onClick={sendToTreasury} disabled={!invoice.causationDocument} className="h-10 rounded-xl bg-[#147c70] text-white hover:bg-[#10685f] disabled:cursor-not-allowed disabled:opacity-50"><Send className="size-4" />Enviar a Tesorería</Button>
                  <Button onClick={sendToLegalizations} variant="outline" className="h-10 rounded-xl border-[#cce7e1] text-sm text-[#147c70] shadow-none hover:bg-[#f0faf7]"><Archive className="size-4" />Enviar a Legalizaciones</Button>
                </div>
                {invoice.causationDocument && <p className="text-xs font-medium text-[#147c70]">Causación guardada: {invoice.causationDocument}</p>}
                {renderDecisionForm()}
              </div>
            )}

            {isCurrentRole && role === "Legalizaciones" && invoice.stage !== "Archivada" && (
              <div className="space-y-3 rounded-xl border border-[#cce7e1] bg-[#f0faf7] p-4">
                <div><p className="text-sm font-semibold text-[#1b4f4c]">Confirmar documento de legalización</p><p className="mt-1 text-xs leading-5 text-[#5d797b]">Este expediente no genera CxP porque el gasto fue pagado de contado como parte de una legalización de viaje. Registra dónde quedó soportado y envíalo a Archivo.</p></div>
                <label htmlFor={"legalization-" + invoice.id} className="text-xs font-semibold text-[#557079]">Documento de legalización <span className="text-[#b54d4d]">*</span></label>
                <Input id={"legalization-" + invoice.id} value={legalizationDraft} onChange={(event) => setLegalizationDraft(event.target.value)} placeholder="Ej. LEG-2026-0042" className="h-10 rounded-xl border-[#cce7e1] bg-white text-sm shadow-none focus-visible:ring-[#6ed1c2]/40" />
                <Button onClick={confirmLegalization} className="h-10 rounded-xl bg-[#147c70] text-white hover:bg-[#10685f]"><Archive className="size-4" />Confirmar y enviar a Archivo</Button>
                {invoice.legalizationDocument && <p className="text-xs font-medium text-[#147c70]">Documento registrado: {invoice.legalizationDocument}</p>}
              </div>
            )}

            {isCurrentRole && role === "Rechazos DIAN manuales" && invoice.stage === "Por rechazar" && (
              <div className="space-y-3 rounded-xl border border-[#efc7c7] bg-[#fff7f7] p-4">
                <div><p className="text-sm font-semibold text-[#7f3f3f]">Completar rechazo manual</p><p className="mt-1 text-xs leading-5 text-[#9a5b5b]">Realiza el rechazo directamente en la DIAN y adjunta aquí el certificado o soporte.</p></div>
                <label htmlFor={"rejection-" + invoice.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-[#e2bebe] bg-white px-3 py-3 text-sm text-[#7f3f3f]">
                  <span className="flex min-w-0 items-center gap-2"><Upload className="size-4 shrink-0" /><span className="truncate">{rejectionCertificateDraft || "Seleccionar certificado de rechazo"}</span></span>
                  <span className="text-xs font-semibold text-[#b54d4d]">Examinar</span>
                </label>
                <input id={"rejection-" + invoice.id} type="file" accept=".pdf,.png,.jpg,.jpeg" className="sr-only" onChange={(event) => { const file = event.target.files?.[0] ?? null; setRejectionCertificateUpload(file); setRejectionCertificateDraft(file?.name ?? "") }} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button onClick={saveRejectionCertificate} disabled={savingFile || !rejectionCertificateUpload} variant="outline" className="h-10 rounded-xl border-[#e2bebe] text-sm text-[#7f3f3f] shadow-none hover:bg-white"><Paperclip className="size-4" />Guardar certificado</Button>
                  <Button onClick={archiveRejectedInvoice} disabled={!invoice.rejectionCertificate} className="h-10 rounded-xl bg-[#b54d4d] text-white hover:bg-[#963d3d] disabled:cursor-not-allowed disabled:opacity-50"><Archive className="size-4" />Enviar a Archivo</Button>
                </div>
                {invoice.rejectionCertificate && <p className="text-xs font-medium text-[#7f3f3f]">Certificado guardado: <a href={invoice.rejectionCertificateUrl} target="_blank" rel="noreferrer" className="underline">{invoice.rejectionCertificate}</a></p>}
              </div>
            )}

            {isCurrentRole && role === "Tesorería" && invoice.stage === "En pago" && (
              <div className="space-y-3 rounded-xl border border-[#d9d2f2] bg-[#faf8ff] p-4">
                <div><p className="text-sm font-semibold text-[#51458a]">Cerrar el pago</p><p className="mt-1 text-xs leading-5 text-[#756ca1]">La factura permanece en Tesorería hasta guardar el comprobante y archivarla.</p></div>
                <label htmlFor={"payment-" + invoice.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-[#cfc7eb] bg-white px-3 py-3 text-sm text-[#51458a]">
                  <span className="flex min-w-0 items-center gap-2"><Upload className="size-4 shrink-0" /><span className="truncate">{paymentProofDraft || "Seleccionar comprobante de pago"}</span></span>
                  <span className="text-xs font-semibold text-[#62529b]">Examinar</span>
                </label>
                <input id={"payment-" + invoice.id} type="file" accept=".pdf,.png,.jpg,.jpeg" className="sr-only" onChange={(event) => { const file = event.target.files?.[0] ?? null; setPaymentProofUpload(file); setPaymentProofDraft(file?.name ?? "") }} />
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button onClick={() => setDecisionMode("returnToAccounting")} variant="outline" className="h-10 rounded-xl border-[#d8d6ea] text-sm text-[#51458a] shadow-none hover:bg-white"><RotateCcw className="size-4" />Devolver a Contabilidad</Button>
                  <Button onClick={savePaymentProof} disabled={savingFile || !paymentProofUpload} variant="outline" className="h-10 rounded-xl border-[#cfc7eb] text-sm text-[#51458a] shadow-none hover:bg-white"><Paperclip className="size-4" />Guardar comprobante</Button>
                  <Button onClick={archivePaidInvoice} disabled={!invoice.paymentProof} className="h-10 rounded-xl bg-[#62529b] text-white hover:bg-[#51458a] disabled:cursor-not-allowed disabled:opacity-50"><Archive className="size-4" />Archivar expediente</Button>
                </div>
                {invoice.paymentProof && <p className="text-xs font-medium text-[#51458a]">Comprobante guardado: <a href={invoice.paymentProofUrl} target="_blank" rel="noreferrer" className="underline">{invoice.paymentProof}</a></p>}
                {renderDecisionForm()}
              </div>
            )}

            {role === "Administrador" && (
              <div className="rounded-xl border border-[#cce7e1] bg-[#f0faf7] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#147c70]">Vista de administrador</p>
                <p className="mt-1.5 text-sm font-semibold text-[#1b4f4c]">Esta factura está actualmente en {invoice.currentRole}.</p>
                <p className="mt-1 text-xs leading-5 text-[#5d797b]">Cambia la Vista en la parte superior para continuar la tarea con ese rol.</p>
              </div>
            )}

            <div className="rounded-xl border border-[#dce7e7] bg-white p-4">
              <div className="flex items-center gap-2"><MessageSquare className="size-4 text-[#147c70]" /><p className="text-sm font-semibold text-[#36525a]">7 · Comentarios e historial</p></div>
              <div className="mt-3 flex gap-2">
                <Input value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder="Agregar un comentario opcional" className="h-10 rounded-xl border-[#d7e4e4] bg-[#fbfdfd] text-sm shadow-none focus-visible:ring-[#6ed1c2]/40" aria-label="Comentario" />
                <Button onClick={addComment} className="h-10 rounded-xl bg-[#147c70] px-3 text-white hover:bg-[#10685f]" aria-label="Agregar comentario"><Send className="size-4" /></Button>
              </div>
              {invoice.comments.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {invoice.comments.map((comment) => (
                    <div key={comment.id} className="rounded-lg bg-[#f4f8f8] px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-[#36525a]">{comment.author} · {comment.role}</p><span className="text-[11px] text-[#84959a]">{comment.date}</span></div>
                      <p className="mt-1 text-sm leading-5 text-[#4e6870]">{comment.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-[#84959a]">Aún no hay comentarios. Cualquier rol puede dejar contexto adicional.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[#f4f7f7] text-[#10242e]">
      <div className="flex min-h-screen">
        <aside className={(mobileNav ? "translate-x-0" : "-translate-x-full") + " fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col border-r border-white/10 bg-[#0d2833] text-white transition-transform lg:static lg:translate-x-0"}>
          <div className="flex h-[78px] items-center gap-3 border-b border-white/10 px-6">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#6ed1c2] text-[#0d2833] shadow-[0_8px_20px_rgb(110_209_194/22%)]"><FileCheck2 className="size-5" strokeWidth={2.4} /></div>
            <div><p className="text-[15px] font-semibold tracking-tight">Gestión de facturas</p><p className="text-xs text-[#a5c4c4]">Aplicativo interno</p></div>
            <button onClick={() => setMobileNav(false)} className="ml-auto rounded-lg p-1 text-white/60 hover:bg-white/10 lg:hidden" aria-label="Cerrar menú"><X className="size-5" /></button>
          </div>
          <div className="flex-1 px-3 py-6">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7fa5a7]">Bandejas</p>
            <nav className="space-y-1" aria-label="Navegación principal">
              {config.nav.map((label, index) => {
                const tab = navigationTab(label, role)
                const active = activeTab === tab
                const showCount = !["Resumen", "Indicadores", "Consulta"].includes(label)
                const navInvoices = role === "Administrador" ? invoices : roleInvoices
                const navCount = navInvoices.filter((invoice) => matchesTab(invoice, role, tab)).length
                return (
                  <button key={label} onClick={() => { setActiveTab(tab); setExpandedId(null); setMobileNav(false) }} className={"flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition " + (active ? "bg-[#164552] text-white shadow-inner" : "text-[#b6cccc] hover:bg-white/7 hover:text-white")}>
                    <span className={"flex size-5 items-center justify-center " + (active ? "text-[#77d5c7]" : "text-[#83a8ab]")}>
                      {index === 0 ? <Inbox className="size-[18px]" /> : index === config.nav.length - 1 ? <Archive className="size-[17px]" /> : <FileText className="size-[17px]" />}
                    </span>
                    <span className="flex-1">{label}</span>
                    {showCount && <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + (active ? "bg-[#6ed1c2] text-[#0d2833]" : "bg-white/10 text-[#b6cccc]")}>{navCount}</span>}
                  </button>
                )
              })}
            </nav>
          </div>
          <div className="border-t border-white/10 p-4">
            <div className="flex items-center gap-3 rounded-xl bg-white/7 px-3 py-3">
              <div className="flex size-9 items-center justify-center rounded-full bg-[#e2b27c] text-sm font-bold text-[#49331e]">{avatarLetters(activeUser)}</div>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{activeUser}</p><p className="truncate text-xs text-[#9ebbbb]">{role}</p></div>
              <MoreHorizontal className="size-4 text-[#89aaad]" />
            </div>
          </div>
        </aside>
        {mobileNav && <button aria-label="Cerrar menú" className="fixed inset-0 z-30 bg-[#071b22]/45 lg:hidden" onClick={() => setMobileNav(false)} />}

        <section className="min-w-0 flex-1">
          <header className="flex h-[78px] items-center justify-between border-b border-[#dce7e7] bg-white px-5 sm:px-8">
            <div className="flex items-center gap-3">
              <button onClick={() => setMobileNav(true)} className="rounded-lg p-2 text-[#557079] hover:bg-[#eef4f4] lg:hidden" aria-label="Abrir menú"><Menu className="size-5" /></button>
              <div className="hidden items-center gap-2 text-sm text-[#718089] sm:flex"><span>Gestión de facturas</span><ChevronRight className="size-4" /><span className="font-medium text-[#10242e]">{pageTitle}</span></div>
              <span className="text-sm font-medium text-[#10242e] sm:hidden">{pageTitle}</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="hidden items-center gap-2 rounded-xl border border-[#d7e4e4] bg-[#fbfdfd] px-2.5 py-1.5 sm:flex">
                <UserRound className="size-4 text-[#6d8a8c]" />
                <span className="text-xs font-semibold text-[#31515a]">{activeUser} · {role}</span>
              </div>
              <button className="relative rounded-xl p-2 text-[#557079] hover:bg-[#eef4f4]" aria-label="Notificaciones"><Bell className="size-5" /><span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[#ef8a4d] ring-2 ring-white" /></button>
              <div className="hidden h-7 w-px bg-[#dce7e7] sm:block" />
              <div className="flex items-center gap-2.5"><div className="flex size-8 items-center justify-center rounded-full bg-[#e2b27c] text-xs font-bold text-[#49331e]">{avatarLetters(activeUser)}</div><span className="hidden text-sm font-medium text-[#314a54] sm:block">{activeUser}</span></div>
            </div>
          </header>

          <div className="mx-auto max-w-[1480px] px-5 py-7 sm:px-8 sm:py-9">
            <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div><p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-[#197c70]">Operación</p><h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#10242e] sm:text-[32px]">{pageTitle}</h1><p className="mt-1 max-w-2xl text-sm leading-5 text-[#667a82]">{isTrackingView ? "Revisa el tiempo exacto de cada documento en su etapa y responsable." : isConsultationView ? "Localiza cualquier documento y abre su recorrido completo." : config.subtitle}</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={downloadExcel} variant="outline" className="h-10 rounded-xl border-[#d7e4e4] bg-white px-3.5 text-sm text-[#557079] shadow-none hover:bg-[#f2f7f7]"><FileDown className="size-4" />Descargar relación Excel</Button>
              </div>
            </div>

            <div className="mb-6 flex items-start gap-3 rounded-xl border border-[#cce7e1] bg-[#f0faf7] px-4 py-3.5 text-sm text-[#5d797b]">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#147c70]" />
              <p><span className="font-semibold text-[#1b4f4c]">Control activo:</span> solo se radican documentos con NIT receptor {expectedRecipientNit}. La lista está ordenada por vencimiento.</p>
            </div>

            {(role === "Radicador" || (role === "Administrador" && !isAdminUtilityView)) && (
              <div className="mb-6 flex flex-col gap-4 rounded-xl border border-[#d7e4e4] bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3"><Inbox className="mt-0.5 size-4 shrink-0 text-[#147c70]" /><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#84959a]">Buzón de llegada</p><p className="mt-1 break-all text-sm font-semibold text-[#36525a]">{mailboxState.mailbox}</p><p className="mt-1 text-xs leading-5 text-[#84959a]">ZIP con XML y PDF · cuentas de cobro en PDF.</p><p className={"mt-1.5 break-words text-xs leading-5 " + (mailboxState.configured ? "text-[#147c70]" : "text-[#a34b18]")}>{mailboxState.message}{mailboxState.lastSyncAt ? ` Última revisión: ${formatDate(mailboxState.lastSyncAt)}.` : ""}</p></div></div>
                <Button type="button" onClick={() => void syncMailbox(false)} disabled={syncingMailbox} variant="outline" className="h-10 shrink-0 rounded-xl border-[#cce7e1] bg-[#f7fcfa] px-3.5 text-sm text-[#147c70] shadow-none hover:bg-[#eef8f5] disabled:cursor-wait disabled:opacity-60"><RotateCcw className={"size-4 " + (syncingMailbox ? "animate-spin" : "")} />{syncingMailbox ? "Sincronizando…" : "Sincronizar ahora"}</Button>
              </div>
            )}

            {(role === "Contabilidad" || (role === "Administrador" && !isAdminUtilityView)) && (
              <div className="mb-6 rounded-xl border border-[#d7e4e4] bg-white px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#eef0fb] text-[#62529b]"><FileDown className="size-4" /></div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#62529b]">Revisión contra listado DIAN</p>
                      <p className="mt-1 text-sm font-semibold text-[#36525a]">Carga el Excel descargado de facturas recibidas</p>
                      <p className="mt-1 max-w-3xl text-xs leading-5 text-[#84959a]">El Excel de la DIAN permite identificar faltantes por CUFE. La consulta oficial de XML y la radicación directa están deshabilitadas hasta contar con integración autorizada; los documentos originales se reciben por el buzón.</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <input id="dian-upload" type="file" accept=".xlsx" className="sr-only" onChange={(event) => void handleDianUpload(event.target.files?.[0])} />
                    <label htmlFor="dian-upload" className={"inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-[#d8d6ea] bg-[#faf8ff] px-3.5 text-sm font-medium text-[#62529b] transition hover:bg-[#f3f0ff] " + (dianLoading ? "pointer-events-none opacity-60" : "") }><Upload className="size-4" />{dianLoading ? "Conciliando…" : "Cargar Excel DIAN"}</label>
                    {dianResult && <Button type="button" onClick={downloadDianConciliation} variant="outline" className="h-10 rounded-xl border-[#d7e4e4] px-3.5 text-sm text-[#557079] shadow-none hover:bg-[#f2f7f7]"><FileDown className="size-4" />Descargar informe</Button>}
                  </div>
                </div>
                <div className="mt-4 grid gap-2 border-t border-[#edf2f2] pt-4 sm:grid-cols-4">
                  {[
                    ["1", "Comparar", "Cruce principal por CUFE/CUDE."],
                    ["2", "Validar", `NIT receptor ${expectedRecipientNit}.`],
                    ["3", "Identificar", "Revisar los faltantes por CUFE."],
                    ["4", "Incorporar", "Sincronizar el ZIP original del buzón."],
                  ].map(([number, title, detail]) => (
                    <div key={number} className="min-w-0 rounded-xl bg-[#faf8ff] px-3 py-2.5">
                      <div className="flex items-center gap-2"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#62529b] text-[11px] font-bold text-white">{number}</span><p className="text-xs font-semibold text-[#36525a]">{title}</p></div>
                      <p className="mt-1 pl-8 text-[11px] leading-4 text-[#84959a] break-words">{detail}</p>
                    </div>
                  ))}
                </div>
                {dianResult && (
                  <div className="mt-4 border-t border-[#edf2f2] pt-4">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                      {[
                        ["Registros leídos", dianResult.totalRows, "bg-[#f4f8f8] text-[#36525a]"],
                        ["Ya radicadas", dianResult.alreadyRadicated, "bg-[#e8f6f3] text-[#147c70]"],
                        ["Faltan documentos", dianResult.missingDocuments, "bg-[#fff8f2] text-[#a34b18]"],
                        ["NIT no válido", dianResult.invalidRecipient, "bg-[#fff1f1] text-[#b54d4d]"],
                        ["Revisión especial", dianResult.notRadicable, "bg-[#f4f1ff] text-[#62529b]"],
                      ].map(([label, count, tone]) => <div key={String(label)} className={"rounded-xl px-3 py-2.5 " + tone}><p className="text-[11px] font-medium opacity-80">{label}</p><p className="mt-0.5 text-lg font-semibold">{count}</p></div>)}
                    </div>
                    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-[#e1ebeb] bg-[#fbfdfd] px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0"><p className="text-xs font-semibold text-[#36525a]">Cruce realizado con CUFE</p><p className="mt-1 text-xs leading-5 text-[#84959a]">{dianResult.matchedBy.cufe} coincidencia{dianResult.matchedBy.cufe === 1 ? "" : "s"} por CUFE y {dianResult.matchedBy.supplierDocument} por NIT del emisor + prefijo + folio.</p>{dianResult.radicatedNow ? <p className="mt-1 text-xs font-semibold text-[#147c70]">Se radicaron automáticamente {dianResult.radicatedNow} documento{dianResult.radicatedNow === 1 ? "" : "s"} encontrado{dianResult.radicatedNow === 1 ? "" : "s"} en el buzón.</p> : dianResult.missingDocuments > 0 ? <p className="mt-1 text-xs font-semibold text-[#a34b18]">Los faltantes deben revisarse en PDF y autorizarse uno por uno. Si la conexión DIAN no está disponible, se cargará el ZIP manualmente.</p> : null}</div>
                      <p className="shrink-0 text-xs text-[#84959a]">{dianResult.fileName}</p>
                    </div>
                    {renderDianMissingRows()}
                    {renderDianInvalidRows()}
                    {dianResult.notRadicable > 0 && <p className="mt-3 text-xs leading-5 text-[#84959a]">Estos registros no corresponden a un tipo documental reconocido por el conciliador. Las notas crédito y los documentos equivalentes sí continúan por el flujo normal.</p>}
                  </div>
                )}
              </div>
            )}

            {role === "Administrador" && !isAdminUtilityView && (
              <div className="mb-6">
                <div><p className="text-sm font-semibold text-[#36525a]">Resumen del circuito</p><p className="mt-1 text-xs leading-5 text-[#84959a]">Selecciona una tarjeta para revisar las facturas de esa bandeja sin cambiar el rol asumido.</p></div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {adminQueueCards.map((card) => {
                    const Icon = card.icon
                    return (
                      <button key={card.label} onClick={() => { setActiveTab(card.tab); setExpandedId(null) }} className="rounded-2xl border border-[#dce7e7] bg-white p-4 text-left shadow-[0_8px_22px_rgb(32_69_77/3%)] transition hover:-translate-y-0.5 hover:border-[#abd6cf] hover:shadow-[0_12px_28px_rgb(32_69_77/8%)]">
                        <div className="flex items-center justify-between gap-3"><span className={"flex size-9 items-center justify-center rounded-xl " + card.tone}><Icon className="size-4" /></span><span className="text-2xl font-semibold text-[#21414b]">{card.count}</span></div>
                        <p className="mt-3 text-sm font-semibold text-[#36525a]">{card.label}</p>
                        <p className="mt-1 text-xs text-[#84959a]">{card.detail}</p>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {!isAdminUtilityView && <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="rounded-2xl border-[#dce7e7] py-0 shadow-[0_8px_22px_rgb(32_69_77/3%)]"><CardContent className="flex items-center gap-4 p-5"><div className="flex size-10 items-center justify-center rounded-xl bg-[#e8f6f3] text-[#147c70]"><Inbox className="size-5" /></div><div><p className="text-xs text-[#84959a]">En la bandeja</p><p className="mt-1 text-2xl font-semibold text-[#21414b]">{pendingCount}</p></div></CardContent></Card>
              <Card className="rounded-2xl border-[#dce7e7] py-0 shadow-[0_8px_22px_rgb(32_69_77/3%)]"><CardContent className="flex items-center gap-4 p-5"><div className="flex size-10 items-center justify-center rounded-xl bg-[#fff1e5] text-[#b55d25]"><Clock3 className="size-5" /></div><div><p className="text-xs text-[#84959a]">Vencen pronto</p><p className="mt-1 text-2xl font-semibold text-[#21414b]">{dueSoonCount}</p></div></CardContent></Card>
              <Card className="rounded-2xl border-[#dce7e7] py-0 shadow-[0_8px_22px_rgb(32_69_77/3%)]"><CardContent className="flex items-center gap-4 p-5"><div className="flex size-10 items-center justify-center rounded-xl bg-[#f4f1ff] text-[#62529b]"><WalletCards className="size-5" /></div><div><p className="text-xs text-[#84959a]">Valor pendiente</p><p className="mt-1 text-xl font-semibold text-[#21414b]">{money.format(totalAmount).replace(" ", " ")}</p></div></CardContent></Card>
              <Card className="rounded-2xl border-[#dce7e7] py-0 shadow-[0_8px_22px_rgb(32_69_77/3%)]"><CardContent className="flex items-center gap-4 p-5"><div className="flex size-10 items-center justify-center rounded-xl bg-[#edf3f4] text-[#607a80]"><ShieldCheck className="size-5" /></div><div><p className="text-xs text-[#84959a]">NIT esperado</p><p className="mt-1 text-lg font-semibold text-[#21414b]">{expectedRecipientNit}</p></div></CardContent></Card>
            </div>}

            {isTrackingView ? renderTrackingView() : isConsultationView ? renderConsultationView() : <Card className="gap-0 overflow-hidden rounded-2xl border-[#dce7e7] py-0 shadow-[0_12px_35px_rgb(32_69_77/5%)]">
              <CardHeader className="border-b border-[#e5eeee] px-5 py-0 sm:px-6">
                <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div><CardTitle className="text-lg tracking-[-0.02em] text-[#21414b]">Documentos recibidos</CardTitle><p className="mt-1 text-sm text-[#84959a]">Haz clic en una fila para desplegar su información y tarea.</p></div>
                  <div className="flex items-center gap-2"><span className="hidden text-xs text-[#84959a] sm:inline">Orden: {sortAscending ? "más próximas primero" : "más lejanas primero"}</span><Button onClick={() => setSortAscending((current) => !current)} variant="outline" size="icon" className="size-10 rounded-xl border-[#d7e4e4] bg-white text-[#557079] shadow-none hover:bg-[#f2f7f7]" aria-label="Cambiar orden por fecha de vencimiento"><ArrowDownUp className="size-4" /></Button></div>
                </div>
                <div className="flex gap-5 overflow-x-auto">
                  {tabs.map((tab) => (
                    <button key={tab} onClick={() => { setActiveTab(tab); setExpandedId(null) }} className={"whitespace-nowrap border-b-2 px-0 pb-3 pt-1 text-sm transition " + (activeTab === tab ? "border-[#147c70] font-semibold text-[#147c70]" : "border-transparent text-[#718089] hover:text-[#36525a]")}>
                      {tab}<span className={"ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] " + (activeTab === tab ? "bg-[#e8f6f3] text-[#147c70]" : "bg-[#eef3f4] text-[#84959a]")}>{countForTab(tab)}</span>
                    </button>
                  ))}
                </div>
              </CardHeader>

              <div className="flex flex-col gap-3 border-b border-[#e5eeee] px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8aa0a5]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por proveedor, factura o NIT" className="h-10 rounded-xl border-[#d7e4e4] bg-[#fbfdfd] pl-9 text-sm shadow-none placeholder:text-[#93a5a9] focus-visible:ring-[#6ed1c2]/40" /></div>
                <Button variant="outline" className="h-10 rounded-xl border-[#d7e4e4] bg-white px-3.5 text-sm text-[#557079] shadow-none hover:bg-[#f2f7f7]"><Filter className="size-4" />Filtrar</Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] text-left">
                  <thead className="bg-[#f8fbfb] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#83949a]">
                    <tr><th className="w-16 px-4 py-3 text-center font-semibold">N.º</th><th className="px-6 py-3 font-semibold">Factura</th><th className="px-4 py-3 font-semibold">Proveedor</th><th className="px-4 py-3 font-semibold">Bandeja actual</th><th className="px-4 py-3 font-semibold">Tiempo en bandeja</th><th className="px-4 py-3 font-semibold">Vencimiento</th><th className="px-4 py-3 font-semibold">Valor</th><th className="px-4 py-3 font-semibold">Estado</th><th className="px-4 py-3" /></tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf2f2]">
                    {visibleInvoices.map((invoice, index) => {
                      const isExpanded = invoice.id === expandedId
                      return (
                        <Fragment key={invoice.id}>
                          <tr onClick={() => selectInvoice(invoice)} className={"cursor-pointer transition hover:bg-[#f7fbfa] " + (isExpanded ? "bg-[#f1f9f7]" : "bg-white")}>
                            <td className="w-16 px-4 py-4 text-center"><span className="inline-flex size-7 items-center justify-center rounded-full bg-[#eef4f4] text-xs font-semibold text-[#557079]">{index + 1}</span></td>
                            <td className="px-6 py-4"><div className="flex items-center gap-3"><span className={"flex size-9 items-center justify-center rounded-lg " + (isExpanded ? "bg-[#d7f0eb] text-[#147c70]" : "bg-[#eef4f4] text-[#6b8288]")}><FileText className="size-4" /></span><div><p className="text-sm font-semibold text-[#21414b]">{invoice.number}</p><p className="mt-0.5 text-xs text-[#84959a]">{invoice.documentType || "Factura electrónica"} · Recibida {invoice.received}</p></div></div></td>
                            <td className="max-w-[250px] px-4 py-4"><p className="truncate text-sm font-medium text-[#36525a]">{invoice.supplier}</p><p className="mt-0.5 text-xs text-[#84959a]">NIT {invoice.nit}</p></td>
                            <td className="px-4 py-4"><span className="text-sm text-[#36525a]">{invoice.currentRole}</span>{invoice.assignedTo && <p className="mt-0.5 text-xs text-[#84959a]">{invoice.assignedTo}</p>}</td>
                            <td className="px-4 py-4"><p className={"text-sm font-semibold " + (invoice.stage === "Archivada" ? "text-[#657b80]" : "text-[#147c70]")}>{invoice.stage === "Archivada" ? "Cerrada" : formatElapsedSince(invoice.stageEnteredAt)}</p><p className="mt-0.5 text-xs text-[#84959a]">{invoice.stage === "Archivada" ? "En Archivo" : `Desde ${formatDate(invoice.stageEnteredAt)}`}</p></td>
                            <td className="px-4 py-4"><p className="whitespace-nowrap text-sm font-semibold text-[#36525a]">{formatDate(invoice.dueDate)}</p><DueMark date={invoice.dueDate} archived={invoice.stage === "Archivada"} /></td>
                            <td className="px-4 py-4 text-sm font-semibold text-[#2e4e57]">{money.format(invoice.amount).replace(" ", " ")}</td>
                            <td className="px-4 py-4"><StageBadge stage={invoice.stage} /></td>
                            <td className="px-4 py-4 text-right">{isExpanded ? <ChevronDown className="ml-auto size-4 text-[#147c70]" /> : <ChevronRight className="ml-auto size-4 text-[#b0bfc2]" />}</td>
                          </tr>
                          {isExpanded && <tr><td colSpan={9} className="p-0">{renderExpanded(invoice)}</td></tr>}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
                {visibleInvoices.length === 0 && <div className="px-6 py-16 text-center"><div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-[#edf5f4] text-[#6f8a8d]"><Search className="size-5" /></div><p className="text-sm font-medium text-[#36525a]">No hay facturas en esta vista</p><p className="mt-1 text-sm text-[#84959a]">Prueba con otra bandeja o búsqueda.</p></div>}
              </div>
              <div className="flex items-center justify-between border-t border-[#e5eeee] px-6 py-4"><p className="text-xs text-[#84959a]">Mostrando {visibleInvoices.length} de {roleInvoices.length} facturas · ordenadas por vencimiento</p><span className="hidden items-center gap-1.5 text-xs font-medium text-[#147c70] sm:inline-flex"><CalendarDays className="size-3.5" />Fecha tomada del documento</span></div>
            </Card>}

          </div>
        </section>
      </div>
      {toast && <div role="status" className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-[#0d2833] px-4 py-3 text-sm font-medium text-white shadow-[0_14px_35px_rgb(13_40_51/25%)]"><Check className="size-4 text-[#6ed1c2]" />{toast}</div>}
    </main>
  )
}
