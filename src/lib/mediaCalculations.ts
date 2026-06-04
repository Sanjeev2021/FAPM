/**
 * Media Planning Calculations for Step 3 Revision Page
 *
 * Implements real PLS "régie média" logic:
 * - Web: CPM-based → Tarif brut = (Impressions / 1000) × CPM brut
 * - Print: insertion-based → Tarif brut = prix insertion × nb insertions
 * - Newsletter: envoi-based → Tarif brut = prix par envoi × nb envois
 *
 * Fixed 15% global discount: tarif_net = tarif_brut × 0.85
 */

// ─── Constants ───────────────────────────────────────────────────────────────

export const GLOBAL_DISCOUNT = 0.15;
export const NET_MULTIPLIER = 1 - GLOBAL_DISCOUNT; // 0.85

export const DUREE_OPTIONS = [
  { value: '1_mois', label: '1 mois' },
  { value: '2_mois', label: '2 mois' },
  { value: '3_mois', label: '3 mois' },
  { value: '6_mois', label: '6 mois' },
  { value: '12_mois', label: '12 mois' },
] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export type Canal = 'Print' | 'Web' | 'NL';

export interface MediaLineItem {
  // Passthrough fields (from DB, read-only)
  variant_slug: string;
  support: string;
  support_slug: string;
  canal: Canal;
  categorie: string | null;
  lectorat: string | null;
  format_display: string | null; // resolved format (from format_print or variant_slug)
  periodicite_print: string | null;

  // Puissance — channel-dependent read-only metric
  puissance: number | null;

  // Editable calculation fields
  volume: number;        // impressions (Web), diffusion (Print read-only), envois (NL)
  quantity: number;      // nb insertions (Print), nb envois (NL), 1 for Web
  duree: string;         // duration selection

  // Kept for downstream compat
  plannedDate: string;

  // Computed pricing (numeric)
  tarif_brut_num: number;
  tarif_net_num: number;
  cpm_brut: number | null;   // Web only
  cpm_net: number | null;    // Web only

  // Formatted strings for downstream compat
  tarif_brut: string | null;
  tarif_net: string | null;

  // Hidden: base unit price for recalculations
  _unit_price: number;  // CPM for Web, prix insertion for Print, prix par envoi for NL
  _has_tarif: boolean;  // false if "pas de tarif"

  // Passthrough for downstream (raw DB values)
  format_print: string | null;
  diffusion_print: number | null;
  visites_par_mois_web: number | null;
  pages_vues_par_mois_web: number | null;
  nombre_envois_nl: number | null;

  // Extra passthrough
  planning_data?: any[];
  visuels_data?: any[];
  contacts_data?: any[];
  similarity?: number;
  threshold_used?: number;
}

// ─── Price Parsing / Formatting ──────────────────────────────────────────────

export function parsePrice(tarif: string | null | undefined): number {
  if (!tarif) return 0;
  if (tarif.toLowerCase().includes('pas de tarif')) return 0;
  const cleaned = tarif.replace(/[^\d,.-]/g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extracts ad format from variant_slug for Web supports.
 * e.g. "abcdent-pro::web::300x600-300x250mobile" → "300x600 + 300x250 (mobile)"
 * e.g. "action-co::web::1000x90-300x600" → "1000x90 + 300x600"
 */
function extractWebFormat(variantSlug: string): string | null {
  const parts = variantSlug.split('::');
  const formatPart = parts.length >= 3 ? parts[2] : null;
  if (!formatPart) return null;
  // Split by hyphens that separate format dimensions (but not within a dimension)
  // "300x600-300x250mobile" → ["300x600", "300x250mobile"]
  const formats = formatPart.split(/(?<=\d)-(?=\d)/);
  return formats
    .map((f) => f.replace(/mobile$/i, ' (mobile)').trim())
    .join(' + ');
}

/**
 * Checks if a tarif string represents "no price available"
 */
function hasTarif(tarif: string | null | undefined): boolean {
  if (!tarif) return false;
  if (tarif.toLowerCase().includes('pas de tarif')) return false;
  return parsePrice(tarif) > 0;
}

// ─── Initialization ──────────────────────────────────────────────────────────

/**
 * Converts a raw support object (from Step 2 / DB) into a MediaLineItem.
 *
 * Channel logic:
 * - Web: _unit_price = CPM brut (back-calculated from tarif_brut and visites_par_mois_web)
 * - Print: _unit_price = prix par insertion (tarif_brut with quantity=1)
 * - NL: _unit_price = prix par envoi (tarif_brut / nombre_envois_nl)
 */
export function initializeLineItem(raw: any): MediaLineItem {
  const canal: Canal = (raw.canal === 'Print' || raw.canal === 'Web' || raw.canal === 'NL')
    ? raw.canal
    : 'Web'; // fallback

  const rawBrut = parsePrice(raw.tarif_brut);
  const _has_tarif = hasTarif(raw.tarif_brut);

  let puissance: number | null = null;
  let volume = 0;
  let quantity = raw.quantity || 1;
  let unitPrice = 0;
  let cpmBrut: number | null = null;
  let cpmNet: number | null = null;
  let formatDisplay: string | null = raw.format_print || null;

  switch (canal) {
    case 'Web': {
      puissance = raw.visites_par_mois_web || null;
      // Volume = impressions, default to visites_par_mois_web
      volume = puissance || 0;
      quantity = 1; // Web doesn't use insertions

      // Extract format from variant_slug since format_print is null for Web
      if (!formatDisplay) {
        formatDisplay = extractWebFormat(raw.variant_slug || '');
      }

      // Back-calculate CPM: CPM brut = tarif_brut / (volume / 1000)
      if (volume > 0 && rawBrut > 0) {
        unitPrice = rawBrut / (volume / 1000); // base CPM brut
        cpmBrut = unitPrice;
        cpmNet = (rawBrut * NET_MULTIPLIER) / (volume / 1000);
      } else if (rawBrut > 0) {
        unitPrice = rawBrut; // flat rate fallback
      }
      break;
    }
    case 'Print': {
      puissance = raw.diffusion_print || null;
      volume = puissance || 0; // diffusion is read-only display
      // quantity = nb insertions, default 1
      quantity = raw.quantity || 1;
      // prix insertion = tarif_brut / quantity
      unitPrice = rawBrut > 0 ? rawBrut / quantity : 0;
      break;
    }
    case 'NL': {
      puissance = raw.nombre_envois_nl || null;
      // nombre_envois_nl IS the nb of campaigns (1-5 range)
      // volume = nb envois (same as quantity for NL)
      quantity = puissance || 1;
      volume = quantity;
      // prix par envoi = tarif_brut / nombre_envois
      unitPrice = quantity > 0 && rawBrut > 0 ? rawBrut / quantity : rawBrut;
      break;
    }
  }

  // Compute tarif_brut and tarif_net with fixed 15% remise
  const tarifBrutNum = rawBrut;
  const tarifNetNum = tarifBrutNum * NET_MULTIPLIER;

  return {
    // Passthrough
    variant_slug: raw.variant_slug,
    support: raw.support,
    support_slug: raw.support_slug,
    canal,
    categorie: raw.categorie || null,
    lectorat: raw.lectorat || null,
    format_display: formatDisplay,
    format_print: raw.format_print || null,
    periodicite_print: raw.periodicite_print || null,
    diffusion_print: raw.diffusion_print ?? null,
    visites_par_mois_web: raw.visites_par_mois_web ?? null,
    pages_vues_par_mois_web: raw.pages_vues_par_mois_web ?? null,
    nombre_envois_nl: raw.nombre_envois_nl ?? null,
    planning_data: raw.planning_data,
    visuels_data: raw.visuels_data,
    contacts_data: raw.contacts_data,
    similarity: raw.similarity,
    threshold_used: raw.threshold_used,

    // Puissance
    puissance,

    // Editable
    volume,
    quantity,
    duree: '1_mois',
    plannedDate: raw.plannedDate || '',

    // Computed
    tarif_brut_num: tarifBrutNum,
    tarif_net_num: tarifNetNum,
    cpm_brut: cpmBrut,
    cpm_net: cpmNet,

    // Formatted
    tarif_brut: _has_tarif ? formatPrice(tarifBrutNum) : null,
    tarif_net: _has_tarif ? formatPrice(tarifNetNum) : null,

    // Hidden
    _unit_price: unitPrice,
    _has_tarif,
  };
}

// ─── Recalculation Functions ─────────────────────────────────────────────────

/**
 * Recalculate when VOLUME/IMPRESSIONS changes.
 * - Web: tarif_brut = (impressions / 1000) × CPM brut, net = brut × 0.85
 * - Print: volume is read-only (diffusion), no recalc
 * - NL: volume = nb envois, tarif_brut = prix_par_envoi × nb_envois
 */
export function recalculateFromVolume(item: MediaLineItem, newVolume: number): MediaLineItem {
  if (newVolume < 0) newVolume = 0;
  const updated = { ...item, volume: newVolume };

  switch (item.canal) {
    case 'Web': {
      if (item._unit_price > 0) {
        updated.tarif_brut_num = (newVolume / 1000) * item._unit_price;
      }
      updated.tarif_net_num = updated.tarif_brut_num * NET_MULTIPLIER;
      updated.cpm_brut = newVolume > 0 ? updated.tarif_brut_num / (newVolume / 1000) : null;
      updated.cpm_net = newVolume > 0 ? updated.tarif_net_num / (newVolume / 1000) : null;
      break;
    }
    case 'Print': {
      // Diffusion is read-only context; no pricing change
      break;
    }
    case 'NL': {
      // NL volume = nb envois = quantity
      updated.quantity = newVolume;
      if (item._unit_price > 0) {
        updated.tarif_brut_num = item._unit_price * newVolume;
      }
      updated.tarif_net_num = updated.tarif_brut_num * NET_MULTIPLIER;
      break;
    }
  }

  updated.tarif_brut = formatPrice(updated.tarif_brut_num);
  updated.tarif_net = formatPrice(updated.tarif_net_num);
  return updated;
}

/**
 * Recalculate when TARIF BRUT changes.
 * Derives volume/quantity inversely, then recalcs net and CPM.
 */
export function recalculateFromTarifBrut(item: MediaLineItem, newBrut: number): MediaLineItem {
  if (newBrut < 0) newBrut = 0;
  const updated = { ...item, tarif_brut_num: newBrut };

  switch (item.canal) {
    case 'Web': {
      // impressions = (brut / CPM) × 1000
      if (item._unit_price > 0) {
        updated.volume = Math.round((newBrut / item._unit_price) * 1000);
      }
      updated.tarif_net_num = newBrut * NET_MULTIPLIER;
      updated.cpm_brut = updated.volume > 0 ? newBrut / (updated.volume / 1000) : null;
      updated.cpm_net = updated.volume > 0 ? updated.tarif_net_num / (updated.volume / 1000) : null;
      break;
    }
    case 'Print': {
      // nb_insertions = brut / prix_insertion
      if (item._unit_price > 0) {
        updated.quantity = Math.max(1, Math.round(newBrut / item._unit_price));
      }
      updated.tarif_net_num = newBrut * NET_MULTIPLIER;
      break;
    }
    case 'NL': {
      // nb_envois = brut / prix_par_envoi
      if (item._unit_price > 0) {
        const newQty = Math.max(1, Math.round(newBrut / item._unit_price));
        updated.quantity = newQty;
        updated.volume = newQty;
      }
      updated.tarif_net_num = newBrut * NET_MULTIPLIER;
      break;
    }
  }

  updated.tarif_brut = formatPrice(updated.tarif_brut_num);
  updated.tarif_net = formatPrice(updated.tarif_net_num);
  return updated;
}

/**
 * Recalculate when QUANTITY changes (nb insertions for Print, nb envois for NL).
 * tarif_brut = _unit_price × newQty, net = brut × 0.85
 */
export function recalculateFromQuantity(item: MediaLineItem, newQty: number): MediaLineItem {
  if (newQty < 1) newQty = 1;
  const updated = { ...item, quantity: newQty };

  switch (item.canal) {
    case 'Web': {
      // Web doesn't use quantity as primary driver
      break;
    }
    case 'Print': {
      updated.tarif_brut_num = item._unit_price * newQty;
      updated.tarif_net_num = updated.tarif_brut_num * NET_MULTIPLIER;
      break;
    }
    case 'NL': {
      // NL: quantity = volume = nb envois
      updated.volume = newQty;
      updated.tarif_brut_num = item._unit_price * newQty;
      updated.tarif_net_num = updated.tarif_brut_num * NET_MULTIPLIER;
      break;
    }
  }

  updated.tarif_brut = formatPrice(updated.tarif_brut_num);
  updated.tarif_net = formatPrice(updated.tarif_net_num);
  return updated;
}

// ─── Downstream Conversion ───────────────────────────────────────────────────

/**
 * Converts a MediaLineItem back to the shape expected by Step 4 and edge functions.
 * Preserves all original field names for backward compatibility.
 */
export function toDownstreamFormat(item: MediaLineItem): any {
  return {
    // Core fields expected by Step 4 / exports
    variant_slug: item.variant_slug,
    support: item.support,
    support_slug: item.support_slug,
    canal: item.canal,
    categorie: item.categorie,
    lectorat: item.lectorat,
    tarif_brut: item.tarif_brut,
    tarif_net: item.tarif_net,
    quantity: item.quantity,
    plannedDate: item.plannedDate,

    // DB fields (passthrough)
    format_print: item.format_print,
    periodicite_print: item.periodicite_print,
    diffusion_print: item.diffusion_print,
    visites_par_mois_web: item.visites_par_mois_web,
    pages_vues_par_mois_web: item.pages_vues_par_mois_web,
    nombre_envois_nl: item.nombre_envois_nl,

    // New enrichment fields (additive, won't break downstream)
    volume: item.volume,
    duree: item.duree,
    puissance: item.puissance,
    tarif_brut_num: item.tarif_brut_num,
    tarif_net_num: item.tarif_net_num,
    cpm_brut: item.cpm_brut,
    cpm_net: item.cpm_net,
    format_display: item.format_display,

    // Extra passthrough
    planning_data: item.planning_data,
    visuels_data: item.visuels_data,
    contacts_data: item.contacts_data,
    similarity: item.similarity,
    threshold_used: item.threshold_used,
  };
}
