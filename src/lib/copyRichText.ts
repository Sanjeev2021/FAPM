import { toast } from 'sonner';

function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

export async function copyRichText(html: string, fallbackText?: string): Promise<boolean> {
  try {
    const blob = new Blob([html], { type: 'text/html' });
    const textBlob = new Blob([fallbackText || stripHtml(html)], { type: 'text/plain' });
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': blob,
        'text/plain': textBlob,
      }),
    ]);
    toast.success('Copié !');
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(fallbackText || stripHtml(html));
      toast.success('Copié en texte brut');
      return true;
    } catch {
      toast.error('Impossible de copier');
      return false;
    }
  }
}
