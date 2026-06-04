import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Lock, Unlock, ChevronUp, ChevronDown, Pencil } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type FormatType = 'number' | 'currency' | 'percent';

interface EditableCellProps {
  value: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
  format?: FormatType;
  min?: number;
  integer?: boolean;
  locked?: boolean;
  onToggleLock?: () => void;
  step?: number;
}

function formatDisplay(value: number, format: FormatType): string {
  switch (format) {
    case 'currency':
      return value.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
    case 'percent':
      return value.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' %';
    case 'number':
    default:
      return value.toLocaleString('fr-FR');
  }
}

export function EditableCell({
  value,
  onCommit,
  disabled = false,
  format = 'number',
  min = 0,
  integer = false,
  locked = false,
  onToggleLock,
  step,
}: EditableCellProps) {
  const [localValue, setLocalValue] = useState(String(integer ? Math.round(value) : value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalValue(String(integer ? Math.round(value) : value));
    }
  }, [value, integer, isFocused]);

  const commit = useCallback(() => {
    const parsed = parseFloat(localValue.replace(',', '.'));
    if (!isNaN(parsed) && parsed >= min) {
      const final = integer ? Math.round(parsed) : parsed;
      onCommit(final);
    } else {
      setLocalValue(String(integer ? Math.round(value) : value));
    }
  }, [localValue, min, integer, value, onCommit]);

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    e.target.select();
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    commit();
  }, [commit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setLocalValue(String(integer ? Math.round(value) : value));
      e.currentTarget.blur();
    }
  }, [value, integer]);

  const handleStep = useCallback((direction: 1 | -1) => {
    if (!step) return;
    const newVal = value + step * direction;
    const clamped = Math.max(min, integer ? Math.round(newVal) : newVal);
    onCommit(clamped);
  }, [value, step, min, integer, onCommit]);

  if (disabled) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-400">Sur demande</span>
        {onToggleLock && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggleLock}
            className="h-5 w-5 p-0 text-gray-300 hover:text-gray-500"
          >
            {locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
          </Button>
        )}
      </div>
    );
  }

  if (locked) {
    return (
      <div className="group flex items-center gap-0.5">
        <Input
          type="text"
          inputMode="numeric"
          value={isFocused ? localValue : formatDisplay(value, format)}
          onChange={(e) => setLocalValue(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="h-7 w-full text-xs px-2 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-amber-50 rounded-full border-l-2 border-l-amber-400 border border-amber-200 hover:border-amber-400 focus:border-blue-500 shadow-sm transition-colors"
        />
        {onToggleLock && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={onToggleLock}
                className="h-5 w-5 p-0 text-amber-500 hover:text-amber-600"
              >
                <Lock className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-48">
              Verrouillé = ancre de calcul (les autres champs se recalculent autour de cette valeur)
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-0.5">
      {step && (
        <div className="flex flex-col -mr-0.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleStep(1)}
            className="h-3.5 w-4 p-0 text-gray-400 hover:text-gray-600"
            tabIndex={-1}
          >
            <ChevronUp className="h-2.5 w-2.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleStep(-1)}
            className="h-3.5 w-4 p-0 text-gray-400 hover:text-gray-600"
            tabIndex={-1}
          >
            <ChevronDown className="h-2.5 w-2.5" />
          </Button>
        </div>
      )}
      <Input
        type="text"
        inputMode="numeric"
        value={isFocused ? localValue : formatDisplay(value, format)}
        onChange={(e) => setLocalValue(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="h-7 w-full text-xs px-2 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-white rounded-full border border-gray-200 hover:border-gray-400 focus:border-blue-500 shadow-sm transition-colors"
      />
      <Pencil className="h-2.5 w-2.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      {onToggleLock && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onToggleLock}
          className="h-5 w-5 p-0 text-gray-300 hover:text-gray-500"
          title="Cliquer pour verrouiller"
        >
          <Unlock className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
