import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Printer, Globe, Mail } from 'lucide-react';
import type { ElementType } from 'react';
import { ChannelTable } from './ChannelTable';
import type { DevisLineItem, Canal, LockedField } from '@/lib/devisCalculations';
import { formatPrice } from '@/lib/devisCalculations';

const CHANNEL_LABELS: Record<string, string> = {
  Print: 'Print',
  Web: 'Web',
  NL: 'Newsletter',
};

const CHANNEL_ICON_COMPONENTS: Record<string, ElementType> = {
  Print: Printer,
  Web: Globe,
  NL: Mail,
};

const channelColors: Record<string, string> = {
  Print: 'from-blue-500 to-blue-600',
  Web: 'from-green-500 to-green-600',
  NL: 'from-purple-500 to-purple-600',
};

interface ChannelAccordionProps {
  channel: Canal;
  items: DevisLineItem[];
  totalBudget: number;
  onEditField: (itemId: string, field: 'quantite' | 'tarif_brut' | 'remise_1' | 'net' | 'visites' | 'cpm_rate', value: number) => void;
  onRemove: (itemId: string) => void;
  lockedFields: Record<string, LockedField>;
  onToggleLock: (itemId: string, field: LockedField) => void;
}

export function ChannelAccordion({ channel, items, totalBudget, onEditField, onRemove, lockedFields, onToggleLock }: ChannelAccordionProps) {
  if (items.length === 0) return null;

  const channelNet = items.reduce((s, i) => s + i.net, 0);
  const budgetPct = totalBudget > 0 ? ((channelNet / totalBudget) * 100).toFixed(0) : '0';

  return (
    <Accordion type="multiple" defaultValue={[channel]} className="space-y-2">
      <AccordionItem value={channel} className="border-none">
        <Card>
          <AccordionTrigger className="px-6 py-4 hover:no-underline">
            <div className="flex items-center justify-between w-full pr-4">
              <div className="flex items-center gap-4">
                <div
                  className={`h-12 w-12 rounded-lg bg-gradient-to-r ${
                    channelColors[channel]
                  } flex items-center justify-center shadow-md`}
                >
                  {(() => {
                    const IconComponent = CHANNEL_ICON_COMPONENTS[channel] ?? Printer;
                    return <IconComponent className="h-6 w-6 text-white" strokeWidth={1.5} />;
                  })()}
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-normal text-gray-900">
                    {CHANNEL_LABELS[channel]}
                  </h3>
                  <p className="text-sm font-light text-gray-600">
                    {items.length} support{items.length > 1 ? 's' : ''} •{' '}
                    {formatPrice(channelNet)} net
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="mr-2">
                {budgetPct}% du budget
              </Badge>
            </div>
          </AccordionTrigger>

          <AccordionContent className="px-6 pb-4">
            <ChannelTable
              channel={channel}
              items={items}
              onEditField={onEditField}
              onRemove={onRemove}
              lockedFields={lockedFields}
              onToggleLock={onToggleLock}
            />
          </AccordionContent>
        </Card>
      </AccordionItem>
    </Accordion>
  );
}
