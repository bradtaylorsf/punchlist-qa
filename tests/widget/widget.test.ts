import { describe, it, expect, vi, afterEach } from 'vitest';
import { init, destroy } from '../../src/widget/widget.js';

describe('PunchlistWidget', () => {
  afterEach(() => {
    destroy();
  });

  it('creates shadow DOM host on init', () => {
    init({ serverUrl: 'http://localhost:4747' });

    const host = document.getElementById('punchlist-widget');
    expect(host).not.toBeNull();
    expect(host!.shadowRoot).not.toBeNull();
  });

  it('creates FAB trigger by default', () => {
    init({ serverUrl: 'http://localhost:4747' });

    const host = document.getElementById('punchlist-widget');
    const fab = host!.shadowRoot!.querySelector('.punchlist-fab');
    expect(fab).not.toBeNull();
  });

  it('creates FAB with correct position', () => {
    init({ serverUrl: 'http://localhost:4747', position: 'top-left' });

    const host = document.getElementById('punchlist-widget');
    const fab = host!.shadowRoot!.querySelector('.punchlist-fab.top-left');
    expect(fab).not.toBeNull();
  });

  it('removes host on destroy', () => {
    init({ serverUrl: 'http://localhost:4747' });
    expect(document.getElementById('punchlist-widget')).not.toBeNull();

    destroy();
    expect(document.getElementById('punchlist-widget')).toBeNull();
  });

  it('warns on double init', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    init({ serverUrl: 'http://localhost:4747' });
    init({ serverUrl: 'http://localhost:4747' });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Already initialized'));
    warnSpy.mockRestore();
  });

  it('handles inline variant with missing target gracefully', () => {
    init({
      serverUrl: 'http://localhost:4747',
      variant: 'inline',
      target: '#nonexistent',
    });

    const host = document.getElementById('punchlist-widget');
    expect(host).not.toBeNull();
  });

  it('rejects invalid serverUrl', () => {
    expect(() => init({ serverUrl: 'not-a-url' })).toThrow('Invalid serverUrl');
  });

  it('rejects non-http serverUrl', () => {
    expect(() => init({ serverUrl: 'ftp://example.com' })).toThrow('http: or https:');
  });

  it('falls back to default primaryColor for invalid value', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    init({ serverUrl: 'http://localhost:4747', primaryColor: 'red} * {display:none' });

    const host = document.getElementById('punchlist-widget');
    expect(host).not.toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid primaryColor'));
    warnSpy.mockRestore();
  });

  it('falls back to default fontFamily for invalid value', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    init({ serverUrl: 'http://localhost:4747', fontFamily: 'font; background: url(evil)' });

    const host = document.getElementById('punchlist-widget');
    expect(host).not.toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid fontFamily'));
    warnSpy.mockRestore();
  });
});
