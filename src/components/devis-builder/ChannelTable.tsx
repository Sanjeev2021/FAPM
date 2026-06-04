import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Trash2, AlertTriangle } from 'lucide-react';
import { EditableCell } from './EditableCell';
import { MatchIndicator } from '@/components/chat/table/MatchIndicator';
import type { DevisLineItem, Canal, LockedField } from '@/lib/devisCalculations';
import { formatPrice, formatNumber, formatVisuelType, formatContact } from '@/lib/devisCalculations';

interface ChannelTableProps {
  channel: Canal;
  items: DevisLineItem[];
  onEditField: (itemId: string, field: 'quantite' | 'tarif_brut' | 'remise_1' | 'net' | 'visites' | 'cpm_rate', value: number) => void;
  onRemove: (itemId: string) => void;
  lockedFields: Record<string, LockedField>;
  onToggleLock: (itemId: string, field: LockedField) => void;
}

function extractDate(entry: unknown): string {
  if (!entry) return '—';
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'object' && entry !== null && 'date' in entry) {
    return (entry as { date: string }).date;
  }
  return '—';
}

function isDatePast(dateStr: string): boolean {
  if (!dateStr || dateStr === '—') return false;
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parsed < today;
}

function DateWithWarning({ dateStr }: { dateStr: string }) {
  const past = isDatePast(dateStr);
  return (
    <span className={`inline-flex items-center gap-1 ${past ? 'text-amber-600' : ''}`}>
      {dateStr}
      {past && <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />}
    </span>
  );
}

function NdCell() {
  return (
    <TableCell className="py-2 text-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-gray-400 italic text-[10px] cursor-default" tabIndex={0}>ND</span>
        </TooltipTrigger>
        <TooltipContent>Non disponible</TooltipContent>
      </Tooltip>
    </TableCell>
  );
}

function MatchCell({ similarity }: { similarity?: number }) {
  return (
    <TableCell className="py-2 text-center">
      {similarity != null ? <MatchIndicator score={similarity} /> : <span className="text-muted-foreground">—</span>}
    </TableCell>
  );
}

function PrintHeaders() {
  return (
    <TableRow className="bg-gray-50">
      <TableHead className="text-xs font-medium min-w-[140px] sticky left-0 z-10 bg-gray-50 border-r border-gray-200">Support</TableHead>
      <TableHead className="text-xs font-medium text-center min-w-[60px]">Match</TableHead>
      <TableHead className="text-xs font-medium min-w-[90px]">Périodicité</TableHead>
      <TableHead className="text-xs font-medium text-right min-w-[80px]">Diffusion</TableHead>
      <TableHead className="text-xs font-medium text-right min-w-[60px]">OJD</TableHead>
      <TableHead className="text-xs font-medium text-center min-w-[80px]">Insertions</TableHead>
      <TableHead className="text-xs font-medium text-right min-w-[100px]">Brut total</TableHead>
      <TableHead className="text-xs font-medium text-right min-w-[80px]">Remise %</TableHead>
      <TableHead className="text-xs font-medium text-right min-w-[90px]">Net</TableHead>
      <TableHead className="text-xs font-medium min-w-[90px]">Bouclage</TableHead>
      <TableHead className="text-xs font-medium min-w-[90px]">Parution</TableHead>
      <TableHead className="text-xs font-medium min-w-[90px]">Emplacement</TableHead>
      <TableHead className="text-xs font-medium min-w-[90px]">Dimension</TableHead>
      <TableHead className="text-xs font-medium min-w-[80px]">Format fichier</TableHead>
      <TableHead className="text-xs font-medium min-w-[120px]">Contact</TableHead>
      <TableHead className="w-[36px]" />
    </TableRow>
  );
}

function WebHeaders() {
  return (
    <TableRow className="bg-gray-50">
      <TableHead className="text-xs font-medium min-w-[140px] sticky left-0 z-10 bg-gray-50 border-r border-gray-200">Support</TableHead>
      <TableHead className="text-xs font-medium text-center min-w-[60px]">Match</TableHead>
      <TableHead className="text-xs font-medium min-w-[100px]">URL</TableHead>
      <TableHead className="text-xs font-medium min-w-[100px]">Cibles</TableHead>
      <TableHead className="text-xs font-medium text-right min-w-[80px]">Visites/mois</TableHead>
      <TableHead className="text-xs font-medium text-right min-w-[80px]">PV/mois</TableHead>
      <TableHead className="text-xs font-medium min-w-[80px]">Format</TableHead>
      <TableHead className="text-xs font-medium min-w-[70px]">Durée</TableHead>
      <TableHead className="text-xs font-medium text-right min-w-[80px]">Impr. vendues</TableHead>
      <TableHead className="text-xs font-medium text-right min-w-[100px]">Tarif Brut</TableHead>
      <TableHead className="text-xs font-medium text-right min-w-[75px]">CPM brut</TableHead>
      <TableHead className="text-xs font-medium text-right min-w-[80px]">Remise %</TableHead>
      <TableHead className="text-xs font-medium text-right min-w-[90px]">Tarif net</TableHead>
      <TableHead className="w-[36px]" />
    </TableRow>
  );
}

function NLHeaders() {
  return (
    <TableRow className="bg-gray-50">
      <TableHead className="text-xs font-medium min-w-[140px] sticky left-0 z-10 bg-gray-50 border-r border-gray-200">Support</TableHead>
      <TableHead className="text-xs font-medium text-center min-w-[60px]">Match</TableHead>
      <TableHead className="text-xs font-medium min-w-[100px]">URL</TableHead>
      <TableHead className="text-xs font-medium min-w-[100px]">Cibles</TableHead>
      <TableHead className="text-xs font-medium min-w-[90px]">Périodicité</TableHead>
      <TableHead className="text-xs font-medium text-right min-w-[80px]">Abonnés</TableHead>
      <TableHead className="text-xs font-medium text-right min-w-[80px]">Taux ouverture</TableHead>
      <TableHead className="text-xs font-medium min-w-[80px]">Format</TableHead>
      <TableHead className="text-xs font-medium text-center min-w-[80px]">Nb envois</TableHead>
      <TableHead className="text-xs font-medium text-right min-w-[90px]">Brut unitaire</TableHead>
      <TableHead className="text-xs font-medium text-right min-w-[100px]">Brut total</TableHead>
      <TableHead className="text-xs font-medium text-right min-w-[80px]">Remise %</TableHead>
      <TableHead className="text-xs font-medium text-right min-w-[90px]">Total net</TableHead>
      <TableHead className="w-[36px]" />
    </TableRow>
  );
}

function DeleteButton({ onRemove }: { onRemove: () => void }) {
  return (
    <TableCell className="py-2">
      <Button
        size="sm"
        variant="ghost"
        onClick={onRemove}
        className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </TableCell>
  );
}

function PrintRow({ item, onEditField, onRemove, locked, onToggleLock }: {
  item: DevisLineItem;
  onEditField: ChannelTableProps['onEditField'];
  onRemove: () => void;
  locked: LockedField;
  onToggleLock: (field: LockedField) => void;
}) {
  return (
    <TableRow className="group">
      <TableCell className="py-2 sticky left-0 z-10 bg-white border-r border-gray-200">
        <div className="font-medium text-gray-900 text-xs">{item.support_name}</div>
      </TableCell>
      <MatchCell similarity={item.similarity} />
      <TableCell className="py-2 text-xs text-gray-600">{item.periodicite_print || '—'}</TableCell>
      <TableCell className="py-2 text-right text-xs text-gray-500">{formatNumber(item.diffusion_print)}</TableCell>
      <NdCell />
      <TableCell className="py-2">
        <EditableCell
          value={item.quantite}
          onCommit={(v) => onEditField(item.id, 'quantite', Math.max(1, Math.round(v)))}
          disabled={!item._has_tarif}
          integer
          min={1}
          step={1}
          locked={locked === 'quantite'}
          onToggleLock={() => onToggleLock('quantite')}
        />
      </TableCell>
      <TableCell className="py-2 text-right">
        {item._has_tarif ? (
          <EditableCell
            value={item.tarif_brut}
            onCommit={(v) => onEditField(item.id, 'tarif_brut', v)}
            format="currency"
            step={500}
            min={0}
          />
        ) : (
          <span className="text-xs text-gray-600">—</span>
        )}
      </TableCell>
      <TableCell className="py-2">
        <EditableCell
          value={item.remise_1}
          onCommit={(v) => onEditField(item.id, 'remise_1', v)}
          format="percent"
          step={5}
          min={0}
          locked={locked === 'remise_1'}
          onToggleLock={() => onToggleLock('remise_1')}
        />
      </TableCell>
      <TableCell className="py-2">
        <EditableCell
          value={item.net}
          onCommit={(v) => onEditField(item.id, 'net', v)}
          disabled={!item._has_tarif}
          format="currency"
          step={500}
          min={0}
          locked={locked === 'net'}
          onToggleLock={() => onToggleLock('net')}
        />
      </TableCell>
      <TableCell className="py-2 text-xs text-gray-600">
        <DateWithWarning dateStr={item.date_bouclage_override || extractDate(item.dates_bouclage?.[0])} />
      </TableCell>
      <TableCell className="py-2 text-xs text-gray-600">
        <DateWithWarning dateStr={item.date_parution_override || extractDate(item.dates_parution?.[0])} />
      </TableCell>
      <NdCell />
      <TableCell className="py-2 text-xs text-gray-600">{item.format_print || '—'}</TableCell>
      <TableCell className="py-2 text-xs text-gray-600 truncate max-w-[80px]">
        {formatVisuelType(item.visuels_data) || '—'}
      </TableCell>
      <TableCell className="py-2 text-xs text-gray-600 truncate max-w-[100px]">
        {formatContact(item.contacts_data) || '—'}
      </TableCell>
      <DeleteButton onRemove={onRemove} />
    </TableRow>
  );
}

function WebRow({ item, onEditField, onRemove, locked, onToggleLock }: {
  item: DevisLineItem;
  onEditField: ChannelTableProps['onEditField'];
  onRemove: () => void;
  locked: LockedField;
  onToggleLock: (field: LockedField) => void;
}) {
  const isCpm = item.type_tarif === 'cpm';
  return (
    <TableRow className="group">
      <TableCell className="py-2 sticky left-0 z-10 bg-white border-r border-gray-200">
        <div className="font-medium text-gray-900 text-xs">{item.support_name}</div>
        {isCpm && (
          <span className="text-[9px] font-medium text-green-600 uppercase tracking-wide">CPM</span>
        )}
      </TableCell>
      <MatchCell similarity={item.similarity} />
      <TableCell className="py-2 text-xs text-gray-600 truncate max-w-[130px]">
        {item.url ? (
          <a href={item.url.startsWith('http') ? item.url : `https://${item.url}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{item.url}</a>
        ) : <span className="text-gray-400 italic text-[10px]">ND</span>}
      </TableCell>
      <TableCell className="py-2 text-xs text-gray-600 truncate max-w-[130px]">
        {item.lectorat || item.categorie || '—'}
      </TableCell>
      {/* Visites/mois: fixed catalog traffic data — always read-only */}
      <TableCell className="py-2 text-right text-xs text-gray-500">{formatNumber(item._visites_base)}</TableCell>
      {/* PV/mois: fixed catalog data — always read-only */}
      <TableCell className="py-2 text-right text-xs text-gray-500">{formatNumber(item.pages_vues_par_mois_web)}</TableCell>
      <TableCell className="py-2 text-xs text-gray-600">{item.format_web || <span className="text-gray-400 italic text-[10px]">ND</span>}</TableCell>
      <NdCell />
      {/* Impressions vendues: commercial field — editable for CPM (drives price), read-only for Forfait */}
      <TableCell className="py-2 text-right">
        {isCpm ? (
          <EditableCell
            value={item.visites_mutable ?? item._visites_base ?? 0}
            onCommit={(v) => onEditField(item.id, 'visites', Math.max(0, Math.round(v)))}
            format="number"
            min={0}
            step={10000}
          />
        ) : (
          <span className="text-xs text-gray-500">{formatNumber(item.visites_mutable ?? item._visites_base)}</span>
        )}
      </TableCell>
      {/* Tarif Brut: computed (read-only) for CPM; directly editable for Forfait */}
      <TableCell className="py-2 text-right">
        {isCpm ? (
          <span className="text-xs text-gray-600">{item._has_tarif ? formatPrice(item.tarif_brut) : '—'}</span>
        ) : item._has_tarif ? (
          <EditableCell
            value={item.tarif_brut}
            onCommit={(v) => onEditField(item.id, 'tarif_brut', v)}
            format="currency"
            step={500}
            min={0}
          />
        ) : (
          <span className="text-xs text-gray-600">—</span>
        )}
      </TableCell>
      {/* CPM rate: editable for CPM (drives price); informational for Forfait */}
      <TableCell className="py-2 text-right">
        {isCpm && item.cpm_brut != null ? (
          <EditableCell
            value={item.cpm_brut}
            onCommit={(v) => onEditField(item.id, 'cpm_rate', Math.max(0, v))}
            format="currency"
            step={1}
            min={0}
          />
        ) : (
          <span className="text-xs text-gray-600">{item.cpm_brut != null ? `${item.cpm_brut.toFixed(2)} €` : '—'}</span>
        )}
      </TableCell>
      <TableCell className="py-2">
        <EditableCell
          value={item.remise_1}
          onCommit={(v) => onEditField(item.id, 'remise_1', v)}
          format="percent"
          step={5}
          min={0}
          locked={locked === 'remise_1'}
          onToggleLock={() => onToggleLock('remise_1')}
        />
      </TableCell>
      <TableCell className="py-2">
        <EditableCell
          value={item.net}
          onCommit={(v) => onEditField(item.id, 'net', v)}
          disabled={!item._has_tarif}
          format="currency"
          step={500}
          min={0}
          locked={locked === 'net'}
          onToggleLock={() => onToggleLock('net')}
        />
      </TableCell>
      <DeleteButton onRemove={onRemove} />
    </TableRow>
  );
}

function NLRow({ item, onEditField, onRemove, locked, onToggleLock }: {
  item: DevisLineItem;
  onEditField: ChannelTableProps['onEditField'];
  onRemove: () => void;
  locked: LockedField;
  onToggleLock: (field: LockedField) => void;
}) {
  const isPack = item.type_tarif === 'pack';
  return (
    <TableRow className="group">
      <TableCell className="py-2 sticky left-0 z-10 bg-white border-r border-gray-200">
        <div className="font-medium text-gray-900 text-xs">{item.support_name}</div>
        {isPack && (
          <span className="text-[9px] font-medium text-purple-600 uppercase tracking-wide">Pack</span>
        )}
      </TableCell>
      <MatchCell similarity={item.similarity} />
      <TableCell className="py-2 text-xs text-gray-600 truncate max-w-[130px]">
        {item.url ? (
          <a href={item.url.startsWith('http') ? item.url : `https://${item.url}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{item.url}</a>
        ) : <span className="text-gray-400 italic text-[10px]">ND</span>}
      </TableCell>
      <TableCell className="py-2 text-xs text-gray-600 truncate max-w-[130px]">
        {item.lectorat || item.categorie || '—'}
      </TableCell>
      <TableCell className="py-2 text-xs text-gray-600">{item.periodicite_nl || '—'}</TableCell>
      <TableCell className="py-2 text-right text-xs text-gray-500">{item.abonnes_nl != null ? formatNumber(item.abonnes_nl) : '—'}</TableCell>
      <TableCell className="py-2 text-right text-xs text-gray-500">{item.taux_ouverture_nl != null ? `${(item.taux_ouverture_nl * 100).toFixed(0)}%` : '—'}</TableCell>
      <TableCell className="py-2 text-xs text-gray-600">{item.format_nl || '—'}</TableCell>
      {/* Quantity: packs for pack NL, envois for unit NL */}
      <TableCell className="py-2">
        <EditableCell
          value={item.quantite}
          onCommit={(v) => onEditField(item.id, 'quantite', Math.max(1, Math.round(v)))}
          disabled={!item._has_tarif}
          integer
          min={1}
          step={1}
          locked={locked === 'quantite'}
          onToggleLock={() => onToggleLock('quantite')}
        />
        {isPack && item.nombre_envois_nl != null && (
          <div className="text-[9px] text-purple-500 text-center mt-0.5">
            {formatNumber(item.nombre_envois_nl)} envois/pack
          </div>
        )}
      </TableCell>
      {/* Brut unitaire: pack price for pack NL, per-envoi rate for unit NL */}
      <TableCell className="py-2 text-right">
        {item.brut_unitaire != null ? (
          <div>
            <span className="text-xs text-gray-600">{formatPrice(item.brut_unitaire)}</span>
            <span className="text-[9px] text-gray-400 ml-1">{isPack ? '/ pack' : '/ envoi'}</span>
          </div>
        ) : (
          <span className="text-xs text-gray-600">—</span>
        )}
      </TableCell>
      <TableCell className="py-2 text-right">
        <span className="text-xs text-gray-600">{item._has_tarif ? formatPrice(item.tarif_brut) : '—'}</span>
      </TableCell>
      <TableCell className="py-2">
        <EditableCell
          value={item.remise_1}
          onCommit={(v) => onEditField(item.id, 'remise_1', v)}
          format="percent"
          step={5}
          min={0}
          locked={locked === 'remise_1'}
          onToggleLock={() => onToggleLock('remise_1')}
        />
      </TableCell>
      <TableCell className="py-2">
        <EditableCell
          value={item.net}
          onCommit={(v) => onEditField(item.id, 'net', v)}
          disabled={!item._has_tarif}
          format="currency"
          step={500}
          min={0}
          locked={locked === 'net'}
          onToggleLock={() => onToggleLock('net')}
        />
      </TableCell>
      <DeleteButton onRemove={onRemove} />
    </TableRow>
  );
}

export function ChannelTable({ channel, items, onEditField, onRemove, lockedFields, onToggleLock }: ChannelTableProps) {
  const brutSubtotal = items.reduce((s, i) => s + i.tarif_brut, 0);
  const netSubtotal = items.reduce((s, i) => s + i.net, 0);

  const labelColSpan = channel === 'Print' ? 6 : channel === 'Web' ? 9 : 10;
  // Web has an extra CPM rate column between Brut and Remise; Print/NL only have Remise.
  const fillAfterBrut = channel === 'Web' ? 2 : 1;
  const fillAfterNet = channel === 'Print' ? 6 : 0;

  return (
    <div className="border rounded-lg overflow-x-auto">
      <Table>
        <TableHeader>
          {channel === 'Print' && <PrintHeaders />}
          {channel === 'Web' && <WebHeaders />}
          {channel === 'NL' && <NLHeaders />}
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const locked = lockedFields[item.id] ?? 'remise_1';
            switch (channel) {
              case 'Print':
                return <PrintRow key={item.id} item={item} onEditField={onEditField} onRemove={() => onRemove(item.id)} locked={locked} onToggleLock={(f) => onToggleLock(item.id, f)} />;
              case 'Web':
                return <WebRow key={item.id} item={item} onEditField={onEditField} onRemove={() => onRemove(item.id)} locked={locked} onToggleLock={(f) => onToggleLock(item.id, f)} />;
              case 'NL':
                return <NLRow key={item.id} item={item} onEditField={onEditField} onRemove={() => onRemove(item.id)} locked={locked} onToggleLock={(f) => onToggleLock(item.id, f)} />;
            }
          })}
          {/* Subtotal row */}
          <TableRow className="bg-gray-50/80 border-t-2">
            <TableCell colSpan={labelColSpan} className="py-2 text-right">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Sous-total {channel === 'NL' ? 'Newsletter' : channel}
              </span>
            </TableCell>
            <TableCell className="py-2 text-right">
              <span className="text-xs font-medium text-gray-700">{formatPrice(brutSubtotal)}</span>
            </TableCell>
            {Array.from({ length: fillAfterBrut }).map((_, i) => (
              <TableCell key={`fb-${i}`} className="py-2" />
            ))}
            <TableCell className="py-2 text-right">
              <span className="text-xs font-bold text-gray-900">{formatPrice(netSubtotal)}</span>
            </TableCell>
            {Array.from({ length: fillAfterNet }).map((_, i) => (
              <TableCell key={`fn-${i}`} className="py-2" />
            ))}
            <TableCell className="py-2" /> {/* delete column */}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
