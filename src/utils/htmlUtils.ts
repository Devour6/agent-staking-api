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

/**
 * Escapes HTML attributes to prevent XSS in attribute contexts
 * @param unsafe - The unsafe string for use in HTML attributes
 * @returns The escaped string safe for HTML attributes
 */
export function escapeHtmlAttribute(unsafe: string): string {
  if (typeof unsafe !== 'string') {
    return String(unsafe);
  }
  
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\r\n/g, '&#13;&#10;')
    .replace(/\r/g, '&#13;')
    .replace(/\n/g, '&#10;')
    .replace(/\t/g, '&#9;');
}

/**
 * Strips HTML tags completely - for plain text contexts
 * @param unsafe - The string that may contain HTML
 * @returns Plain text with HTML tags removed
 */
export function stripHtmlTags(unsafe: string): string {
  if (typeof unsafe !== 'string') {
    return String(unsafe);
  }
  
  return unsafe.replace(/<[^>]*>/g, '');
}