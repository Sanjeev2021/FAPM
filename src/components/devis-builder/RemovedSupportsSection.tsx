import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import type { CampaignSupport } from '@/components/chat/hooks/useWorkingSet';

interface RemovedSupportsSectionProps {
  rejectedSupports: CampaignSupport[];
  onRestore: (supportId: string) => void;
}

export function RemovedSupportsSection({ rejectedSupports, onRestore }: RemovedSupportsSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (rejectedSupports.length === 0) return null;

  return (
    <div className="mt-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="text-gray-500 hover:text-gray-700 text-xs"
      >
        {isOpen ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
        {isOpen ? 'Masquer les retirés' : `Afficher les retirés (${rejectedSupports.length})`}
      </Button>

      {isOpen && (
        <div className="mt-2 space-y-1">
          {rejectedSupports.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 opacity-50"
            >
              <div className="text-xs text-gray-600">
                <span className="font-medium">{s.support_data.support_name}</span>
                <span className="ml-2 text-gray-400">{s.support_data.canal}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRestore(s.id)}
                className="h-6 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Restaurer
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
