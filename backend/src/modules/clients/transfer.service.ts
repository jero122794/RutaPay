// backend/src/modules/clients/transfer.service.ts
import type { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { prisma } from "../../shared/prisma.js";
import { createClient } from "./service.js";
import { importClientRowSchema } from "./schema.js";
import type { TransferFormat } from "./schema.js";

export interface TransferFile {
  filename: string;
  contentType: string;
  buffer: Buffer;
}

export interface ImportResult {
  totalRows: number;
  created: number;
  failed: number;
  errors: { row: number; message: string }[];
}

interface Actor {
  id: string;
  roles: string[];
  businessId: string | null;
}

const MAX_IMPORT_ROWS = 2000;

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_CONTENT_TYPE = "text/csv; charset=utf-8";

const IMPORT_HEADERS = [
  "nombre",
  "documento",
  "telefono",
  "ruta",
  "email",
  "direccion",
  "descripcion",
  "password"
] as const;

/** Maps many accepted header spellings to the canonical import field key. */
const HEADER_ALIASES: Record<string, keyof ImportRecord> = {
  nombre: "name",
  name: "name",
  documento: "documentId",
  documentoid: "documentId",
  cedula: "documentId",
  identificacion: "documentId",
  telefono: "phone",
  celular: "phone",
  phone: "phone",
  ruta: "route",
  route: "route",
  email: "email",
  correo: "email",
  direccion: "address",
  address: "address",
  descripcion: "description",
  description: "description",
  password: "password",
  contrasena: "password",
  clave: "password"
};

interface ImportRecord {
  name?: string;
  documentId?: string;
  phone?: string;
  route?: string;
  email?: string;
  address?: string;
  description?: string;
  password?: string;
}

const decimalToNumber = (value: Prisma.Decimal): number => Number(value.toString());

const normalizeHeader = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, "")
    .toLowerCase()
    .trim();

const routeScopeWhere = (actor: Actor): Prisma.RouteWhereInput => {
  const isSuper = actor.roles.includes("SUPER_ADMIN");
  const isAdmin = actor.roles.includes("ADMIN") && !isSuper;
  if (isSuper) {
    return {};
  }
  if (isAdmin) {
    return actor.businessId ? { businessId: actor.businessId } : { id: { in: [] } };
  }
  return { managerId: actor.id };
};

const bogotaDateString = (date: Date): string => {
  // America/Bogota is UTC-5 year-round (no DST).
  const shifted = new Date(date.getTime() - 5 * 60 * 60 * 1000);
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const year = shifted.getUTCFullYear();
  return `${day}/${month}/${year}`;
};

const sanitizeFilenamePart = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "rutapay";

const businessLabel = async (actor: Actor): Promise<string> => {
  if (!actor.businessId) {
    return "rutapay";
  }
  const business = await prisma.business.findUnique({
    where: { id: actor.businessId },
    select: { name: true }
  });
  return business?.name ? sanitizeFilenamePart(business.name) : "rutapay";
};

interface ExportClientRow {
  name: string;
  documentId: string;
  phone: string;
  email: string;
  address: string;
  description: string;
  routeName: string;
  managerName: string;
  isActive: string;
  canLogin: string;
  activeLoans: number;
  activePrincipal: number;
  createdAt: string;
}

interface ExportRouteRow {
  name: string;
  managerName: string;
  balance: number;
  clientsCount: number;
  activeLoans: number;
}

interface ExportLoanRow {
  clientName: string;
  documentId: string;
  routeName: string;
  principal: number;
  interestRate: number;
  frequency: string;
  installmentCount: number;
  installmentAmount: number;
  totalAmount: number;
  totalInterest: number;
  status: string;
  startDate: string;
  endDate: string;
}

interface ExportData {
  clients: ExportClientRow[];
  routes: ExportRouteRow[];
  loans: ExportLoanRow[];
}

const gatherExportData = async (actor: Actor): Promise<ExportData> => {
  const where = routeScopeWhere(actor);

  const routes = await prisma.route.findMany({
    where,
    include: { manager: { select: { name: true } } },
    orderBy: { name: "asc" }
  });
  const routeIds = routes.map((route) => route.id);
  const routeById = new Map(routes.map((route) => [route.id, route]));

  const [routeClients, loans, clientRole] = await Promise.all([
    prisma.routeClient.findMany({ where: { routeId: { in: routeIds } } }),
    prisma.loan.findMany({
      where: { routeId: { in: routeIds } },
      include: { client: { select: { name: true, documentId: true } } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.role.findUnique({ where: { name: "CLIENT" } })
  ]);

  const activeLoansByClient = new Map<string, { count: number; principal: number }>();
  const activeLoansByRoute = new Map<string, number>();
  for (const loan of loans) {
    if (loan.status !== "ACTIVE") {
      continue;
    }
    const prev = activeLoansByClient.get(loan.clientId) ?? { count: 0, principal: 0 };
    prev.count += 1;
    prev.principal += decimalToNumber(loan.principal);
    activeLoansByClient.set(loan.clientId, prev);
    activeLoansByRoute.set(loan.routeId, (activeLoansByRoute.get(loan.routeId) ?? 0) + 1);
  }

  const clientIds = routeClients.map((rc) => rc.clientId);
  const clientUserIds = clientRole
    ? new Set(
        (
          await prisma.userRole.findMany({
            where: { userId: { in: clientIds }, roleId: clientRole.id },
            select: { userId: true }
          })
        ).map((row) => row.userId)
      )
    : new Set<string>();

  const users = await prisma.user.findMany({ where: { id: { in: clientIds } } });
  const userById = new Map(users.map((user) => [user.id, user]));

  const clientRows: ExportClientRow[] = [];
  const clientsCountByRoute = new Map<string, number>();
  for (const rc of routeClients) {
    const user = userById.get(rc.clientId);
    const route = routeById.get(rc.routeId);
    if (!user || !route || !clientUserIds.has(user.id)) {
      continue;
    }
    clientsCountByRoute.set(rc.routeId, (clientsCountByRoute.get(rc.routeId) ?? 0) + 1);
    const activeLoan = activeLoansByClient.get(user.id) ?? { count: 0, principal: 0 };
    clientRows.push({
      name: user.name,
      documentId: user.documentId ?? "",
      phone: user.phone ?? "",
      email: user.email ?? "",
      address: user.address ?? "",
      description: user.description ?? "",
      routeName: route.name,
      managerName: route.manager.name,
      isActive: user.isActive ? "Sí" : "No",
      canLogin: user.passwordHash ? "Sí" : "No",
      activeLoans: activeLoan.count,
      activePrincipal: activeLoan.principal,
      createdAt: bogotaDateString(user.createdAt)
    });
  }
  clientRows.sort((a, b) => a.name.localeCompare(b.name));

  const routeRows: ExportRouteRow[] = routes.map((route) => ({
    name: route.name,
    managerName: route.manager.name,
    balance: decimalToNumber(route.balance),
    clientsCount: clientsCountByRoute.get(route.id) ?? 0,
    activeLoans: activeLoansByRoute.get(route.id) ?? 0
  }));

  const loanRows: ExportLoanRow[] = loans.map((loan) => ({
    clientName: loan.client.name,
    documentId: loan.client.documentId ?? "",
    routeName: routeById.get(loan.routeId)?.name ?? "",
    principal: decimalToNumber(loan.principal),
    interestRate: Math.round(decimalToNumber(loan.interestRate) * 100),
    frequency: loan.frequency,
    installmentCount: loan.installmentCount,
    installmentAmount: decimalToNumber(loan.installmentAmount),
    totalAmount: decimalToNumber(loan.totalAmount),
    totalInterest: decimalToNumber(loan.totalInterest),
    status: loan.status,
    startDate: bogotaDateString(loan.startDate),
    endDate: bogotaDateString(loan.endDate)
  }));

  return { clients: clientRows, routes: routeRows, loans: loanRows };
};

const escapeCsvValue = (value: string | number): string => {
  const text = String(value);
  if (/[",\n;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const buildClientsCsv = (data: ExportData): Buffer => {
  const header = [
    "Nombre",
    "Documento",
    "Telefono",
    "Email",
    "Direccion",
    "Descripcion",
    "Ruta",
    "Encargado",
    "Activo",
    "Puede ingresar",
    "Prestamos activos",
    "Capital activo (COP)",
    "Creado"
  ];
  const lines = [header.map(escapeCsvValue).join(",")];
  for (const row of data.clients) {
    lines.push(
      [
        row.name,
        row.documentId,
        row.phone,
        row.email,
        row.address,
        row.description,
        row.routeName,
        row.managerName,
        row.isActive,
        row.canLogin,
        row.activeLoans,
        row.activePrincipal,
        row.createdAt
      ]
        .map(escapeCsvValue)
        .join(",")
    );
  }
  // BOM so Excel opens UTF-8 accents correctly.
  return Buffer.from(`\uFEFF${lines.join("\r\n")}`, "utf8");
};

const styleHeaderRow = (row: ExcelJS.Row): void => {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });
};

const buildExportWorkbook = async (data: ExportData): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RutaPay";
  workbook.created = new Date();

  const clientsSheet = workbook.addWorksheet("Clientes");
  clientsSheet.columns = [
    { header: "Nombre", key: "name", width: 28 },
    { header: "Documento", key: "documentId", width: 16 },
    { header: "Teléfono", key: "phone", width: 16 },
    { header: "Email", key: "email", width: 26 },
    { header: "Dirección", key: "address", width: 28 },
    { header: "Descripción", key: "description", width: 28 },
    { header: "Ruta", key: "routeName", width: 20 },
    { header: "Encargado", key: "managerName", width: 22 },
    { header: "Activo", key: "isActive", width: 10 },
    { header: "Puede ingresar", key: "canLogin", width: 14 },
    { header: "Préstamos activos", key: "activeLoans", width: 16 },
    { header: "Capital activo (COP)", key: "activePrincipal", width: 20 },
    { header: "Creado", key: "createdAt", width: 14 }
  ];
  for (const row of data.clients) {
    clientsSheet.addRow(row);
  }
  styleHeaderRow(clientsSheet.getRow(1));
  clientsSheet.views = [{ state: "frozen", ySplit: 1 }];

  const routesSheet = workbook.addWorksheet("Rutas");
  routesSheet.columns = [
    { header: "Ruta", key: "name", width: 24 },
    { header: "Encargado", key: "managerName", width: 24 },
    { header: "Saldo (COP)", key: "balance", width: 18 },
    { header: "Clientes", key: "clientsCount", width: 12 },
    { header: "Préstamos activos", key: "activeLoans", width: 16 }
  ];
  for (const row of data.routes) {
    routesSheet.addRow(row);
  }
  styleHeaderRow(routesSheet.getRow(1));
  routesSheet.views = [{ state: "frozen", ySplit: 1 }];

  const loansSheet = workbook.addWorksheet("Préstamos");
  loansSheet.columns = [
    { header: "Cliente", key: "clientName", width: 28 },
    { header: "Documento", key: "documentId", width: 16 },
    { header: "Ruta", key: "routeName", width: 20 },
    { header: "Capital (COP)", key: "principal", width: 16 },
    { header: "Tasa (%)", key: "interestRate", width: 10 },
    { header: "Frecuencia", key: "frequency", width: 14 },
    { header: "Cuotas", key: "installmentCount", width: 10 },
    { header: "Cuota (COP)", key: "installmentAmount", width: 16 },
    { header: "Total (COP)", key: "totalAmount", width: 16 },
    { header: "Interés (COP)", key: "totalInterest", width: 16 },
    { header: "Estado", key: "status", width: 14 },
    { header: "Inicio", key: "startDate", width: 14 },
    { header: "Fin", key: "endDate", width: 14 }
  ];
  for (const row of data.loans) {
    loansSheet.addRow(row);
  }
  styleHeaderRow(loansSheet.getRow(1));
  loansSheet.views = [{ state: "frozen", ySplit: 1 }];

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
};

export const buildClientsExport = async (actor: Actor, format: TransferFormat): Promise<TransferFile> => {
  const data = await gatherExportData(actor);
  const label = await businessLabel(actor);
  const datePart = bogotaDateString(new Date()).split("/").reverse().join("-");

  if (format === "csv") {
    return {
      filename: `clientes_${label}_${datePart}.csv`,
      contentType: CSV_CONTENT_TYPE,
      buffer: buildClientsCsv(data)
    };
  }

  return {
    filename: `clientes_${label}_${datePart}.xlsx`,
    contentType: XLSX_CONTENT_TYPE,
    buffer: await buildExportWorkbook(data)
  };
};

const buildTemplateCsv = (): Buffer => {
  const header = IMPORT_HEADERS.map((h) => h.charAt(0).toUpperCase() + h.slice(1));
  const example = [
    "Juan Pérez",
    "1098765432",
    "3001234567",
    "Ruta Centro",
    "juan@example.com",
    "Calle 10 #5-20",
    "Cliente referido",
    ""
  ];
  const lines = [header.map(escapeCsvValue).join(","), example.map(escapeCsvValue).join(",")];
  return Buffer.from(`\uFEFF${lines.join("\r\n")}`, "utf8");
};

const buildTemplateWorkbook = async (routeNames: string[]): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RutaPay";

  const sheet = workbook.addWorksheet("Clientes");
  sheet.columns = [
    { header: "nombre", key: "name", width: 26 },
    { header: "documento", key: "documentId", width: 16 },
    { header: "telefono", key: "phone", width: 16 },
    { header: "ruta", key: "route", width: 20 },
    { header: "email", key: "email", width: 26 },
    { header: "direccion", key: "address", width: 26 },
    { header: "descripcion", key: "description", width: 26 },
    { header: "password", key: "password", width: 18 }
  ];
  sheet.addRow({
    name: "Juan Pérez",
    documentId: "1098765432",
    phone: "3001234567",
    route: routeNames[0] ?? "Ruta Centro",
    email: "juan@example.com",
    address: "Calle 10 #5-20",
    description: "Cliente referido",
    password: ""
  });
  styleHeaderRow(sheet.getRow(1));
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const help = workbook.addWorksheet("Instrucciones");
  help.columns = [{ header: "Campo / Nota", key: "k", width: 30 }, { header: "Detalle", key: "v", width: 70 }];
  const notes: [string, string][] = [
    ["nombre", "Obligatorio. Entre 2 y 100 caracteres."],
    ["documento", "Obligatorio. Único. Entre 5 y 30 caracteres."],
    ["telefono", "Obligatorio. Entre 7 y 20 caracteres."],
    ["ruta", "Obligatorio. Debe coincidir con un nombre de la hoja 'Rutas'."],
    ["email", "Opcional. Único si se incluye."],
    ["direccion", "Opcional. Máximo 160 caracteres."],
    ["descripcion", "Opcional. Máximo 300 caracteres."],
    ["password", "Opcional. Si se deja vacío, el cliente no podrá iniciar sesión. Mín. 8 caracteres con mayúscula, minúscula, número y símbolo."]
  ];
  for (const note of notes) {
    help.addRow({ k: note[0], v: note[1] });
  }
  styleHeaderRow(help.getRow(1));

  const routesSheet = workbook.addWorksheet("Rutas");
  routesSheet.columns = [{ header: "Rutas válidas", key: "name", width: 32 }];
  for (const name of routeNames) {
    routesSheet.addRow({ name });
  }
  styleHeaderRow(routesSheet.getRow(1));

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
};

export const buildImportTemplate = async (actor: Actor, format: TransferFormat): Promise<TransferFile> => {
  if (format === "csv") {
    return {
      filename: "plantilla_clientes.csv",
      contentType: CSV_CONTENT_TYPE,
      buffer: buildTemplateCsv()
    };
  }

  const routes = await prisma.route.findMany({
    where: routeScopeWhere(actor),
    select: { name: true },
    orderBy: { name: "asc" }
  });
  return {
    filename: "plantilla_clientes.xlsx",
    contentType: XLSX_CONTENT_TYPE,
    buffer: await buildTemplateWorkbook(routes.map((route) => route.name))
  };
};

const cellToString = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") {
      return value.text.trim();
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
    if ("result" in value && value.result !== undefined && value.result !== null) {
      return String(value.result).trim();
    }
    if ("hyperlink" in value && typeof value.hyperlink === "string") {
      return value.hyperlink.trim();
    }
  }
  return "";
};

interface ParsedSheet {
  headers: string[];
  rows: { rowNumber: number; cells: string[] }[];
}

const parseXlsx = async (buffer: Buffer): Promise<ParsedSheet> => {
  const workbook = new ExcelJS.Workbook();
  // Cast around Node/ExcelJS Buffer typing friction (@types/node templated Buffer).
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { headers: [], rows: [] };
  }
  const headers: string[] = [];
  const headerRow = sheet.getRow(1);
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = cellToString(cell.value);
  });

  const rows: { rowNumber: number; cells: string[] }[] = [];
  for (let r = 2; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= headers.length; c += 1) {
      cells[c - 1] = cellToString(row.getCell(c).value);
    }
    rows.push({ rowNumber: r, cells });
  }
  return { headers, rows };
};

const parseCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === "," || char === ";") {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((value) => value.trim());
};

const parseCsv = (buffer: Buffer): ParsedSheet => {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }
  const headers = parseCsvLine(lines[0] ?? "");
  const rows = lines.slice(1).map((line, index) => ({
    rowNumber: index + 2,
    cells: parseCsvLine(line)
  }));
  return { headers, rows };
};

const buildRecord = (headers: string[], cells: string[]): ImportRecord => {
  const record: ImportRecord = {};
  headers.forEach((header, index) => {
    const key = HEADER_ALIASES[normalizeHeader(header)];
    if (!key) {
      return;
    }
    const value = (cells[index] ?? "").trim();
    if (value !== "") {
      record[key] = value;
    }
  });
  return record;
};

export const importClientsFromFile = async (
  actor: Actor,
  buffer: Buffer,
  filename: string
): Promise<ImportResult> => {
  const isCsv = filename.toLowerCase().endsWith(".csv");
  const parsed = isCsv ? parseCsv(buffer) : await parseXlsx(buffer);

  const dataRows = parsed.rows.filter((row) => row.cells.some((cell) => cell.trim() !== ""));
  if (dataRows.length === 0) {
    throw new Error("El archivo no contiene filas de clientes.");
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`El archivo supera el máximo de ${MAX_IMPORT_ROWS} filas por importación.`);
  }

  const routes = await prisma.route.findMany({
    where: routeScopeWhere(actor),
    select: { id: true, name: true }
  });
  const routeIdByName = new Map<string, string>();
  for (const route of routes) {
    const key = normalizeHeader(route.name);
    if (!routeIdByName.has(key)) {
      routeIdByName.set(key, route.id);
    }
  }
  const onlyRouteId = routes.length === 1 ? routes[0]?.id ?? null : null;

  const result: ImportResult = {
    totalRows: dataRows.length,
    created: 0,
    failed: 0,
    errors: []
  };

  for (const dataRow of dataRows) {
    const record = buildRecord(parsed.headers, dataRow.cells);

    let routeId: string | null = null;
    if (record.route) {
      routeId = routeIdByName.get(normalizeHeader(record.route)) ?? null;
      if (!routeId) {
        result.failed += 1;
        result.errors.push({ row: dataRow.rowNumber, message: `Ruta no encontrada: "${record.route}".` });
        continue;
      }
    } else if (onlyRouteId) {
      routeId = onlyRouteId;
    } else {
      result.failed += 1;
      result.errors.push({ row: dataRow.rowNumber, message: "Falta la columna 'ruta'." });
      continue;
    }

    const parsedRow = importClientRowSchema.safeParse({
      name: record.name,
      documentId: record.documentId,
      phone: record.phone,
      email: record.email,
      address: record.address,
      description: record.description,
      password: record.password
    });

    if (!parsedRow.success) {
      const message = parsedRow.error.issues.map((issue) => issue.message).join(" ");
      result.failed += 1;
      result.errors.push({ row: dataRow.rowNumber, message });
      continue;
    }

    try {
      await createClient({ ...parsedRow.data, routeId }, actor.id, actor.roles, actor.businessId);
      result.created += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido al crear el cliente.";
      result.failed += 1;
      result.errors.push({ row: dataRow.rowNumber, message });
    }
  }

  return result;
};
