export function calculateNet(
  brutText: string | null | undefined,
  remise1 = 0,
  remiseExcept = 0,
  remise2 = 0
): number {
  const brut = parseTarifText(brutText);
  return brut * (1 - remise1 / 100) * (1 - remiseExcept / 100) * (1 - remise2 / 100);
}

export function parseTarifText(tarif: string | null | undefined): number {
  if (!tarif || tarif.toLowerCase().includes('pas de tarif')) return 0;
  let normalized = tarif.replace(/[^\d.,]/g, ''); // strip currency symbols, spaces, etc.
  if (normalized.includes('.') && normalized.includes(',')) {
    // French format: "1.500,50" → dot=thousands, comma=decimal
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes('.')) {
    // "1.500" (thousands) vs "1.5" (decimal): 3 digits after last dot = thousands separator
    const afterLastDot = normalized.slice(normalized.lastIndexOf('.') + 1);
    if (afterLastDot.length === 3) {
      normalized = normalized.replace(/\./g, '');
    }
  } else {
    // "1500" or "1500,50" → comma is decimal
    normalized = normalized.replace(',', '.');
  }
  const numeric = parseFloat(normalized);
  return isNaN(numeric) ? 0 : numeric;
}

export function formatTarifDisplay(tarif: string | null | undefined, label?: 'brut' | 'net'): string {
  const value = parseTarifText(tarif);
  if (value === 0 && (!tarif || tarif.toLowerCase().includes('pas de tarif'))) {
    return 'Non communiqué';
  }
  const suffix = label ? ` (${label})` : '';
  return value.toLocaleString('fr-FR') + ' €' + suffix;
}
