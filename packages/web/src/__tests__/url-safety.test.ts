import {describe, expect, it} from 'vitest';
import {isSafeUrl} from '@/lib/url-safety';

describe('lib/url-safety — isSafeUrl', () => {
  describe('protocol gate', () => {
    it('accepts https:', () => {
      expect(isSafeUrl('https://example.com')).toBe(true);
    });

    it('accepts http:', () => {
      expect(isSafeUrl('http://example.com')).toBe(true);
    });

    it('rejects ftp:', () => {
      expect(isSafeUrl('ftp://example.com/file')).toBe(false);
    });

    it('rejects file:', () => {
      expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    });

    it('rejects javascript:', () => {
      expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    });

    it('rejects data:', () => {
      expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    });
  });

  describe('IPv4 private/reserved ranges', () => {
    it('rejects 127.0.0.1 (loopback)', () => {
      expect(isSafeUrl('http://127.0.0.1/admin')).toBe(false);
    });

    it('rejects 127.x.x.x (entire loopback range)', () => {
      expect(isSafeUrl('http://127.255.255.1/')).toBe(false);
    });

    it('rejects 10.x.x.x private range', () => {
      expect(isSafeUrl('http://10.0.0.5')).toBe(false);
    });

    it('rejects 192.168.x.x', () => {
      expect(isSafeUrl('http://192.168.1.1')).toBe(false);
    });

    it('rejects 172.16.x.x through 172.31.x.x', () => {
      expect(isSafeUrl('http://172.16.0.1')).toBe(false);
      expect(isSafeUrl('http://172.20.5.5')).toBe(false);
      expect(isSafeUrl('http://172.31.255.255')).toBe(false);
    });

    it('accepts 172.15.x.x and 172.32.x.x (outside private block)', () => {
      expect(isSafeUrl('http://172.15.0.1')).toBe(true);
      expect(isSafeUrl('http://172.32.0.1')).toBe(true);
    });

    it('rejects 169.254.x.x (Link-Local / AWS metadata)', () => {
      expect(isSafeUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    });

    it('rejects 0.0.0.0 and 0.x.x.x', () => {
      expect(isSafeUrl('http://0.0.0.0')).toBe(false);
      expect(isSafeUrl('http://0.1.2.3')).toBe(false);
    });
  });

  describe('IPv6 ranges', () => {
    it('rejects ::1 (IPv6 loopback)', () => {
      expect(isSafeUrl('http://[::1]/')).toBe(false);
    });

    it('rejects IPv4-mapped IPv6 loopback in hex-normalized form (127.0.0.1 → ::ffff:7f00:1)', () => {
      // URL parser normalizes ::ffff:127.0.0.1 to ::ffff:7f00:1 (hex form).
      // url-safety now converts hex form back to dotted IPv4 for private check.
      expect(isSafeUrl('http://[::ffff:7f00:1]/')).toBe(false);
      expect(isSafeUrl('http://[::ffff:0a00:1]/')).toBe(false); // 10.0.0.1
      expect(isSafeUrl('http://[::ffff:c0a8:1]/')).toBe(false); // 192.168.0.1
      expect(isSafeUrl('http://[::ffff:a9fe:1]/')).toBe(false); // 169.254.0.1
    });

    it('accepts IPv4-mapped IPv6 public IP in hex form', () => {
      // 8.8.8.8 → ::ffff:0808:0808
      expect(isSafeUrl('http://[::ffff:0808:0808]/')).toBe(true);
    });

    it('rejects ULA fc00::/7 (fc00, fd00 prefixes)', () => {
      expect(isSafeUrl('http://[fc00::1]')).toBe(false);
      expect(isSafeUrl('http://[fd12:3456:789a::1]')).toBe(false);
    });

    it('rejects Link-Local fe80::/10', () => {
      expect(isSafeUrl('http://[fe80::1]')).toBe(false);
    });
  });

  describe('reserved hostnames', () => {
    it('rejects literal "localhost"', () => {
      expect(isSafeUrl('http://localhost')).toBe(false);
      expect(isSafeUrl('http://localhost:8080/api')).toBe(false);
    });

    it('rejects *.internal hostnames', () => {
      expect(isSafeUrl('http://service.internal')).toBe(false);
    });

    it('rejects *.local hostnames (mDNS)', () => {
      expect(isSafeUrl('http://printer.local')).toBe(false);
    });
  });

  describe('public hostnames', () => {
    it('accepts example.com', () => {
      expect(isSafeUrl('https://example.com')).toBe(true);
    });

    it('accepts URL with port', () => {
      expect(isSafeUrl('https://api.example.com:8443/v1')).toBe(true);
    });

    it('accepts URL with query and fragment', () => {
      expect(isSafeUrl('https://example.com/path?x=1&y=2#top')).toBe(true);
    });

    it('accepts www.google.com', () => {
      expect(isSafeUrl('https://www.google.com')).toBe(true);
    });
  });

  describe('malformed inputs', () => {
    it('rejects empty string', () => {
      expect(isSafeUrl('')).toBe(false);
    });

    it('rejects "not a url"', () => {
      expect(isSafeUrl('not a url')).toBe(false);
    });

    it('rejects bare "http://"', () => {
      expect(isSafeUrl('http://')).toBe(false);
    });

    it('rejects whitespace-only input', () => {
      expect(isSafeUrl('   ')).toBe(false);
    });
  });
});
