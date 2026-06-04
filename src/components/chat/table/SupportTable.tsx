import { useState } from 'react';
import { ChevronUpIcon, ChevronDownIcon, MinusIcon, PlusIcon, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CampaignSupport } from '@/components/chat/hooks/useWorkingSet';
import { CanalBadge } from './CanalBadge';
import { MatchIndicator } from './MatchIndicator';
import { parseTarifText, formatTarifDisplay, calculateNet } from '@/lib/pricing';

type Canal = 'Print' | 'Web' | 'NL';
type SortDir = 'asc' | 'desc' | null;
interface SortState { column: string; dir: SortDir }

interface SupportTableProps {
  supports: CampaignSupport[];
  rejectedSupports?: CampaignSupport[];
  onRemove?: (support: CampaignSupport) => void;
  onReAdd?: (supportId: string) => void;
}

function IndexCell({ index }: { index: number }) {
  return (
    <TableCell className="py-2 px-2 text-center text-xs text-muted-foreground/60 font-mono w-[28px]">
      {index}
    </TableCell>
  );
}

function Truncate({ value, className }: { value: string | number | null | undefined; className?: string }) {
  const text = value !== null && value !== undefined && value !== '' ? String(value) : '—';
  return (
    <div className={`truncate ${className ?? ''}`} title={text}>
      {text}
    </div>
  );
}

function SortTrigger({ col, sort, onSort, children }: {
  col: string; sort: SortState; onSort: (c: string) => void; children: React.ReactNode;
}) {
  return (
    <button
      className="flex items-center gap-0.5 text-xs font-bold uppercase tracking-wide hover:text-foreground"
      onClick={() => onSort(col)}
    >
      {children}
      {sort.column === col
        ? sort.dir === 'asc' ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />
        : <span className="w-3 opacity-30">↕</span>}
    </button>
  );
}

function getFieldValue(support: CampaignSupport, field: string): number | string {
  const d = support.support_data as Record<string, unknown>;
  const o = support.deal_overrides as Record<string, unknown>;
  const val = o[field] ?? d[field] ?? '';
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const n = parseTarifText(val);
    return n !== 0 ? n : val;
  }
  return '';
}

function sortSupports(supports: CampaignSupport[], sort: SortState) {
  if (!sort.column || !sort.dir) return supports;
  return [...supports].sort((a, b) => {
    const av = getFieldValue(a, sort.column);
    const bv = getFieldValue(b, sort.column);
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv), 'fr');
    return sort.dir === 'asc' ? cmp : -cmp;
  });
}

// Shared head cells used by all canals
function SharedHeads({ sort, onSort }: { sort: SortState; onSort: (c: string) => void }) {
  return (
    <>
      <TableHead className="w-[130px] py-2 px-2">
        <SortTrigger col="support_name" sort={sort} onSort={onSort}>Nom</SortTrigger>
      </TableHead>
      <TableHead className="w-[90px] py-2 px-2">
        <SortTrigger col="editeur" sort={sort} onSort={onSort}>Éditeur</SortTrigger>
      </TableHead>
      <TableHead className="w-[90px] py-2 px-2">
        <SortTrigger col="categorie" sort={sort} onSort={onSort}>Catégorie</SortTrigger>
      </TableHead>
      <TableHead className="w-[90px] py-2 px-2">
        <SortTrigger col="lectorat" sort={sort} onSort={onSort}>Lectorat</SortTrigger>
      </TableHead>
    </>
  );
}

function SharedCells({ support }: { support: CampaignSupport }) {
  const d = support.support_data;
  const editeur = d.editeur ?? (d.support_slug ? d.support_slug.split('::')[0] : null);
  return (
    <>
      <TableCell className="py-2 px-2 font-semibold">
        <Truncate value={d.support_name} className="max-w-[120px]" />
      </TableCell>
      <TableCell className="py-2 px-2 text-muted-foreground">
        <Truncate value={editeur} className="max-w-[80px]" />
      </TableCell>
      <TableCell className="py-2 px-2">
        <Truncate value={d.categorie} className="max-w-[80px]" />
      </TableCell>
      <TableCell className="py-2 px-2">
        <Truncate value={d.lectorat} className="max-w-[80px]" />
      </TableCell>
    </>
  );
}

function effectiveNet(s: CampaignSupport): number {
  const o = s.deal_overrides;
  const qty = o.quantite ?? 1;
  const hasDiscount = (o.remise_1 ?? 0) > 0 || (o.remise_exceptionnelle ?? 0) > 0 || (o.remise_2 ?? 0) > 0;
  const hasOverride = qty > 1 || hasDiscount;
  return hasOverride
    ? calculateNet(s.support_data.tarif_brut, o.remise_1, o.remise_exceptionnelle, o.remise_2) * qty
    : parseTarifText(s.support_data.tarif_net);
}

function TarifCells({ support }: { support: CampaignSupport }) {
  const d = support.support_data;
  const o = support.deal_overrides;

  const qty = o.quantite ?? 1;
  const hasDiscount = (o.remise_1 ?? 0) > 0 || (o.remise_exceptionnelle ?? 0) > 0 || (o.remise_2 ?? 0) > 0;
  const hasOverride = qty > 1 || hasDiscount;

  const remiseParts = [
    o.remise_1 ? `${o.remise_1}%` : null,
    o.remise_exceptionnelle ? `${o.remise_exceptionnelle}%` : null,
    o.remise_2 ? `${o.remise_2}%` : null,
  ].filter(Boolean);
  const remiseDisplay = remiseParts.length > 0 ? remiseParts.join(' + ') : '—';

  const netRemiseValue = hasOverride
    ? calculateNet(d.tarif_brut, o.remise_1, o.remise_exceptionnelle, o.remise_2) * qty
    : null;
  const isMissing = netRemiseValue === 0 && (!d.tarif_brut || d.tarif_brut.toLowerCase().includes('pas de tarif'));
  const displayNetRemise = !hasOverride
    ? '—'
    : isMissing
      ? 'Non communiqué'
      : netRemiseValue!.toLocaleString('fr-FR') + ' €';

  return (
    <>
      <TableCell className={`py-2 px-2 text-right text-xs ${
        o.quantite
          ? 'text-orange-500 border border-dashed border-orange-300/50 bg-orange-50/30 font-medium'
          : 'italic bg-muted/30 border border-dashed border-muted-foreground/30'
      }`}>
        {o.quantite ?? '—'}
      </TableCell>
      <TableCell className="py-2 px-2 text-right text-xs text-muted-foreground whitespace-nowrap">
        {formatTarifDisplay(d.tarif_brut, 'brut')}
      </TableCell>
      <TableCell className="py-2 px-2 text-right text-xs text-muted-foreground whitespace-nowrap">
        {formatTarifDisplay(d.tarif_net, 'net')}
      </TableCell>
      <TableCell className="py-2 px-2 text-right text-xs text-orange-500 whitespace-nowrap font-medium">
        {remiseDisplay}
      </TableCell>
      <TableCell className="py-2 px-2 text-right text-xs font-medium whitespace-nowrap">
        <span key={displayNetRemise} className={hasOverride ? 'animate-[flash-blue_0.6s_ease-out]' : 'text-muted-foreground'}>
          {displayNetRemise}
        </span>
      </TableCell>
      <TableCell className="py-2 px-2 text-center">
        {d.similarity !== undefined ? <MatchIndicator score={d.similarity} /> : <span className="text-muted-foreground">—</span>}
      </TableCell>
    </>
  );
}

function isDatePast(dateStr: string): boolean {
  if (!dateStr || dateStr === '—') return false;
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parsed < today;
}

function ParutionCell({ support }: { support: CampaignSupport }) {
  const d = support.support_data;
  const o = support.deal_overrides;
  const isOverridden = !!o.date_parution;
  const displayDate = o.date_parution ?? d.dates_parution?.[0] ?? '—';
  const past = isDatePast(displayDate);
  return (
    <TableCell className={`py-2 px-2 text-xs whitespace-nowrap ${
      isOverridden
        ? 'text-orange-500 border border-dashed border-orange-300/50 bg-orange-50/30 font-medium'
        : past ? 'text-amber-600' : 'text-muted-foreground'
    }`}>
      <span className="inline-flex items-center gap-1">
        <Truncate value={displayDate} className="max-w-[70px]" />
        {past && <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />}
      </span>
    </TableCell>
  );
}

function PrintTable({ supports, rejectedSupports, sort, onSort, indexMap, onRemove, onReAdd }: { supports: CampaignSupport[]; rejectedSupports: CampaignSupport[]; sort: SortState; onSort: (c: string) => void; indexMap: Map<string, number>; onRemove?: (s: CampaignSupport) => void; onReAdd?: (id: string) => void }) {
  const sorted = sortSupports(supports, sort);
  const subtotal = sorted.reduce((s, x) => s + effectiveNet(x), 0);
  const colCount = 1 + 4 + 3 + 1 + 6 + 1; // index + shared + print-specific(3) + parution(1) + tarif/match(6) + action
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableHead colSpan={colCount} className="py-1.5 px-2">
            <CanalBadge canal="Print" />
            <span className="ml-2 text-xs text-muted-foreground font-normal">{supports.length} support{supports.length > 1 ? 's' : ''}</span>
          </TableHead>
        </TableRow>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[28px] py-2 px-2 text-center text-xs text-muted-foreground/60">#</TableHead>
          <SharedHeads sort={sort} onSort={onSort} />
          <TableHead className="w-[80px] py-2 px-2"><SortTrigger col="periodicite_print" sort={sort} onSort={onSort}>Périodicité</SortTrigger></TableHead>
          <TableHead className="w-[60px] py-2 px-2"><SortTrigger col="diffusion_print" sort={sort} onSort={onSort}>Diffusion</SortTrigger></TableHead>
          <TableHead className="w-[60px] py-2 px-2"><SortTrigger col="format_print" sort={sort} onSort={onSort}>Format</SortTrigger></TableHead>
          <TableHead className="w-[80px] py-2 px-2">Parution</TableHead>
          <TableHead className="w-[40px] py-2 px-2 text-right italic opacity-70">Qté</TableHead>
          <TableHead className="w-[80px] py-2 px-2 text-right">Tarif brut</TableHead>
          <TableHead className="w-[80px] py-2 px-2 text-right">Tarif net</TableHead>
          <TableHead className="w-[70px] py-2 px-2 text-right">Remise</TableHead>
          <TableHead className="w-[80px] py-2 px-2 text-right">Net remisé</TableHead>
          <TableHead className="w-[50px] py-2 px-2 text-center">Match</TableHead>
          <TableHead className="w-[32px] py-2 px-1" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((s) => (
          <TableRow key={s.id} className="text-sm">
            <IndexCell index={indexMap.get(s.id) ?? 0} />
            <SharedCells support={s} />
            <TableCell className="py-2 px-2"><Truncate value={s.support_data.periodicite_print} className="max-w-[70px]" /></TableCell>
            <TableCell className="py-2 px-2 text-right">{s.support_data.diffusion_print ?? '—'}</TableCell>
            <TableCell className="py-2 px-2"><Truncate value={s.support_data.format_print} className="max-w-[55px]" /></TableCell>
            <ParutionCell support={s} />
            <TarifCells support={s} />
            <TableCell className="py-2 px-1">
              <Button variant="ghost" size="icon" className="h-6 w-6 group" onClick={() => onRemove?.(s)}>
                <MinusIcon className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-destructive" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
        {rejectedSupports.length > 0 && (
          <>
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={colCount} className="py-1 px-2 text-xs text-muted-foreground/60 italic border-t border-dashed">
                {rejectedSupports.length} retiré{rejectedSupports.length > 1 ? 's' : ''}
              </TableCell>
            </TableRow>
            {rejectedSupports.map((s) => (
              <TableRow key={s.id} className="text-sm opacity-40">
                <IndexCell index={indexMap.get(s.id) ?? 0} />
                <SharedCells support={s} />
                <TableCell className="py-2 px-2"><Truncate value={s.support_data.periodicite_print} className="max-w-[70px]" /></TableCell>
                <TableCell className="py-2 px-2 text-right">{s.support_data.diffusion_print ?? '—'}</TableCell>
                <TableCell className="py-2 px-2"><Truncate value={s.support_data.format_print} className="max-w-[55px]" /></TableCell>
                <ParutionCell support={s} />
                <TarifCells support={s} />
                <TableCell className="py-2 px-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6 group" onClick={() => onReAdd?.(s.id)}>
                    <PlusIcon className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </>
        )}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={colCount - 2} className="py-1.5 px-2 text-right text-xs font-semibold">Net Print :</TableCell>
          <TableCell className="py-1.5 px-2 text-right text-xs font-bold whitespace-nowrap">{formatTarifDisplay(String(subtotal))}</TableCell>
          <TableCell />
        </TableRow>
      </TableFooter>
    </Table>
  );
}

function WebTable({ supports, rejectedSupports, sort, onSort, indexMap, onRemove, onReAdd }: { supports: CampaignSupport[]; rejectedSupports: CampaignSupport[]; sort: SortState; onSort: (c: string) => void; indexMap: Map<string, number>; onRemove?: (s: CampaignSupport) => void; onReAdd?: (id: string) => void }) {
  const sorted = sortSupports(supports, sort);
  const subtotal = sorted.reduce((s, x) => s + effectiveNet(x), 0);
  const colCount = 1 + 4 + 2 + 6 + 1; // index + shared + web-specific(2) + tarif/match(6) + action
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableHead colSpan={colCount} className="py-1.5 px-2">
            <CanalBadge canal="Web" />
            <span className="ml-2 text-xs text-muted-foreground font-normal">{supports.length} support{supports.length > 1 ? 's' : ''}</span>
          </TableHead>
        </TableRow>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[28px] py-2 px-2 text-center text-xs text-muted-foreground/60">#</TableHead>
          <SharedHeads sort={sort} onSort={onSort} />
          <TableHead className="w-[80px] py-2 px-2"><SortTrigger col="visites_par_mois_web" sort={sort} onSort={onSort}>Visites/mois</SortTrigger></TableHead>
          <TableHead className="w-[80px] py-2 px-2"><SortTrigger col="pages_vues_par_mois_web" sort={sort} onSort={onSort}>Pages vues/mois</SortTrigger></TableHead>
          <TableHead className="w-[40px] py-2 px-2 text-right italic opacity-70">Qté</TableHead>
          <TableHead className="w-[80px] py-2 px-2 text-right">Tarif brut</TableHead>
          <TableHead className="w-[80px] py-2 px-2 text-right">Tarif net</TableHead>
          <TableHead className="w-[70px] py-2 px-2 text-right">Remise</TableHead>
          <TableHead className="w-[80px] py-2 px-2 text-right">Net remisé</TableHead>
          <TableHead className="w-[50px] py-2 px-2 text-center">Match</TableHead>
          <TableHead className="w-[32px] py-2 px-1" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((s) => (
          <TableRow key={s.id} className="text-sm">
            <IndexCell index={indexMap.get(s.id) ?? 0} />
            <SharedCells support={s} />
            <TableCell className="py-2 px-2 text-right">{s.support_data.visites_par_mois_web != null ? Number(s.support_data.visites_par_mois_web).toLocaleString('fr-FR') : '—'}</TableCell>
            <TableCell className="py-2 px-2 text-right">{s.support_data.pages_vues_par_mois_web != null ? Number(s.support_data.pages_vues_par_mois_web).toLocaleString('fr-FR') : '—'}</TableCell>
            <TarifCells support={s} />
            <TableCell className="py-2 px-1">
              <Button variant="ghost" size="icon" className="h-6 w-6 group" onClick={() => onRemove?.(s)}>
                <MinusIcon className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-destructive" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
        {rejectedSupports.length > 0 && (
          <>
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={colCount} className="py-1 px-2 text-xs text-muted-foreground/60 italic border-t border-dashed">
                {rejectedSupports.length} retiré{rejectedSupports.length > 1 ? 's' : ''}
              </TableCell>
            </TableRow>
            {rejectedSupports.map((s) => (
              <TableRow key={s.id} className="text-sm opacity-40">
                <IndexCell index={indexMap.get(s.id) ?? 0} />
                <SharedCells support={s} />
                <TableCell className="py-2 px-2 text-right">{s.support_data.visites_par_mois_web != null ? Number(s.support_data.visites_par_mois_web).toLocaleString('fr-FR') : '—'}</TableCell>
                <TableCell className="py-2 px-2 text-right">{s.support_data.pages_vues_par_mois_web != null ? Number(s.support_data.pages_vues_par_mois_web).toLocaleString('fr-FR') : '—'}</TableCell>
                <TarifCells support={s} />
                <TableCell className="py-2 px-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6 group" onClick={() => onReAdd?.(s.id)}>
                    <PlusIcon className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </>
        )}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={colCount - 2} className="py-1.5 px-2 text-right text-xs font-semibold">Net Web :</TableCell>
          <TableCell className="py-1.5 px-2 text-right text-xs font-bold whitespace-nowrap">{formatTarifDisplay(String(subtotal))}</TableCell>
          <TableCell />
        </TableRow>
      </TableFooter>
    </Table>
  );
}

function NLTable({ supports, rejectedSupports, sort, onSort, indexMap, onRemove, onReAdd }: { supports: CampaignSupport[]; rejectedSupports: CampaignSupport[]; sort: SortState; onSort: (c: string) => void; indexMap: Map<string, number>; onRemove?: (s: CampaignSupport) => void; onReAdd?: (id: string) => void }) {
  const sorted = sortSupports(supports, sort);
  const subtotal = sorted.reduce((s, x) => s + effectiveNet(x), 0);
  const colCount = 1 + 4 + 1 + 1 + 6 + 1; // index + shared + nl-specific(1) + parution(1) + tarif/match(6) + action
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableHead colSpan={colCount} className="py-1.5 px-2">
            <CanalBadge canal="NL" />
            <span className="ml-2 text-xs text-muted-foreground font-normal">{supports.length} support{supports.length > 1 ? 's' : ''}</span>
          </TableHead>
        </TableRow>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[28px] py-2 px-2 text-center text-xs text-muted-foreground/60">#</TableHead>
          <SharedHeads sort={sort} onSort={onSort} />
          <TableHead className="w-[70px] py-2 px-2"><SortTrigger col="nombre_envois_nl" sort={sort} onSort={onSort}>Nb envois</SortTrigger></TableHead>
          <TableHead className="w-[80px] py-2 px-2">Parution</TableHead>
          <TableHead className="w-[40px] py-2 px-2 text-right italic opacity-70">Qté</TableHead>
          <TableHead className="w-[80px] py-2 px-2 text-right">Tarif brut</TableHead>
          <TableHead className="w-[80px] py-2 px-2 text-right">Tarif net</TableHead>
          <TableHead className="w-[70px] py-2 px-2 text-right">Remise</TableHead>
          <TableHead className="w-[80px] py-2 px-2 text-right">Net remisé</TableHead>
          <TableHead className="w-[50px] py-2 px-2 text-center">Match</TableHead>
          <TableHead className="w-[32px] py-2 px-1" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((s) => (
          <TableRow key={s.id} className="text-sm">
            <IndexCell index={indexMap.get(s.id) ?? 0} />
            <SharedCells support={s} />
            <TableCell className="py-2 px-2 text-right">{s.support_data.nombre_envois_nl ?? '—'}</TableCell>
            <ParutionCell support={s} />
            <TarifCells support={s} />
            <TableCell className="py-2 px-1">
              <Button variant="ghost" size="icon" className="h-6 w-6 group" onClick={() => onRemove?.(s)}>
                <MinusIcon className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-destructive" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
        {rejectedSupports.length > 0 && (
          <>
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={colCount} className="py-1 px-2 text-xs text-muted-foreground/60 italic border-t border-dashed">
                {rejectedSupports.length} retiré{rejectedSupports.length > 1 ? 's' : ''}
              </TableCell>
            </TableRow>
            {rejectedSupports.map((s) => (
              <TableRow key={s.id} className="text-sm opacity-40">
                <IndexCell index={indexMap.get(s.id) ?? 0} />
                <SharedCells support={s} />
                <TableCell className="py-2 px-2 text-right">{s.support_data.nombre_envois_nl ?? '—'}</TableCell>
                <ParutionCell support={s} />
                <TarifCells support={s} />
                <TableCell className="py-2 px-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6 group" onClick={() => onReAdd?.(s.id)}>
                    <PlusIcon className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </>
        )}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={colCount - 2} className="py-1.5 px-2 text-right text-xs font-semibold">Net NL :</TableCell>
          <TableCell className="py-1.5 px-2 text-right text-xs font-bold whitespace-nowrap">{formatTarifDisplay(String(subtotal))}</TableCell>
          <TableCell />
        </TableRow>
      </TableFooter>
    </Table>
  );
}

export function SupportTable({ supports, rejectedSupports = [], onRemove, onReAdd }: SupportTableProps) {
  const [sort, setSort] = useState<SortState>({ column: '', dir: null });

  // Stable 1-based index across ALL supports (selected + rejected) by insertion order.
  // Numbers never shift when supports are removed — may have gaps (e.g. 1, 3, 5).
  // Matches LÉO's working set context numbering.
  const allByInsertion = [...supports, ...rejectedSupports]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const indexMap = new Map(allByInsertion.map((s, i) => [s.id, i + 1]));

  const printSupports = supports.filter((s) => s.support_data.canal === 'Print');
  const webSupports = supports.filter((s) => s.support_data.canal === 'Web');
  const nlSupports = supports.filter((s) => s.support_data.canal === 'NL');

  const rejectedPrint = rejectedSupports.filter((s) => s.support_data.canal === 'Print');
  const rejectedWeb = rejectedSupports.filter((s) => s.support_data.canal === 'Web');
  const rejectedNL = rejectedSupports.filter((s) => s.support_data.canal === 'NL');

  const grandTotal = supports.reduce((s, x) => s + effectiveNet(x), 0);

  const handleSort = (column: string) => {
    setSort((prev) => {
      if (prev.column !== column) return { column, dir: 'asc' };
      if (prev.dir === 'asc') return { column, dir: 'desc' };
      return { column: '', dir: null };
    });
  };

  const showPrint = printSupports.length > 0 || rejectedPrint.length > 0;
  const showWeb = webSupports.length > 0 || rejectedWeb.length > 0;
  const showNL = nlSupports.length > 0 || rejectedNL.length > 0;

  return (
    <div className="flex flex-col divide-y divide-border">
      {showPrint && <PrintTable supports={printSupports} rejectedSupports={rejectedPrint} sort={sort} onSort={handleSort} indexMap={indexMap} onRemove={onRemove} onReAdd={onReAdd} />}
      {showWeb && <WebTable supports={webSupports} rejectedSupports={rejectedWeb} sort={sort} onSort={handleSort} indexMap={indexMap} onRemove={onRemove} onReAdd={onReAdd} />}
      {showNL && <NLTable supports={nlSupports} rejectedSupports={rejectedNL} sort={sort} onSort={handleSort} indexMap={indexMap} onRemove={onRemove} onReAdd={onReAdd} />}

      {supports.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 text-sm font-bold">
          <span>Total net global</span>
          <span>{formatTarifDisplay(String(grandTotal))}</span>
        </div>
      )}
    </div>
  );
}
