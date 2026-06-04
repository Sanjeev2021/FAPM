import { useState } from 'react';
import { Badge } from "@/components/ui/badge";
import { parseTarifText, formatTarifDisplay } from "@/lib/pricing";
import { ChevronDown, ChevronUp } from 'lucide-react';

interface Visuel {
  type_de_format: string | null;
  fichier_url: string | null;
  notes: string | null;
}

interface Support {
  variant_slug: string;
  support_name: string;
  canal: string;
  categorie: string | null;
  lectorat: string | null;
  tarif_brut: string | null;
  tarif_net: string | null;
  periodicite_print: string | null;
  diffusion_print: number | null;
  visites_par_mois_web: number | null;
  pages_vues_par_mois_web: number | null;
  nombre_envois_nl: number | null;
  format_print: string | null;
  similarity: number;
  visuels: Visuel[] | null;
  specs_techniques: string | null;
}

interface RagSearchResult {
  supports: Support[];
  total: number;
  thresholdUsed: number;
}

// Results at or above this score are shown by default.
// Below it they are collapsed under "Voir aussi".
const RELEVANCE_THRESHOLD = 0.60;

// Even if fewer than this many results are above the threshold,
// we always show at least this many so the user sees something.
const MIN_PRIMARY = 5;

const CANAL_COLORS: Record<string, string> = {
  Print: "bg-blue-100 text-blue-800",
  Web: "bg-green-100 text-green-800",
  NL: "bg-purple-100 text-purple-800",
};

function formatNumber(n: number): string {
  return n.toLocaleString("fr-FR");
}

function ReachMetric({ support }: { support: Support }) {
  if (support.canal === "Print" && support.diffusion_print) {
    return <Chip>{formatNumber(support.diffusion_print)} ex.</Chip>;
  }
  if (support.canal === "Web" && support.visites_par_mois_web) {
    return <Chip>{formatNumber(support.visites_par_mois_web)} visites/mois</Chip>;
  }
  if (support.canal === "NL" && support.nombre_envois_nl) {
    return <Chip>{formatNumber(support.nombre_envois_nl)} abonnés</Chip>;
  }
  return null;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground">
      {children}
    </span>
  );
}

function MatchScore({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 70 ? 'text-green-600' :
    pct >= 60 ? 'text-amber-500' :
                'text-muted-foreground';
  return (
    <span className={`text-xs font-medium ${color}`}>
      {pct}% match
    </span>
  );
}

function SupportCard({ support }: { support: Support }) {
  // Prefer tarif_net over tarif_brut; format with French locale (thousands separator,
  // comma decimal, € suffix). "pas de tarif" / null → "Non communiqué" in muted style.
  const rawPrice = support.tarif_net || support.tarif_brut;
  const priceValue = parseTarifText(rawPrice);
  const hasPrice = priceValue > 0;
  const formattedPrice = formatTarifDisplay(rawPrice);

  const formatTypes = (support.visuels ?? [])
    .map((v) => v.type_de_format)
    .filter(Boolean) as string[];

  return (
    <div className="rounded-md border bg-card p-3 space-y-2">
      {/* Row 1: name + price */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold leading-tight">{support.support_name}</span>
        <span className={`shrink-0 ${hasPrice ? 'text-sm font-bold text-primary' : 'text-xs italic text-muted-foreground'}`}>
          {formattedPrice}
        </span>
      </div>

      {/* Row 2: lectorat */}
      {support.lectorat && (
        <p className="text-xs text-muted-foreground leading-relaxed">{support.lectorat}</p>
      )}

      {/* Row 3: chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {support.periodicite_print && <Chip>{support.periodicite_print}</Chip>}
        {support.format_print && <Chip>{support.format_print}</Chip>}
        {formatTypes.map((f) => (
          <Chip key={f}>{f}</Chip>
        ))}
        <ReachMetric support={support} />
      </div>

      {/* Row 4: specs techniques */}
      {support.specs_techniques && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Specs : </span>
          {support.specs_techniques}
        </p>
      )}

      {/* Row 5: match score — color-coded */}
      <div className="flex justify-end pt-0.5">
        <MatchScore score={support.similarity} />
      </div>
    </div>
  );
}

function groupByCanal(supports: Support[]): Record<string, Support[]> {
  return supports.reduce<Record<string, Support[]>>((acc, s) => {
    const key = s.canal || "Autre";
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});
}

function SupportGroup({ canal, supports }: { canal: string; supports: Support[] }) {
  return (
    <div>
      <Badge
        variant="secondary"
        className={`mb-2 text-xs ${CANAL_COLORS[canal] || ""}`}
      >
        {canal} ({supports.length})
      </Badge>
      <div className="space-y-2">
        {supports.map((s) => (
          <SupportCard key={s.variant_slug} support={s} />
        ))}
      </div>
    </div>
  );
}

export function SupportsArtifact({ result }: { result: unknown }) {
  const [showAll, setShowAll] = useState(false);
  const data = result as RagSearchResult;

  if (!data?.supports?.length) {
    return (
      <div className="mt-2 py-3 text-sm text-muted-foreground">
        Aucun support trouvé.
      </div>
    );
  }

  // RPC returns results sorted by similarity DESC. Partition into:
  // - primary: ≥ RELEVANCE_THRESHOLD (shown by default)
  // - secondary: < RELEVANCE_THRESHOLD (collapsed under "Voir aussi")
  // Always guarantee at least MIN_PRIMARY results are visible.
  const aboveThreshold = data.supports.filter(s => s.similarity >= RELEVANCE_THRESHOLD);
  const primaryCount = Math.max(aboveThreshold.length, Math.min(MIN_PRIMARY, data.supports.length));
  const primarySupports = data.supports.slice(0, primaryCount);
  const secondarySupports = data.supports.slice(primaryCount);

  const displayedSupports = showAll ? data.supports : primarySupports;
  const grouped = groupByCanal(displayedSupports);

  // Secondary grouped for the expand section
  const secondaryGrouped = showAll ? {} : groupByCanal(secondarySupports);

  return (
    <div className="mt-2">
      {/* Header */}
      <div className="py-3 px-4 flex items-baseline gap-2">
        <span className="text-sm font-semibold">
          {primaryCount} support{primaryCount > 1 ? 's' : ''} pertinent{primaryCount > 1 ? 's' : ''}
        </span>
        {secondarySupports.length > 0 && !showAll && (
          <span className="text-xs text-muted-foreground">
            + {secondarySupports.length} moins pertinent{secondarySupports.length > 1 ? 's' : ''}
          </span>
        )}
        {showAll && (
          <span className="text-xs text-muted-foreground">
            ({data.supports.length} au total)
          </span>
        )}
      </div>

      {/* Primary results */}
      <div className="px-4 pb-2 pt-0 space-y-4">
        {Object.entries(grouped).map(([canal, supports]) => (
          <SupportGroup key={canal} canal={canal} supports={supports} />
        ))}
      </div>

      {/* Secondary results — shown only when expanded */}
      {showAll && Object.keys(secondaryGrouped).length > 0 && (
        <div className="px-4 pb-2 pt-3 space-y-4 border-t border-dashed mt-2 opacity-75">
          <p className="text-xs text-muted-foreground mb-2">
            Résultats moins pertinents (&lt;{Math.round(RELEVANCE_THRESHOLD * 100)}% match)
          </p>
          {Object.entries(secondaryGrouped).map(([canal, supports]) => (
            <SupportGroup key={canal} canal={canal} supports={supports} />
          ))}
        </div>
      )}

      {/* Expand / collapse toggle */}
      {secondarySupports.length > 0 && (
        <div className="px-4 pb-3">
          <button
            onClick={() => setShowAll(v => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAll ? (
              <><ChevronUp className="h-3 w-3" />Masquer les résultats moins pertinents</>
            ) : (
              <><ChevronDown className="h-3 w-3" />Voir {secondarySupports.length} résultat{secondarySupports.length > 1 ? 's' : ''} moins pertinent{secondarySupports.length > 1 ? 's' : ''} (&lt;{Math.round(RELEVANCE_THRESHOLD * 100)}% match)</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
