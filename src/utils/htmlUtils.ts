/**
 * HTML utility functions for secure rendering
 */

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param unsafe - The unsafe string that may contain HTML
 * @returns The escaped string safe for HTML output
 */
export function escapeHtml(unsafe: string): string {
  if (typeof unsafe !== 'string') {
    return String(unsafe);
  }
  
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

