import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import ExcelJS from "npm:exceljs";

// ─── Types ────────────────────────────────────────────────────────────

interface SupportData {
  support_name: string;
  support_slug: string;
  variant_slug: string;
  categorie: string | null;
  lectorat: string | null;
  canal: string; // "Print" | "Web" | "NL"
  periodicite_print: string | null;
  diffusion_print: number | null;
  format_print: string | null;
  visites_par_mois_web: number | null;
  pages_vues_par_mois_web: number | null;
  nombre_envois_nl: number | null;
  tarif_brut: string | null;
  tarif_net: string | null;
  dates_parution: { date: string; periodicite?: string }[];
  dates_bouclage: { date: string }[];
  url: string | null;
  format_web: string | null;
  format_nl: string | null;
  taux_ouverture_nl: number | null;
  periodicite_nl: string | null;
  abonnes_nl: number | null;
  specs_technique: string | null;
}

interface DealOverrides {
  quantite?: number;
  tarif_brut?: number; // numeric brut override from builder (takes precedence over support_data.tarif_brut)
  date_parution?: string;
  date_bouclage?: string;
  remise_1?: number; // sales discount (0-100), applied before agency 15%
}

interface CampaignSupport {
  support_data: SupportData;
  deal_overrides: DealOverrides | null;
}

interface Metadata {
  annonceur?: string;
  agence?: string;
  contact?: string;
  contact_nom?: string;
  contact_email?: string;
  campagne?: string;
  periode?: string;
  budget?: string;
  cible?: string;
  objectif?: string;
  canaux?: string;
  secteurs_exclus?: string;
}

interface ContactRow {
  variant_slug: string;
  nom: string | null;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  role: string | null;
}

interface VisuelRow {
  variant_slug: string;
  type_de_format: string | null;
}

// ─── Canal Configuration ──────────────────────────────────────────────

interface CanalConfig {
  templateFile: string;
  sheetName: string;
  headerCells: { date: string; annonceur: string; agence: string; contact: string; campagne: string };
  categoryStartRow: number;
  dataStartRow: number;
  lastCol: number;
  templateFooterRow: number;
  templateEndRow: number;
}

const CANAL_CONFIGS: Record<string, CanalConfig> = {
  Print: {
    templateFile: "template-print.xlsx",
    sheetName: "Print",
    headerCells: { date: "D3", annonceur: "D4", agence: "D5", contact: "D6", campagne: "D7" },
    categoryStartRow: 15,
    dataStartRow: 16,
    lastCol: 13, // A-M
    templateFooterRow: 28,
    templateEndRow: 30,
  },
  NL: {
    templateFile: "template-nl.xlsx",
    sheetName: "Newsletter",
    headerCells: { date: "D4", annonceur: "D5", agence: "D6", contact: "D7", campagne: "D8" },
    categoryStartRow: 14,
    dataStartRow: 15,
    lastCol: 13, // A-M
    templateFooterRow: 27,
    templateEndRow: 29,
  },
  Web: {
    templateFile: "template-web.xlsx",
    sheetName: "Web",
    headerCells: { date: "D3", annonceur: "D4", agence: "D5", contact: "D6", campagne: "D7" },
    categoryStartRow: 14,
    dataStartRow: 15,
    lastCol: 17, // A-Q
    templateFooterRow: 27,
    templateEndRow: 29,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────

const AGENCY_DISCOUNT = 0.15;
const ND = "N/D"; // "Non Disponible" — shown when data is missing

/** Round to 2 decimal places to avoid floating-point display artifacts */
const round2 = (n: number): number => Math.round(n * 100) / 100;

const EUR_FMT = '#,##0.00 "€"';
function euroCell(ws: ExcelJS.Worksheet, row: number, col: number, value: number | string) {
  const cell = ws.getCell(row, col);
  cell.value = value;
  if (typeof value === "number") cell.numFmt = EUR_FMT;
}

function parseTarifText(tarif: string | null): number {
  if (!tarif || tarif.toLowerCase().includes("pas de tarif")) return 0;
  let normalized = tarif.replace(/[^\d.,]/g, "");
  if (normalized.includes(".") && normalized.includes(",")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = normalized.replace(",", ".");
  }
  return parseFloat(normalized) || 0;
}

/**
 * Two-step pricing:
 * 1. Apply per-support sales discount (remise_1)
 * 2. Always apply 15% agency discount
 */
function computeNet(brut: number, remiseCommerciale: number): number {
  const afterSales = brut * (1 - (remiseCommerciale || 0) / 100);
  return afterSales * (1 - AGENCY_DISCOUNT);
}

function groupByCanal(supports: CampaignSupport[]): Record<string, CampaignSupport[]> {
  const grouped: Record<string, CampaignSupport[]> = {};
  for (const s of supports) {
    const canal = s.support_data.canal;
    if (!grouped[canal]) grouped[canal] = [];
    grouped[canal].push(s);
  }
  return grouped;
}

function groupByCategorie(supports: CampaignSupport[]): Record<string, CampaignSupport[]> {
  const grouped: Record<string, CampaignSupport[]> = {};
  for (const s of supports) {
    const cat = s.support_data.categorie || "AUTRES";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(s);
  }
  return grouped;
}

function formatContact(contacts: ContactRow[] | undefined): string | null {
  if (!contacts || contacts.length === 0) return null;
  // Prefer contact with role containing "envoi" or "technique"
  const priority = contacts.find(
    (c) => c.email && c.role && /envoi|technique|fabrication/i.test(c.role),
  );
  const best = priority || contacts.find((c) => c.email) || contacts[0];
  const parts: string[] = [];
  if (best.prenom || best.nom) {
    parts.push([best.prenom, best.nom].filter(Boolean).join(" "));
  }
  if (best.email) parts.push(best.email);
  return parts.join("\n") || null;
}

type CellStyle = Record<string, unknown>;

function saveRowStyles(ws: ExcelJS.Worksheet, rowNum: number, lastCol: number): CellStyle[] {
  const styles: CellStyle[] = [];
  const row = ws.getRow(rowNum);
  for (let c = 1; c <= lastCol; c++) {
    const cell = row.getCell(c);
    styles.push(JSON.parse(JSON.stringify(cell.style || {})));
  }
  return styles;
}

function applyRowStyles(ws: ExcelJS.Worksheet, rowNum: number, styles: CellStyle[]) {
  const row = ws.getRow(rowNum);
  for (let c = 1; c <= styles.length; c++) {
    if (styles[c - 1] && Object.keys(styles[c - 1]).length > 0) {
      row.getCell(c).style = styles[c - 1] as Partial<ExcelJS.Style>;
    }
  }
}

function clearDynamicZone(ws: ExcelJS.Worksheet, fromRow: number, toRow: number, lastCol: number) {
  const merges: string[] = (ws.model as Record<string, unknown>).merges as string[] || [];
  for (const merge of [...merges]) {
    const rowMatch = merge.match(/\d+/g);
    if (rowMatch) {
      const rows = rowMatch.map(Number);
      if (rows.some((r) => r >= fromRow && r <= toRow)) {
        try {
          ws.unMergeCells(merge);
        } catch { /* already unmerged */ }
      }
    }
  }
  for (let r = fromRow; r <= toRow; r++) {
    for (let c = 1; c <= lastCol; c++) {
      const cell = ws.getCell(r, c);
      cell.value = null;
      cell.style = {};
    }
  }
}

// ─── Lookup map types ─────────────────────────────────────────────────

type VisuelsMap = Map<string, VisuelRow[]>;
type ContactsMap = Map<string, ContactRow[]>;

// ─── Per-canal data row fillers ───────────────────────────────────────

interface RowTotals {
  brut: number;
  afterSales: number;
  net: number;
}

/** Returns the first upcoming date (≥ today), or the most recent past date as fallback. */
function nextOrLatestDate(dates: { date: string }[]): string | null {
  if (!dates || dates.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  const withDate = dates.filter((d) => d.date);
  const future = withDate.filter((d) => d.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  if (future.length > 0) return future[0].date;
  const past = withDate.sort((a, b) => b.date.localeCompare(a.date));
  return past[0]?.date ?? null;
}

function fillPrintDataRow(
  ws: ExcelJS.Worksheet, row: number, s: CampaignSupport,
  visuelsMap: VisuelsMap, contactsMap: ContactsMap,
): RowTotals {
  const sd = s.support_data;
  const ov = s.deal_overrides || {};
  const qty = ov.quantite ?? 1;
  // ov.tarif_brut from builder is already the TOTAL brut (unit × qty), don't multiply again
  const brutTotal = ov.tarif_brut != null
    ? round2(ov.tarif_brut)
    : round2(parseTarifText(sd.tarif_brut) * qty);
  const remise1 = ov.remise_1 ?? 0;
  const afterSales = round2(brutTotal * (1 - remise1 / 100));
  const netTotal = round2(computeNet(brutTotal, remise1));

  ws.getCell(row, 1).value = sd.support_name; // A: Support
  ws.getCell(row, 2).value = sd.periodicite_print || ND; // B: Périodicité
  ws.getCell(row, 3).value = sd.diffusion_print || ND; // C: Diffusion
  ws.getCell(row, 4).value = ND; // D: OJD — no data source
  ws.getCell(row, 5).value = qty; // E: Insertion (quantité)
  euroCell(ws, row, 6, brutTotal !== 0 ? brutTotal : ND); // F: Brut base achat total
  euroCell(ws, row, 7, netTotal !== 0 ? netTotal : ND); // G: NET PLS
  ws.getCell(row, 8).value = ov.date_bouclage || nextOrLatestDate(sd.dates_bouclage) || ND; // H: Bouclage
  ws.getCell(row, 9).value = ov.date_parution || nextOrLatestDate(sd.dates_parution) || ND; // I: Parution
  ws.getCell(row, 10).value = ND; // J: Emplacement — no data source
  ws.getCell(row, 11).value = sd.format_print || ND; // K: Dimension page
  // L: Format fichier — from visuels
  const visuel = visuelsMap.get(sd.variant_slug);
  ws.getCell(row, 12).value = visuel?.[0]?.type_de_format || ND;
  // M: Contact envoi — from contacts
  const contact = contactsMap.get(sd.variant_slug);
  ws.getCell(row, 13).value = formatContact(contact) || ND;

  return { brut: brutTotal, afterSales, net: netTotal };
}

function fillNLDataRow(
  ws: ExcelJS.Worksheet, row: number, s: CampaignSupport,
  visuelsMap: VisuelsMap, contactsMap: ContactsMap,
): RowTotals {
  const sd = s.support_data;
  const ov = s.deal_overrides || {};
  const qty = ov.quantite ?? sd.nombre_envois_nl ?? 1;
  // ov.tarif_brut from builder is already the TOTAL brut (unit × qty), don't multiply again
  const brutTotal = ov.tarif_brut != null
    ? round2(ov.tarif_brut)
    : round2(parseTarifText(sd.tarif_brut) * qty);
  const brutUnit = qty > 0 ? round2(brutTotal / qty) : 0;
  const remise1 = ov.remise_1 ?? 0;
  const afterSales = round2(brutTotal * (1 - remise1 / 100));
  const netTotal = round2(computeNet(brutTotal, remise1));

  ws.getCell(row, 1).value = sd.support_name; // A: Sites
  ws.getCell(row, 2).value = sd.url || ND; // B: URL
  ws.getCell(row, 3).value = sd.lectorat || sd.categorie || ND; // C: Cibles
  ws.getCell(row, 4).value = sd.periodicite_nl || sd.dates_parution?.[0]?.periodicite || ND; // D: Périodicité
  ws.getCell(row, 5).value = sd.abonnes_nl ?? ND; // E: Nombre d'abonnés
  ws.getCell(row, 6).value = sd.taux_ouverture_nl != null ? `${sd.taux_ouverture_nl.toFixed(1)}%` : ND; // F: Taux ouverture
  // G: Format NL — from SupportData, fallback to visuels
  const visuel = visuelsMap.get(sd.variant_slug);
  ws.getCell(row, 7).value = sd.format_nl || visuel?.[0]?.type_de_format || ND;
  ws.getCell(row, 8).value = qty; // H: Nombre d'envois
  euroCell(ws, row, 9, brutUnit !== 0 ? brutUnit : ND); // I: Tarif brut unitaire
  euroCell(ws, row, 10, brutTotal !== 0 ? brutTotal : ND); // J: Tarif brut total
  // K: empty
  euroCell(ws, row, 12, brutTotal ? round2(-(brutTotal - netTotal)) : ND); // L: Remise (sales + agency)
  euroCell(ws, row, 13, netTotal !== 0 ? netTotal : ND); // M: Total net

  // Contact not shown in NL template columns, but could be added if template changes
  void contactsMap;

  return { brut: brutTotal, afterSales, net: netTotal };
}

function fillWebDataRow(
  ws: ExcelJS.Worksheet, row: number, s: CampaignSupport,
  visuelsMap: VisuelsMap, contactsMap: ContactsMap,
): RowTotals {
  const sd = s.support_data;
  const ov = s.deal_overrides || {};
  const qty = ov.quantite ?? 1;
  // ov.tarif_brut from builder is already the TOTAL brut, don't multiply again
  const brutTotal = ov.tarif_brut != null
    ? round2(ov.tarif_brut)
    : round2(parseTarifText(sd.tarif_brut) * qty);
  const remise1 = ov.remise_1 ?? 0;
  const afterSales = round2(brutTotal * (1 - remise1 / 100));
  const netTotal = round2(computeNet(brutTotal, remise1));

  // CPM = (budget / visites) * 1000 — computed from monthly visits as proxy for impressions
  const visites = sd.visites_par_mois_web;
  const cpmBrut = (visites && brutTotal) ? round2((brutTotal / visites) * 1000) : null;
  const cpmNet  = (visites && netTotal)  ? round2((netTotal  / visites) * 1000) : null;

  ws.getCell(row, 1).value = sd.support_name; // A: Sites
  ws.getCell(row, 2).value = sd.url || ND; // B: URL
  ws.getCell(row, 3).value = sd.lectorat || sd.categorie || ND; // C: Cibles
  ws.getCell(row, 4).value = sd.visites_par_mois_web || ND; // D: Visites/mois
  ws.getCell(row, 5).value = sd.pages_vues_par_mois_web || ND; // E: PV/mois
  ws.getCell(row, 6).value = sd.format_web || ND; // F: Format
  ws.getCell(row, 7).value = ND; // G: Durée — per-devis input
  ws.getCell(row, 8).value = ND; // H: Impressions — per-devis input
  euroCell(ws, row, 9, brutTotal !== 0 ? brutTotal : ND); // I: Tarif Brut
  euroCell(ws, row, 10, cpmBrut ?? ND); // J: CPM brut — computed
  euroCell(ws, row, 11, brutTotal ? round2(-(brutTotal - netTotal)) : ND); // K: Remise
  euroCell(ws, row, 12, netTotal !== 0 ? netTotal : ND); // L: Tarif net
  euroCell(ws, row, 13, cpmNet ?? ND); // M: CPM net — computed
  ws.getCell(row, 14).value = ND; // N: CTR — per-devis input
  ws.getCell(row, 15).value = ND; // O: Nb clics estimés — requires CTR
  ws.getCell(row, 16).value = sd.specs_technique || ND; // P: Specs
  ws.getCell(row, 17).value = ND; // Q: Trackings — per-devis input

  void visuelsMap;
  void contactsMap;

  return { brut: brutTotal, afterSales, net: netTotal };
}

type DataRowFiller = (
  ws: ExcelJS.Worksheet, row: number, s: CampaignSupport,
  visuelsMap: VisuelsMap, contactsMap: ContactsMap,
) => RowTotals;

const DATA_ROW_FILLERS: Record<string, DataRowFiller> = {
  Print: fillPrintDataRow,
  NL: fillNLDataRow,
  Web: fillWebDataRow,
};

// ─── Footer writers ───────────────────────────────────────────────────

function writePrintFooter(
  ws: ExcelJS.Worksheet,
  startRow: number,
  totals: { brut: number; afterSales: number; net: number },
  footerStyles: CellStyle[][],
  lastCol: number,
) {
  const { brut, afterSales, net } = totals;
  const hasSalesDiscount = Math.abs(brut - afterSales) > 0.01;

  let row = startRow;

  // Row 1: Cumul tarif brut éditeur
  applyRowStyles(ws, row, footerStyles[0]);
  ws.getCell(row, 4).value = "Cumul tarif brut éditeur";
  ws.mergeCells(row, 4, row, 5);
  ws.getCell(row, 6).value = round2(brut);
  ws.getCell(row, 6).numFmt = EUR_FMT;
  row++;

  // Row 2: Sales discount (only if any support has one)
  if (hasSalesDiscount) {
    applyRowStyles(ws, row, footerStyles[1]);
    ws.getCell(row, 4).value = "Remise commerciale";
    ws.mergeCells(row, 4, row, 5);
    ws.getCell(row, 6).value = round2(-(brut - afterSales));
    ws.getCell(row, 6).numFmt = EUR_FMT;
    row++;
  }

  // Row: Agency discount -15%
  applyRowStyles(ws, row, footerStyles[1]);
  ws.getCell(row, 4).value = "Remise Professionnelle -15%";
  ws.mergeCells(row, 4, row, 5);
  ws.getCell(row, 6).value = round2(-(afterSales * AGENCY_DISCOUNT));
  ws.getCell(row, 6).numFmt = EUR_FMT;
  row++;

  // Row: TOTAL NET NET PLS
  applyRowStyles(ws, row, footerStyles[2]);
  ws.getCell(row, 4).value = "TOTAL NET NET PLS en euros HT";
  ws.mergeCells(row, 4, row, 5);
  ws.getCell(row, 6).value = round2(net);
  ws.getCell(row, 6).numFmt = EUR_FMT;
  row++;

  // Clear any leftover rows below
  for (let r = row; r <= row + 10; r++) {
    for (let c = 1; c <= lastCol; c++) {
      ws.getCell(r, c).value = null;
      ws.getCell(r, c).style = {};
    }
  }
}

function writeNLWebFooter(
  ws: ExcelJS.Worksheet,
  startRow: number,
  totals: { brut: number; afterSales: number; net: number },
  footerStyles: CellStyle[][],
  lastCol: number,
) {
  const { brut, afterSales, net } = totals;
  const hasSalesDiscount = Math.abs(brut - afterSales) > 0.01;

  let row = startRow;

  // Row 1: TOTAL BRUT ÉDITEUR
  applyRowStyles(ws, row, footerStyles[0]);
  ws.getCell(row, 9).value = "TOTAL BRUT ÉDITEUR en €";
  ws.mergeCells(row, 9, row, 12);
  ws.getCell(row, 13).value = round2(brut);
  ws.getCell(row, 13).numFmt = EUR_FMT;
  row++;

  // Row 2: Sales discount (only if any)
  if (hasSalesDiscount) {
    applyRowStyles(ws, row, footerStyles[1]);
    ws.getCell(row, 9).value = "Remise commerciale";
    ws.mergeCells(row, 9, row, 12);
    ws.getCell(row, 13).value = round2(-(brut - afterSales));
    ws.getCell(row, 13).numFmt = EUR_FMT;
    row++;
  }

  // Row: Agency discount -15%
  applyRowStyles(ws, row, footerStyles[1]);
  ws.getCell(row, 9).value = "Remise Professionnelle -15%";
  ws.mergeCells(row, 9, row, 12);
  ws.getCell(row, 13).value = round2(-(afterSales * AGENCY_DISCOUNT));
  ws.getCell(row, 13).numFmt = EUR_FMT;
  row++;

  // Row: TOTAL NET NET PLS
  applyRowStyles(ws, row, footerStyles[2]);
  ws.getCell(row, 9).value = "TOTAL NET NET PLS en euros";
  ws.mergeCells(row, 9, row, 12);
  ws.getCell(row, 13).value = round2(net);
  ws.getCell(row, 13).numFmt = EUR_FMT;
  row++;

  // Clear any leftover rows below
  for (let r = row; r <= row + 10; r++) {
    for (let c = 1; c <= lastCol; c++) {
      ws.getCell(r, c).value = null;
      ws.getCell(r, c).style = {};
    }
  }
}

// ─── Sheet filler ─────────────────────────────────────────────────────

function applyThinBorders(ws: ExcelJS.Worksheet, fromRow: number, toRow: number, lastCol: number) {
  const thin: ExcelJS.BorderStyle = 'thin';
  const border = { top: { style: thin }, bottom: { style: thin }, left: { style: thin }, right: { style: thin } };
  for (let r = fromRow; r <= toRow; r++) {
    for (let c = 1; c <= lastCol; c++) {
      const cell = ws.getCell(r, c);
      cell.border = border;
    }
  }
}

function fillSheet(
  ws: ExcelJS.Worksheet,
  supports: CampaignSupport[],
  metadata: Metadata,
  config: CanalConfig,
  visuelsMap: VisuelsMap,
  contactsMap: ContactsMap,
) {
  // 1. Fill header cells
  ws.getCell(config.headerCells.date).value = new Date().toLocaleDateString("fr-FR");
  ws.getCell(config.headerCells.annonceur).value = metadata.annonceur || "";
  ws.getCell(config.headerCells.agence).value = metadata.agence || "";
  ws.getCell(config.headerCells.contact).value = metadata.contact_nom || metadata.contact || "";

  // Date de campagne: first support date or "A définir"
  const firstDate = supports
    .map((s) => s.deal_overrides?.date_parution || nextOrLatestDate(s.support_data.dates_parution))
    .find(Boolean);
  ws.getCell(config.headerCells.campagne).value = firstDate || "A définir";

  // 2. Save template styles before clearing
  const catStyle = saveRowStyles(ws, config.categoryStartRow, config.lastCol);
  const dataStyle = saveRowStyles(ws, config.dataStartRow, config.lastCol);
  const footerStyles = [
    saveRowStyles(ws, config.templateFooterRow, config.lastCol),
    saveRowStyles(ws, config.templateFooterRow + 1, config.lastCol),
    saveRowStyles(ws, config.templateFooterRow + 2, config.lastCol),
  ];

  // 3. Clear dynamic zone (category row through end of template + buffer)
  clearDynamicZone(ws, config.categoryStartRow, config.templateEndRow + 15, config.lastCol);

  // 4. Group by categorie and write rows
  const byCategory = groupByCategorie(supports);
  const fillDataRow = DATA_ROW_FILLERS[supports[0].support_data.canal];
  let cursor = config.categoryStartRow;
  let brutSum = 0;
  let afterSalesSum = 0;
  let netSum = 0;

  for (const [category, catSupports] of Object.entries(byCategory)) {
    // Category header row (merged across all columns)
    applyRowStyles(ws, cursor, catStyle);
    ws.getCell(cursor, 1).value = (category || "AUTRES").toUpperCase();
    ws.mergeCells(cursor, 1, cursor, config.lastCol);
    cursor++;

    // Data rows
    for (const support of catSupports) {
      applyRowStyles(ws, cursor, dataStyle);
      const rowTotals = fillDataRow(ws, cursor, support, visuelsMap, contactsMap);
      brutSum += rowTotals.brut;
      afterSalesSum += rowTotals.afterSales;
      netSum += rowTotals.net;
      cursor++;
    }
  }

  // 5. Skip one blank row before footer
  cursor++;

  // 6. Write footer
  const canal = supports[0].support_data.canal;
  const totals = { brut: brutSum, afterSales: afterSalesSum, net: netSum };
  if (canal === "Print") {
    writePrintFooter(ws, cursor, totals, footerStyles, config.lastCol);
  } else {
    writeNLWebFooter(ws, cursor, totals, footerStyles, config.lastCol);
  }

  // F2: Widen column M (13) to 30 for contact readability
  ws.getColumn(13).width = 30;

  const dataEndRow = cursor + 6;
  applyThinBorders(ws, config.categoryStartRow, dataEndRow, config.lastCol);
}

// ─── Worksheet copy ───────────────────────────────────────────────────

function copyWorksheet(source: ExcelJS.Worksheet, target: ExcelJS.Worksheet) {
  // Copy column widths
  source.columns.forEach((col, i) => {
    if (col.width) target.getColumn(i + 1).width = col.width;
  });

  // Copy rows: values, styles, heights
  source.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const targetRow = target.getRow(rowNumber);
    if (row.height) targetRow.height = row.height;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const targetCell = targetRow.getCell(colNumber);
      targetCell.value = cell.value;
      targetCell.style = JSON.parse(JSON.stringify(cell.style || {}));
    });
  });

  // Copy merged cells
  const merges: string[] = (source.model as Record<string, unknown>).merges as string[] || [];
  for (const merge of merges) {
    try {
      target.mergeCells(merge);
    } catch { /* skip if already merged */ }
  }
}

// ─── Shared job helpers ───────────────────────────────────────────────

const safeName = (s: string) => s.replace(/[^a-z0-9]/gi, "_").substring(0, 30);

type ClaimedJob = { id: string; conversation_id: string; organization_id: string; type: string };

async function completeJob(
  client: ReturnType<typeof createClient>,
  jobId: string,
  fileUrl: string,
  storagePath: string,
) {
  await client
    .from("export_jobs")
    .update({
      status: "completed",
      file_url: fileUrl,
      storage_path: storagePath,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

// ─── handleExcel ──────────────────────────────────────────────────────

async function handleExcel(client: ReturnType<typeof createClient>, job: ClaimedJob) {
  // Fetch selected supports
  const { data: rawSupports, error: supportsError } = await client
    .from("campaign_supports")
    .select("support_data, deal_overrides")
    .eq("conversation_id", job.conversation_id)
    .eq("is_selected", true);

  if (supportsError) throw new Error(`Fetch supports: ${supportsError.message}`);
  if (!rawSupports || rawSupports.length === 0) throw new Error("No selected supports found");

  const supports = rawSupports as CampaignSupport[];

  // Collect unique variant_slugs for enrichment lookups
  const variantSlugs = [...new Set(supports.map((s) => s.support_data.variant_slug))];

  // Batch lookup: contacts + visuels from source tables
  const [contactsResult, visuelsResult] = await Promise.all([
    client
      .from("new_04_contacts")
      .select("variant_slug, nom, prenom, email, telephone, role")
      .in("variant_slug", variantSlugs),
    client
      .from("new_03_visuels")
      .select("variant_slug, type_de_format")
      .in("variant_slug", variantSlugs),
  ]);

  // Build lookup maps
  const contactsMap: ContactsMap = new Map();
  if (contactsResult.data) {
    for (const row of contactsResult.data as ContactRow[]) {
      const existing = contactsMap.get(row.variant_slug) || [];
      existing.push(row);
      contactsMap.set(row.variant_slug, existing);
    }
  }

  const visuelsMap: VisuelsMap = new Map();
  if (visuelsResult.data) {
    for (const row of visuelsResult.data as VisuelRow[]) {
      const existing = visuelsMap.get(row.variant_slug) || [];
      existing.push(row);
      visuelsMap.set(row.variant_slug, existing);
    }
  }

  console.log(`[process-export-job] Enrichment: ${contactsMap.size} contacts, ${visuelsMap.size} visuels for ${variantSlugs.length} variants`);

  // Fetch conversation metadata and org logo in parallel
  const [convResult, orgResult] = await Promise.all([
    client.from("leo_conversations").select("metadata").eq("id", job.conversation_id).single(),
    client.from("organizations").select("logo_url").eq("id", job.organization_id).single(),
  ]);

  if (convResult.error) throw new Error(`Fetch conversation: ${convResult.error.message}`);
  const metadata = (convResult.data.metadata as Metadata) ?? {};
  const logoUrl: string | null = orgResult.data?.logo_url ?? null;

  // Group supports by canal
  const byCanal = groupByCanal(supports);

  // Build output workbook with one sheet per canal
  const output = new ExcelJS.Workbook();

  // Resolve canal entries and download all templates in parallel
  const canalEntries = Object.entries(byCanal)
    .filter(([canal]) => {
      if (!CANAL_CONFIGS[canal]) {
        console.warn(`[process-export-job] Unknown canal "${canal}", skipping`);
        return false;
      }
      return true;
    });

  const templates = await Promise.all(
    canalEntries.map(async ([canal]) => {
      const config = CANAL_CONFIGS[canal];
      const { data: blob, error: dlError } = await client.storage
        .from("devis-templates")
        .download(config.templateFile);
      if (dlError || !blob) {
        throw new Error(`Download template ${config.templateFile}: ${dlError?.message}`);
      }
      return { canal, blob };
    }),
  );

  // Fill each template and copy to output (sequential to preserve sheet order)
  for (const { canal, blob } of templates) {
    const config = CANAL_CONFIGS[canal];
    const canalSupports = byCanal[canal];

    const templateBuffer = await blob.arrayBuffer();
    const templateWb = new ExcelJS.Workbook();
    await templateWb.xlsx.load(templateBuffer);
    const ws = templateWb.getWorksheet(1);
    if (!ws) throw new Error(`No worksheet found in ${config.templateFile}`);

    fillSheet(ws, canalSupports, metadata, config, visuelsMap, contactsMap);
    ws.name = config.sheetName;

    const outWs = output.addWorksheet(config.sheetName);
    copyWorksheet(ws, outWs);

    // copyWorksheet does not copy embedded images — re-embed logo manually.
    // Priority: org custom logo > PLS logo baked into template.
    try {
      let logoBuffer: ArrayBuffer | null = null;
      let ext: 'png' | 'jpeg' = 'png';

      if (logoUrl) {
        const logoResp = await fetch(logoUrl);
        if (logoResp.ok) {
          logoBuffer = await logoResp.arrayBuffer();
          ext = logoUrl.toLowerCase().includes('.png') ? 'png' : 'jpeg';
        }
      }

      // Fall back to PLS logo extracted from template
      if (!logoBuffer) {
        const templateMedia = (templateWb as unknown as { model: { media?: { type: string; buffer: Buffer }[] } }).model.media;
        if (templateMedia && templateMedia.length > 0) {
          logoBuffer = templateMedia[0].buffer;
          ext = (templateMedia[0].type as 'png' | 'jpeg') || 'png';
        }
      }

      if (logoBuffer) {
        // Safe chunked base64 to avoid stack overflow on large buffers
        const bytes = new Uint8Array(logoBuffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        const logoBase64 = btoa(binary);
        const imageId = output.addImage({ base64: logoBase64, extension: ext });
        outWs.addImage(imageId, { tl: { col: 0, row: 0 }, br: { col: 1, row: 4 }, editAs: 'oneCell' });
      }
    } catch (logoErr) {
      console.warn(`[process-export-job] Logo embed skipped: ${logoErr}`);
    }
  }

  // Write output to buffer
  const buffer = await output.xlsx.writeBuffer();

  // Upload to devis-files bucket
  const annonceurSafe = safeName(metadata.annonceur || "client");
  const storagePath = `${job.organization_id}/${job.conversation_id}/devis_${annonceurSafe}_${Date.now()}.xlsx`;

  const { error: uploadError } = await client.storage
    .from("devis-files")
    .upload(storagePath, buffer, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: false,
    });

  if (uploadError) throw new Error(`Upload: ${uploadError.message}`);

  // Create signed URL (1 hour)
  const { data: signedData, error: urlError } = await client.storage
    .from("devis-files")
    .createSignedUrl(storagePath, 3600);

  if (urlError) throw new Error(`Signed URL: ${urlError.message}`);

  await completeJob(client, job.id, signedData.signedUrl, storagePath);
  console.log(`[process-export-job] Excel job ${job.id} completed successfully`);
}

// ─── handlePpt ────────────────────────────────────────────────────────

async function handlePpt(client: ReturnType<typeof createClient>, job: ClaimedJob) {
  const pptServiceUrl = Deno.env.get("PPT_SERVICE_URL");
  if (!pptServiceUrl) throw new Error("PPT_SERVICE_URL not configured");

  // Fetch selected supports
  const { data: rawSupports, error: supportsError } = await client
    .from("campaign_supports")
    .select("support_data, deal_overrides")
    .eq("conversation_id", job.conversation_id)
    .eq("is_selected", true);

  if (supportsError) throw new Error(`Fetch supports: ${supportsError.message}`);
  if (!rawSupports || rawSupports.length === 0) throw new Error("No selected supports found");

  const supports = rawSupports as CampaignSupport[];

  // Fetch conversation metadata
  const { data: convData, error: convError } = await client
    .from("leo_conversations")
    .select("metadata")
    .eq("id", job.conversation_id)
    .single();

  if (convError) throw new Error(`Fetch conversation: ${convError.message}`);
  const metadata = (convData.metadata as Metadata) ?? {};

  // Generate signed URL for PPT template (10 min — enough for 27MB download + processing)
  const { data: templateUrl, error: templateError } = await client.storage
    .from("devis-templates")
    .createSignedUrl("pls-ppt-template.pptx", 600);

  if (templateError || !templateUrl) throw new Error(`Template URL: ${templateError?.message}`);

  // Build payload for Python microservice
  const payload = {
    template_url: templateUrl.signedUrl,
    metadata: {
      campagne:        metadata.campagne        || metadata.annonceur || "Campagne",
      agence:          metadata.agence          || "",
      annonceur:       metadata.annonceur       || "",
      budget:          metadata.budget          || "",
      cible:           metadata.cible           || "",
      objectif:        metadata.objectif        || "",
      periode:         metadata.periode         || "",
      canaux:          metadata.canaux          || "",
      secteurs_exclus: metadata.secteurs_exclus || "",
      contact_nom:     metadata.contact_nom     || "",
      contact_email:   metadata.contact_email   || "",
    },
    supports: supports.map((s) => {
      const sd = s.support_data;
      const ov = s.deal_overrides || {};
      const qty = ov.quantite ?? 1;
      const brutRaw = ov.tarif_brut != null
        ? ov.tarif_brut
        : parseTarifText(sd.tarif_brut) * qty;
      const brutTotal  = Math.round(brutRaw * 100) / 100;
      const afterSales = Math.round(brutTotal * (1 - (ov.remise_1 || 0) / 100) * 100) / 100;
      const netTotal   = Math.round(afterSales * 0.85 * 100) / 100;
      return {
        name:                sd.support_name,
        canal:               sd.canal,
        periodicite:         sd.periodicite_print         ?? null,
        diffusion_print:     sd.diffusion_print           ?? null,
        format_print:        sd.format_print              ?? null,
        visites_par_mois:    sd.visites_par_mois_web      ?? null,
        pages_vues_par_mois: sd.pages_vues_par_mois_web   ?? null,
        nombre_envois_nl:    sd.nombre_envois_nl           ?? null,
        periodicite_nl:      sd.periodicite_nl             ?? null,
        abonnes_nl:          sd.abonnes_nl                 ?? null,
        taux_ouverture:      sd.taux_ouverture_nl          ?? null,
        url:                 sd.url                        ?? null,
        format_web:          sd.format_web                 ?? null,
        format_nl:           sd.format_nl                  ?? null,
        lectorat:            sd.lectorat                   ?? null,
        categorie:           sd.categorie                  ?? null,
        quantite:            qty,
        tarif_brut_computed: brutTotal  || null,
        tarif_net_computed:  netTotal   || null,
        date_parution:       ov.date_parution || nextOrLatestDate(sd.dates_parution) || null,
        date_bouclage:       ov.date_bouclage || nextOrLatestDate(sd.dates_bouclage) || null,
      };
    }),
  };

  // Call Python microservice (2-min timeout for large template + processing)
  console.log(`[process-export-job] Calling PPT service at ${pptServiceUrl}/generate`);
  const controller = new AbortController();
  const fetchTimeout = setTimeout(() => controller.abort(), 120_000);
  let pptResp: Response;
  try {
    pptResp = await fetch(`${pptServiceUrl}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(fetchTimeout);
  }

  if (!pptResp.ok) {
    const errorText = await pptResp.text();
    throw new Error(`PPT service error (${pptResp.status}): ${errorText}`);
  }

  const pptBuffer = await pptResp.arrayBuffer();

  // Upload to devis-files bucket
  const annonceurSafe = safeName(metadata.annonceur || "client");
  const storagePath = `${job.organization_id}/${job.conversation_id}/Reco_PLS_${annonceurSafe}_${Date.now()}.pptx`;

  const { error: uploadError } = await client.storage
    .from("devis-files")
    .upload(storagePath, pptBuffer, {
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      upsert: false,
    });

  if (uploadError) throw new Error(`Upload: ${uploadError.message}`);

  // Create signed URL (1 hour)
  const { data: signedData, error: urlError } = await client.storage
    .from("devis-files")
    .createSignedUrl(storagePath, 3600);

  if (urlError) throw new Error(`Signed URL: ${urlError.message}`);

  await completeJob(client, job.id, signedData.signedUrl, storagePath);
  console.log(`[process-export-job] PPT job ${job.id} completed successfully`);
}

// ─── Main Handler ─────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("[process-export-job] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return new Response("Server misconfigured", { status: 500 });
  }
  const client = createClient(supabaseUrl, serviceKey);

  let jobId: string | undefined;

  try {
    const body = await req.json();
    jobId = body.job_id;
    if (!jobId) throw new Error("Missing job_id");

    console.log(`[process-export-job] Processing job ${jobId}`);

    // Claim job: pending → processing (atomic check)
    const { data: job, error: claimError } = await client
      .from("export_jobs")
      .update({ status: "processing" })
      .eq("id", jobId)
      .eq("status", "pending")
      .select("id, conversation_id, organization_id, type")
      .single();

    if (claimError || !job) {
      console.log(`[process-export-job] Could not claim job ${jobId}: already processing or not found`);
      return new Response("ok");
    }

    // Dispatch by type
    if (job.type === "excel") {
      await handleExcel(client, job);
    } else if (job.type === "ppt") {
      await handlePpt(client, job);
    } else if (job.type === "email") {
      // Email drafts are rendered inline by the AI — no file generation needed
      console.log(`[process-export-job] Email job ${jobId} — no-op (inline draft)`);
    } else {
      console.log(`[process-export-job] Unknown job type: ${job.type}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[process-export-job] Job ${jobId} failed:`, msg);

    // Sanitize error before storing — strip sensitive details (paths, keys, connection strings)
    const safeMsg = msg
      .replace(/\/[^\s]+/g, "[path]")           // file paths
      .replace(/eyJ[A-Za-z0-9_-]+/g, "[token]") // JWT-like tokens
      .replace(/postgresql?:\/\/[^\s]+/g, "[db]") // connection strings
      .substring(0, 200);

    if (jobId) {
      await client
        .from("export_jobs")
        .update({
          status: "failed",
          error_message: safeMsg,
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }
  }

  // Always return 200 (pg_net fire-and-forget, no retry on error)
  return new Response("ok");
});
