// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from '../src/renderer/cards/sanitize';
import { detectDocument } from '../src/renderer/fileio';

describe('plugin block HTML sanitizer', () => {
  it('keeps safe formatting', () => {
    expect(sanitizeHtml('<b class="x">Hi</b> <i>there</i>')).toBe('<b class="x">Hi</b> <i>there</i>');
  });
  it('strips scripts, handlers, links, images and styles', () => {
    const out = sanitizeHtml('<div onclick="x()" style="color:red"><script>alert(1)</script><a href="javascript:alert(1)">go</a><img src=x onerror=alert(1)><iframe src="https://evil"></iframe>ok</div>');
    expect(out).not.toMatch(/script|onclick|onerror|javascript|iframe|style|<a |<img/i);
    expect(out).toContain('ok');
    expect(out).toContain('go');
  });
});

describe('import detection', () => {
  it('tells systems and campaigns apart', () => {
    expect(detectDocument({ entityTypes: [] })?.kind).toBe('system');
    expect(detectDocument({ entities: [], notes: [] })?.kind).toBe('campaign');
    expect(detectDocument({ hello: 1 })).toBeNull();
    expect(detectDocument(null)).toBeNull();
  });
});
