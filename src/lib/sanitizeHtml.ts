import DOMPurify from 'dompurify';

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['div', 'span', 'p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'img'],
    ALLOWED_ATTR: ['style', 'href', 'target', 'rel', 'class', 'colspan', 'rowspan', 'src', 'alt', 'width', 'height'],
  });
}
