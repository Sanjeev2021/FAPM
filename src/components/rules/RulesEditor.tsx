import { useState } from 'react';
import type { Rule } from '@/hooks/useRules';
import type { UseMutationResult } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Trash2, GripVertical } from 'lucide-react';

const MAX_CONTENT_LENGTH = 500;

interface RulesEditorProps {
  rules: Rule[] | undefined;
  isLoading: boolean;
  onCreate: UseMutationResult<void, Error, { title: string; content: string }>['mutateAsync'];
  onUpdate: UseMutationResult<void, Error, { id: string; is_active?: boolean; title?: string; content?: string }>['mutateAsync'];
  onDelete: UseMutationResult<void, Error, string>['mutateAsync'];
  emptyMessage?: string;
  placeholderTitle?: string;
  placeholderContent?: string;
}

export function RulesEditor({
  rules,
  isLoading,
  onCreate,
  onUpdate,
  onDelete,
  emptyMessage = 'Aucune règle configurée.',
  placeholderTitle = 'Ex: Toujours répondre en français',
  placeholderContent = 'Décris le comportement souhaité de l\'agent...',
}: RulesEditorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setSaving(true);
    try {
      await onCreate({ title: newTitle.trim(), content: newContent.trim() });
      setNewTitle('');
      setNewContent('');
      setIsAdding(false);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => (
          <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rules && rules.length > 0 ? (
        rules.map(rule => (
          <RuleCard
            key={rule.id}
            rule={rule}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))
      ) : !isAdding ? (
        <p className="text-sm font-light text-gray-500 py-4 text-center">{emptyMessage}</p>
      ) : null}

      {isAdding ? (
        <Card className="border border-dashed border-gray-300 bg-gray-50/50">
          <CardContent className="pt-4 space-y-3">
            <Input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder={placeholderTitle}
              className="font-light text-sm"
              autoFocus
            />
            <div className="relative">
              <Textarea
                value={newContent}
                onChange={e => setNewContent(e.target.value.slice(0, MAX_CONTENT_LENGTH))}
                placeholder={placeholderContent}
                className="font-light text-sm min-h-[80px] resize-none"
                rows={3}
              />
              <span className="absolute bottom-2 right-3 text-[10px] text-gray-400">
                {newContent.length}/{MAX_CONTENT_LENGTH}
              </span>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="font-light"
                onClick={() => { setIsAdding(false); setNewTitle(''); setNewContent(''); }}
              >
                Annuler
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleAdd}
                disabled={saving || !newTitle.trim() || !newContent.trim()}
              >
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                {saving ? 'Enregistrement...' : 'Ajouter'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full font-light"
          onClick={() => setIsAdding(true)}
        >
          <Plus className="w-4 h-4 mr-1.5" strokeWidth={1.5} />
          Ajouter une règle
        </Button>
      )}
    </div>
  );
}

function RuleCard({
  rule,
  onUpdate,
  onDelete,
}: {
  rule: Rule;
  onUpdate: RulesEditorProps['onUpdate'];
  onDelete: RulesEditorProps['onDelete'];
}) {
  const [deleting, setDeleting] = useState(false);

  return (
    <Card className={`transition-opacity ${rule.is_active ? '' : 'opacity-50'}`}>
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-3">
          <GripVertical className="w-4 h-4 text-gray-300 mt-1 shrink-0 cursor-grab" strokeWidth={1.5} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900 truncate">{rule.title}</span>
            </div>
            <p className="text-xs font-light text-gray-600 mt-0.5 line-clamp-2">{rule.content}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch
              checked={rule.is_active}
              onCheckedChange={(checked) => onUpdate({ id: rule.id, is_active: checked })}
            />
            <button
              onClick={async () => {
                setDeleting(true);
                try { await onDelete(rule.id); } finally { setDeleting(false); }
              }}
              disabled={deleting}
              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
