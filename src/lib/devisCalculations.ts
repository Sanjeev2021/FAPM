import { parseTarifText } from '@/lib/pricing';
import type { CampaignSupport } from '@/components/chat/hooks/useWorkingSet';

// ─── Constants ───────────────────────────────────────────────────────────────

export const AGENCY_DISCOUNT = 0.15;
export const NET_MULTIPLIER = 1 - AGENCY_DISCOUNT; // 0.85

export type Canal = 'Print' | 'Web' | 'NL';
export type LockedField = 'quantite' | 'remise_1' | 'net';

// ─── Shared display types (mirror backend VisuelRecord / ContactRecord) ──────

export interface VisuelData {
  fichier_integre?: string;
  fichier_url?: string;
  type_de_format?: string;
  notes?: string;
}

export interface ContactData {
  nom?: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  role?: string;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DevisLineItem {
  id: string; // campaign_supports.id
  variant_slug: string;
  support_name: string;
  canal: Canal;
  type_tarif: 'forfait' | 'cpm' | 'pack' | 'unitaire'; // Web: forfait|cpm  NL: pack|unitaire

  // Display fields (read-only from DB)
  categorie: string | null;
  lectorat: string | null;
  periodicite_print: string | null;
  diffusion_print: number | null;
  format_print: string | null;
  visites_par_mois_web: number | null;
  pages_vues_par_mois_web: number | null;
  nombre_envois_nl: number | null;
  dates_parution: unknown[];
  dates_bouclage: unknown[];
  date_parution_override: string | null;
  date_bouclage_override: string | null;
  similarity?: number;
  visuels_data?: VisuelData[] | null;
  contacts_data?: ContactData[] | null;
  url?: string | null;
  periodicite_nl?: string | null;
  abonnes_nl?: number | null;
  taux_ouverture_nl?: number | null;
  format_nl?: string | null;
  format_web?: string | null;

  // Editable fields
  quantite: number; // nb insertions (Print) or nb envois (NL), 1 for Web
  tarif_brut: number; // total brut for this line
  remise_1: number; // individual discount percentage (0-100)

  // Computed
  net: number; // brut × (1 - remise_1/100) — no agency discount

  // Web-specific
  cpm_brut: number | null;
  visites_mutable: number | null; // scaled impressions (Web only)

  // NL-specific
  brut_unitaire: number | null;

  // Hidden anchors
  _unit_price: number; // price per insertion/envoi, or flat rate for Web
  _has_tarif: boolean;
  _tarif_brut_base: number; // original tarif_brut at init (for Web impressions ratio)
  _visites_base: number | null; // original visites_par_mois_web at init (for scaling)
}

export interface GlobalSummary {
  totalBrut: number;
  totalNetAfterRemises: number;
  agencyDiscount: number;
  netPLS: number;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

export function formatPrice(num: number): string {
  if (num === 0) return '0 €';
  return num.toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }) + ' €';
}

export function formatNumber(num: number | null | undefined): string {
  if (num == null || num === 0) return '—';
  return num.toLocaleString('fr-FR');
}

export function formatVisuelType(visuels?: VisuelData[] | null): string | null {
  return visuels?.[0]?.type_de_format ?? null;
}

export function formatContact(contacts?: ContactData[] | null): string | null {
  const c = contacts?.[0];
  if (!c) return null;
  const name = [c.prenom, c.nom].filter(Boolean).join(' ');
  return name || c.email || null;
}

// ─── Initialization ──────────────────────────────────────────────────────────

export function initializeLineItem(support: CampaignSupport): DevisLineItem {
  const sd = support.support_data;
  const ov = support.deal_overrides ?? {};

  const canal: Canal = (sd.canal === 'Print' || sd.canal === 'Web' || sd.canal === 'NL')
    ? sd.canal : 'Web';

  const rawBrut = parseTarifText(sd.tarif_brut);
  const _has_tarif = rawBrut > 0;

  // Apply tarif_brut override if present (numeric from previous builder edits)
  const overrideBrut = (ov as Record<string, unknown>).tarif_brut;
  const effectiveBrut = typeof overrideBrut === 'number' ? overrideBrut : rawBrut;

  let quantite = ov.quantite ?? 1;
  let unitPrice = 0;
  let cpmBrut: number | null = null;
  let brutUnitaire: number | null = null;

  switch (canal) {
    case 'Print': {
      quantite = ov.quantite ?? 1;
      unitPrice = quantite > 0 && effectiveBrut > 0 ? effectiveBrut / quantite : effectiveBrut;
      break;
    }
    case 'Web': {
      quantite = 1;
      const impressions = sd.visites_par_mois_web ?? 0;
      cpmBrut = impressions > 0 && effectiveBrut > 0
        ? (effectiveBrut / (impressions / 1000))
        : null;
      // CPM: _unit_price is the CPM rate (€ per 1000 impressions).
      // Forfait: _unit_price is the flat amount.
      unitPrice = sd.type_tarif === 'cpm' ? (cpmBrut ?? 0) : effectiveBrut;
      break;
    }
    case 'NL': {
      if (sd.type_tarif === 'pack') {
        // Pack: tarif_brut is the price for ONE pack of sd.nombre_envois_nl envois.
        // quantite = number of packs purchased (default 1, not nombre_envois_nl).
        // _unit_price = pack price so recalculate-from-quantity scales correctly.
        quantite = ov.quantite ?? 1;
        unitPrice = effectiveBrut;
        brutUnitaire = effectiveBrut; // price per pack, not per envoi
      } else {
        // Unitaire (or legacy forfait): price per envoi, quantite = number of envois.
        quantite = ov.quantite ?? sd.nombre_envois_nl ?? 1;
        unitPrice = quantite > 0 && effectiveBrut > 0 ? effectiveBrut / quantite : effectiveBrut;
        brutUnitaire = unitPrice;
      }
      break;
    }
  }

  const tarifBrut = effectiveBrut;
  const remise1 = ov.remise_1 ?? 0;
  const net = tarifBrut * (1 - remise1 / 100);

  // Web impressions: use persisted override if available, else base value
  const ovAny = ov as Record<string, unknown>;
  const visitesBase = sd.visites_par_mois_web ?? null;
  const visitesMutable = canal === 'Web'
    ? (typeof ovAny.visites_override === 'number' ? ovAny.visites_override : visitesBase)
    : null;

  return {
    id: support.id,
    variant_slug: sd.variant_slug,
    support_name: sd.support_name,
    canal,
    type_tarif: (['forfait', 'cpm', 'pack', 'unitaire'] as const).includes(sd.type_tarif as never)
      ? sd.type_tarif as 'forfait' | 'cpm' | 'pack' | 'unitaire'
      : 'forfait',
    categorie: sd.categorie,
    lectorat: sd.lectorat,
    periodicite_print: sd.periodicite_print ?? null,
    diffusion_print: sd.diffusion_print ?? null,
    format_print: sd.format_print ?? null,
    visites_par_mois_web: visitesMutable ?? (sd.visites_par_mois_web ?? null),
    pages_vues_par_mois_web: sd.pages_vues_par_mois_web ?? null,
    nombre_envois_nl: sd.nombre_envois_nl ?? null,
    dates_parution: sd.dates_parution ?? [],
    dates_bouclage: sd.dates_bouclage ?? [],
    date_parution_override: ov.date_parution ?? null,
    date_bouclage_override: ov.date_bouclage ?? null,
    similarity: sd.similarity ?? undefined,
    visuels_data: sd.visuels_data ?? null,
    contacts_data: sd.contacts_data ?? null,
    url: sd.url ?? null,
    periodicite_nl: sd.periodicite_nl ?? null,
    abonnes_nl: sd.abonnes_nl ?? null,
    taux_ouverture_nl: sd.taux_ouverture_nl ?? null,
    format_nl: sd.format_nl ?? null,
    format_web: sd.format_web ?? null,
    quantite,
    tarif_brut: tarifBrut,
    remise_1: remise1,
    net,
    cpm_brut: cpmBrut,
    visites_mutable: visitesMutable,
    brut_unitaire: brutUnitaire,
    _unit_price: unitPrice,
    _has_tarif,
    _tarif_brut_base: rawBrut > 0 ? rawBrut : effectiveBrut,
    _visites_base: visitesBase,
  };
}

// ─── Recalculation Functions ─────────────────────────────────────────────────

export function recalculateFromQuantity(item: DevisLineItem, newQty: number): DevisLineItem {
  if (newQty < 1) newQty = 1;
  const updated = { ...item, quantite: newQty };

  if (item._unit_price > 0) {
    updated.tarif_brut = item._unit_price * newQty;
  }
  updated.net = updated.tarif_brut * (1 - updated.remise_1 / 100);

  // Update NL brut_unitaire
  if (item.canal === 'NL') {
    updated.brut_unitaire = item._unit_price;
  }

  return updated;
}

export function recalculateFromTarifBrut(item: DevisLineItem, newBrut: number): DevisLineItem {
  if (newBrut < 0) newBrut = 0;
  const updated = { ...item, tarif_brut: newBrut };

  if (item._unit_price > 0) {
    switch (item.canal) {
      case 'Print':
      case 'NL': {
        updated.quantite = Math.max(1, Math.round(newBrut / item._unit_price));
        break;
      }
      case 'Web': {
        // Web: brut is flat, no qty back-calc
        break;
      }
    }
  }

  updated.net = newBrut * (1 - updated.remise_1 / 100);

  // Update NL brut_unitaire
  if (item.canal === 'NL' && updated.quantite > 0) {
    updated.brut_unitaire = newBrut / updated.quantite;
  }

  // Update Web CPM and scale impressions proportionally
  if (item.canal === 'Web') {
    const visitesBase = item._visites_base ?? 0;
    const tarifBase = item._tarif_brut_base > 0 ? item._tarif_brut_base : 0;
    if (visitesBase > 0 && tarifBase > 0 && newBrut > 0) {
      updated.visites_mutable = Math.round((newBrut / tarifBase) * visitesBase);
      updated.visites_par_mois_web = updated.visites_mutable;
    }
    const impressions = updated.visites_par_mois_web ?? 0;
    updated.cpm_brut = impressions > 0 && newBrut > 0
      ? (newBrut / (impressions / 1000))
      : null;
  }

  return updated;
}

/** Direct brut override: set tarif_brut to the typed value without snapping to integer insertions.
 *  Updates _unit_price so subsequent quantity edits scale from the new base. */
export function recalculateFromTarifBrutDirect(item: DevisLineItem, newBrut: number): DevisLineItem {
  if (newBrut < 0) newBrut = 0;
  const updated = { ...item, tarif_brut: newBrut };

  // Recalculate net from the new brut
  updated.net = newBrut * (1 - updated.remise_1 / 100);

  // Anchor _unit_price to the new rate so future qty changes scale correctly
  if (updated.quantite > 0) {
    updated._unit_price = newBrut / updated.quantite;
  }

  // NL: keep brut_unitaire in sync
  if (item.canal === 'NL' && updated.quantite > 0) {
    updated.brut_unitaire = newBrut / updated.quantite;
  }

  return updated;
}

/** CPM Web: user edits impressions → recalculate tarif_brut = (impressions / 1000) × cpm_rate */
export function recalculateFromImpressions(item: DevisLineItem, newImpressions: number): DevisLineItem {
  if (item.type_tarif !== 'cpm' || item.cpm_brut == null || item.cpm_brut <= 0) return item;
  if (newImpressions < 0) newImpressions = 0;
  const newBrut = (newImpressions / 1000) * item.cpm_brut;
  return {
    ...item,
    visites_par_mois_web: newImpressions,
    visites_mutable: newImpressions,
    tarif_brut: newBrut,
    net: newBrut * (1 - item.remise_1 / 100),
  };
}

/** CPM Web: user edits the CPM rate → recalculate tarif_brut = (impressions / 1000) × newRate */
export function recalculateFromCpmRate(item: DevisLineItem, newRate: number): DevisLineItem {
  if (item.type_tarif !== 'cpm') return item;
  if (newRate < 0) newRate = 0;
  const impressions = item.visites_mutable ?? item.visites_par_mois_web ?? 0;
  const newBrut = (impressions / 1000) * newRate;
  return {
    ...item,
    cpm_brut: newRate,
    _unit_price: newRate,
    tarif_brut: newBrut,
    net: newBrut * (1 - item.remise_1 / 100),
  };
}

export function recalculateFromRemise(item: DevisLineItem, newRemise: number): DevisLineItem {
  if (newRemise < 0) newRemise = 0;
  if (newRemise > 100) newRemise = 100;
  const updated = { ...item, remise_1: newRemise };
  updated.net = updated.tarif_brut * (1 - newRemise / 100);
  return updated;
}

// ─── Lock-aware Recalculation Functions ─────────────────────────────────────

/** Edit qty while net is locked → back-calc remise */
export function recalculateFromQtyWithLockedNet(item: DevisLineItem, newQty: number): DevisLineItem {
  if (newQty < 1) newQty = 1;
  const updated = { ...item, quantite: newQty };

  if (item._unit_price > 0) {
    updated.tarif_brut = item._unit_price * newQty;
  }
  // net stays fixed, solve: net = brut × (1 - remise/100) → remise = (1 - net/brut) × 100
  if (updated.tarif_brut > 0) {
    updated.remise_1 = Math.max(0, Math.min(100, (1 - item.net / updated.tarif_brut) * 100));
  }
  // net unchanged

  if (item.canal === 'NL') {
    updated.brut_unitaire = item._unit_price;
  }

  return updated;
}

/** Edit remise while net is locked → back-calc qty */
export function recalculateFromRemiseWithLockedNet(item: DevisLineItem, newRemise: number): DevisLineItem {
  if (newRemise < 0) newRemise = 0;
  if (newRemise > 100) newRemise = 100;
  const updated = { ...item, remise_1: newRemise };

  // net stays fixed, solve: net = (unit × qty) × (1 - remise/100) → qty = net / (unit × (1 - remise/100))
  if (item._unit_price > 0 && newRemise < 100) {
    updated.quantite = Math.max(1, Math.round(item.net / (item._unit_price * (1 - newRemise / 100))));
    updated.tarif_brut = item._unit_price * updated.quantite;
  }
  // net unchanged

  if (item.canal === 'NL') {
    updated.brut_unitaire = item._unit_price;
  }

  return updated;
}

/** Edit net while qty is locked → back-calc remise */
export function recalculateFromNetWithLockedQty(item: DevisLineItem, newNet: number): DevisLineItem {
  if (newNet < 0) newNet = 0;
  const updated = { ...item, net: newNet };

  // brut stays (qty locked → brut = unit × qty stays), solve: net = brut × (1 - remise/100) → remise = (1 - net/brut) × 100
  if (item.tarif_brut > 0) {
    updated.remise_1 = Math.max(0, Math.min(100, (1 - newNet / item.tarif_brut) * 100));
  }

  return updated;
}

/** Edit net while remise is locked → back-calc qty */
export function recalculateFromNetWithLockedRemise(item: DevisLineItem, newNet: number): DevisLineItem {
  if (newNet < 0) newNet = 0;
  const updated = { ...item, net: newNet };

  // remise stays, solve: net = (unit × qty) × (1 - remise/100) → qty = net / (unit × (1 - remise/100))
  if (item._unit_price > 0 && item.remise_1 < 100) {
    updated.quantite = Math.max(1, Math.round(newNet / (item._unit_price * (1 - item.remise_1 / 100))));
    updated.tarif_brut = item._unit_price * updated.quantite;
  }

  if (item.canal === 'NL') {
    updated.brut_unitaire = item._unit_price;
  }

  return updated;
}

/** Snap to nearest integer insertions from a budget target (Print only) */
export function recalculateFromBudgetTarget(item: DevisLineItem, targetBudget: number): DevisLineItem {
  if (targetBudget <= 0) return item;
  const unitBrut = item.quantite > 0 ? item.tarif_brut / item.quantite : item._unit_price;
  if (unitBrut <= 0) return item;
  const snappedQty = Math.max(1, Math.round(targetBudget / unitBrut));
  return recalculateFromQuantity(item, snappedQty);
}

// ─── Global Summary ──────────────────────────────────────────────────────────

export function computeGlobalSummary(items: DevisLineItem[]): GlobalSummary {
  const totalBrut = items.reduce((sum, i) => sum + i.tarif_brut, 0);
  const totalNetAfterRemises = items.reduce((sum, i) => sum + i.net, 0);
  const agencyDiscount = totalNetAfterRemises * AGENCY_DISCOUNT;
  const netPLS = totalNetAfterRemises * NET_MULTIPLIER;

  return { totalBrut, totalNetAfterRemises, agencyDiscount, netPLS };
}

// ─── Overrides extraction ────────────────────────────────────────────────────

export function toOverrides(item: DevisLineItem): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  overrides.quantite = item.quantite;
  overrides.tarif_brut = item.tarif_brut;
  overrides.remise_1 = item.remise_1;
  if (item.canal === 'Web' && item.visites_mutable != null) {
    overrides.visites_override = item.visites_mutable;
  }
  return overrides;
}
