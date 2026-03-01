import { escapeHtml } from '../../src/utils/htmlUtils';

describe('HTML Utils', () => {
  describe('escapeHtml', () => {
    it('should escape basic HTML characters', () => {
      const input = '<script>alert("xss")</script>';
      const expected = '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;';
      expect(escapeHtml(input)).toBe(expected);
    });

    it('should escape ampersands', () => {
      const input = 'Tom & Jerry';
      const expected = 'Tom &amp; Jerry';
      expect(escapeHtml(input)).toBe(expected);
    });

    it('should escape single quotes', () => {
      const input = "It's a test";
      const expected = 'It&#039;s a test';
      expect(escapeHtml(input)).toBe(expected);
    });

    it('should handle empty strings', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should handle non-string inputs', () => {
      expect(escapeHtml(123 as any)).toBe('123');
      expect(escapeHtml(null as any)).toBe('null');
      expect(escapeHtml(undefined as any)).toBe('undefined');
    });

    it('should escape complex XSS attempts', () => {
      const input = '<img src="x" onerror="alert(\'XSS\')">';
      const expected = '&lt;img src=&quot;x&quot; onerror=&quot;alert(&#039;XSS&#039;)&quot;&gt;';
      expect(escapeHtml(input)).toBe(expected);
    });

    it('should handle multiple special characters', () => {
      const input = '&<>"\'';
      const expected = '&amp;&lt;&gt;&quot;&#039;';
      expect(escapeHtml(input)).toBe(expected);
    });
  });
});