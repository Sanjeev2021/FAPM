import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { copyRichText } from '@/lib/copyRichText';
import { sanitizeHtml } from '@/lib/sanitizeHtml';

export function InlineExcelPreview({ fileUrl }: { fileUrl?: string }) {
  const [tables, setTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fileUrl) {
      setError('Aucun fichier disponible');
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadExcel() {
      try {
        const XLSX = await import('xlsx');
        const response = await fetch(fileUrl!);
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });

        if (cancelled) return;

        const htmlTables: string[] = [];
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const html = XLSX.utils.sheet_to_html(sheet, { editable: false });
          htmlTables.push(sanitizeHtml(`<h3 class="text-sm font-medium mb-2 mt-4">${sheetName}</h3>${html}`));
        }
        setTables(htmlTables);
      } catch {
        if (!cancelled) setError('Impossible de charger le fichier Excel');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadExcel();
    return () => { cancelled = true; };
  }, [fileUrl]);

  return (
    <div className="max-h-[300px] overflow-y-auto">
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      )}
      {error && <p className="text-sm text-destructive py-2">{error}</p>}
      {tables.map((html, i) => (
        <div
          key={i}
          className="excel-preview text-xs [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-gray-200 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-gray-50 [&_th]:text-left [&_th]:font-medium"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ))}
    </div>
  );
}

export function InlinePptPreview({ fileUrl }: { fileUrl?: string }) {
  const { t } = useTranslation();
  const [fileSize, setFileSize] = useState<string | null>(null);

  useEffect(() => {
    if (!fileUrl) return;
    fetch(fileUrl, { method: 'HEAD' })
      .then((res) => {
        const size = res.headers.get('content-length');
        if (size) {
          const mb = (parseInt(size, 10) / (1024 * 1024)).toFixed(1);
          setFileSize(`${mb} MB`);
        }
      })
      .catch(() => {});
  }, [fileUrl]);

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <p className="text-sm text-gray-600">
          L'aperçu des slides n'est pas encore disponible.
        </p>
        {fileSize && <span className="text-xs text-gray-400">({fileSize})</span>}
      </div>
      {fileUrl && (
        <Button size="sm" variant="outline" asChild>
          <a href={fileUrl} target="_blank" rel="noopener noreferrer">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            {t('chat.deliverables.download')}
          </a>
        </Button>
      )}
    </div>
  );
}

export function InlineEmailPreview({ emailHtml }: { emailHtml?: string }) {
  const { t } = useTranslation();

  if (!emailHtml) {
    return <p className="text-sm text-gray-500 py-2">Aucun email disponible.</p>;
  }

  return (
    <div>
      <div className="max-h-[300px] overflow-y-auto border rounded-md p-3">
        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(emailHtml) }} />
      </div>
      <div className="flex justify-end pt-2">
        <Button size="sm" variant="outline" onClick={() => copyRichText(emailHtml)}>
          <Copy className="h-3.5 w-3.5 mr-1.5" />
          {t('chat.deliverables.copyEmail')}
        </Button>
      </div>
    </div>
  );
}
