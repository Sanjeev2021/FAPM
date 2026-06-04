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
  // French format: dot = thousands separator, comma = decimal (e.g. "1.500,50")
  if (normalized.includes('.') && normalized.includes(',')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else {
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
