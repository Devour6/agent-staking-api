import { escapeHtml, escapeHtmlAttribute, stripHtmlTags } from '../../src/utils/htmlUtils';

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

  describe('escapeHtmlAttribute', () => {
    it('should escape attribute-specific characters', () => {
      const input = 'value with\nnewline\tand\rcarriage';
      const expected = 'value with&#10;newline&#9;and&#13;carriage';
      expect(escapeHtmlAttribute(input)).toBe(expected);
    });

    it('should include all basic HTML escaping', () => {
      const input = '<script>alert("xss")</script>';
      const expected = '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;';
      expect(escapeHtmlAttribute(input)).toBe(expected);
    });

    it('should handle Windows line endings', () => {
      const input = 'line1\r\nline2';
      const expected = 'line1&#13;&#10;line2';
      expect(escapeHtmlAttribute(input)).toBe(expected);
    });
  });

  describe('stripHtmlTags', () => {
    it('should remove HTML tags completely', () => {
      const input = '<script>alert("xss")</script>Hello <b>World</b>!';
      const expected = 'alert("xss")Hello World!';
      expect(stripHtmlTags(input)).toBe(expected);
    });

    it('should handle self-closing tags', () => {
      const input = 'Line 1<br/>Line 2<img src="test.jpg"/>End';
      const expected = 'Line 1Line 2End';
      expect(stripHtmlTags(input)).toBe(expected);
    });

    it('should handle nested tags', () => {
      const input = '<div><span><strong>Bold text</strong></span></div>';
      const expected = 'Bold text';
      expect(stripHtmlTags(input)).toBe(expected);
    });

    it('should handle malformed HTML gracefully', () => {
      const input = '<script>alert("test")</script><div>unclosed';
      const expected = 'alert("test")unclosed';
      expect(stripHtmlTags(input)).toBe(expected);
    });

    it('should preserve text content', () => {
      const input = 'No <em>HTML</em> tags here';
      const expected = 'No HTML tags here';
      expect(stripHtmlTags(input)).toBe(expected);
    });

    it('should handle non-string inputs', () => {
      expect(stripHtmlTags(123 as any)).toBe('123');
      expect(stripHtmlTags(null as any)).toBe('null');
    });
  });
});