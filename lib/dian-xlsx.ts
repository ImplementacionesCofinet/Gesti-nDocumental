import { strFromU8, unzipSync } from "fflate"

export type DianRow = {
  rowNumber: number
  documentType: string
  cufe: string
  folio: string
  prefix: string
  currency: string
  paymentForm: string
  paymentMethod: string
  issueDate: string
  receivedAt: string
  supplierNit: string
  supplierName: string
  recipientNit: string
  recipientName: string
  total: number
  state: string
  group: string
  raw: Record<string, string>
}

function stripXml(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\s+/g, " ")
    .trim()
}

function localTag(tag: string) {
  return `(?:[A-Za-z_][\\w.-]*:)?${tag}`
}

function allBlocks(xml: string, tag: string) {
  return [...xml.matchAll(new RegExp(`<${localTag(tag)}\\b[^>]*>[\\s\\S]*?<\\/${localTag(tag)}>`, "gi"))].map((match) => match[0])
}

function tagText(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${localTag(tag)}\\b[^>]*>([\\s\\S]*?)<\\/${localTag(tag)}>`, "i"))
  return match ? stripXml(match[1]) : ""
}

function attribute(value: string, name: string) {
  const match = value.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))
  return match?.[1] ?? ""
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
}

function columnIndex(reference: string) {
  const letters = reference.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? "A"
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1
}

function parseSharedStrings(xml: string) {
  return allBlocks(xml, "si").map((block) => allBlocks(block, "t").map((part) => stripXml(part)).join(""))
}

function parseWorksheet(xml: string, sharedStrings: string[]) {
  return allBlocks(xml, "row").map((rowXml) => {
    const rowNumber = Number(attribute(rowXml.slice(0, rowXml.indexOf(">") + 1), "r")) || 0
    const cells: Record<number, string> = {}
    for (const cellXml of allBlocks(rowXml, "c")) {
      const start = cellXml.slice(0, cellXml.indexOf(">") + 1)
      const index = columnIndex(attribute(start, "r"))
      const type = attribute(start, "t")
      const value = tagText(cellXml, "v")
      const inline = tagText(cellXml, "is")
      if (!Number.isFinite(index) || index < 0) continue
      cells[index] = type === "s" ? sharedStrings[Number(value)] ?? "" : type === "inlineStr" ? inline : value
    }
    return { rowNumber, cells }
  })
}

function findValue(row: Record<string, string>, ...names: string[]) {
  const wanted = names.map(normalizeHeader)
  const match = Object.entries(row).find(([key]) => wanted.includes(normalizeHeader(key)))
  return match?.[1]?.trim() ?? ""
}

function normalizeNit(value: string) {
  return value.replace(/\D/g, "").slice(0, 9)
}

function parseAmount(value: string) {
  const normalized = value.replace(/\s/g, "").replace(/,(?=\d{3}(?:\D|$))/g, "")
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? Math.round(parsed) : 0
}

export function readDianWorkbook(bytes: Uint8Array) {
  const files = unzipSync(bytes)
  const sharedStrings = files["xl/sharedStrings.xml"] ? parseSharedStrings(strFromU8(files["xl/sharedStrings.xml"])) : []
  const sheetName = Object.keys(files).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
  if (!sheetName) throw new Error("El archivo no contiene una hoja de cálculo válida.")
  const worksheet = parseWorksheet(strFromU8(files[sheetName]), sharedStrings)
  const headerCells = worksheet.find((row) => row.rowNumber === 1)?.cells ?? {}
  const headers = Object.values(headerCells).map((value) => value.trim())
  if (!headers.length) throw new Error("No fue posible leer los encabezados del listado DIAN.")

  const rows: DianRow[] = []
  for (const row of worksheet.filter((item) => item.rowNumber > 1)) {
    const values = Object.fromEntries(headers.map((header, index) => [normalizeHeader(header), row.cells[index] ?? ""]))
    const raw = Object.fromEntries(headers.map((header, index) => [header, row.cells[index] ?? ""]))
    if (!Object.values(values).some((value) => value.trim())) continue
    rows.push({
      rowNumber: row.rowNumber,
      documentType: findValue(raw, "Tipo de documento"),
      cufe: findValue(raw, "CUFE/CUDE", "CUFE", "CUDE"),
      folio: findValue(raw, "Folio"),
      prefix: findValue(raw, "Prefijo"),
      currency: findValue(raw, "Divisa"),
      paymentForm: findValue(raw, "Forma de Pago"),
      paymentMethod: findValue(raw, "Medio de Pago"),
      issueDate: findValue(raw, "Fecha Emisión"),
      receivedAt: findValue(raw, "Fecha Recepción"),
      supplierNit: normalizeNit(findValue(raw, "NIT Emisor")),
      supplierName: findValue(raw, "Nombre Emisor"),
      recipientNit: normalizeNit(findValue(raw, "NIT Receptor")),
      recipientName: findValue(raw, "Nombre Receptor"),
      total: parseAmount(findValue(raw, "Total")),
      state: findValue(raw, "Estado"),
      group: findValue(raw, "Grupo"),
      raw,
    })
  }

  const required = ["CUFE/CUDE", "Folio", "Prefijo", "NIT Emisor", "Nombre Emisor", "NIT Receptor", "Nombre Receptor", "Total"]
  const missing = required.filter((header) => !headers.some((value) => normalizeHeader(value) === normalizeHeader(header)))
  if (missing.length) throw new Error(`El listado DIAN no tiene las columnas requeridas: ${missing.join(", ")}.`)
  return { headers, rows }
}
