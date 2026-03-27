/**
 * Network security — SSRF protection.
 * Mirrors nanobot's security/network.py.
 */

import { URL } from 'node:url';
import dns from 'node:dns/promises';
import net from 'node:net';

const PRIVATE_RANGES = [
  { start: '10.0.0.0', end: '10.255.255.255' },
  { start: '172.16.0.0', end: '172.31.255.255' },
  { start: '192.168.0.0', end: '192.168.255.255' },
  { start: '127.0.0.0', end: '127.255.255.255' },
  { start: '169.254.0.0', end: '169.254.255.255' },
  { start: '0.0.0.0', end: '0.255.255.255' },
];

function ipToNum(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

function isPrivateIPv4(ip) {
  if (!net.isIPv4(ip)) return false;
  const num = ipToNum(ip);
  return PRIVATE_RANGES.some(r => num >= ipToNum(r.start) && num <= ipToNum(r.end));
}

function isPrivateIPv6(ip) {
  if (!net.isIPv6(ip)) return false;
  const lower = ip.toLowerCase();
  return (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fe80:') ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('::ffff:127.')
  );
}

export async function validateUrlTarget(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return [false, `Only http/https allowed, got '${parsed.protocol}'`];
    }
    if (!parsed.hostname) return [false, 'Missing hostname'];

    try {
      const addrs = await dns.lookup(parsed.hostname, { all: true });
      for (const addr of addrs) {
        if (isPrivateIPv4(addr.address) || isPrivateIPv6(addr.address)) {
          return [false, `Blocked: ${parsed.hostname} resolves to private address ${addr.address}`];
        }
      }
    } catch (e) {
      return [false, `Cannot resolve hostname: ${parsed.hostname}`];
    }

    return [true, ''];
  } catch (e) {
    return [false, e.message];
  }
}

export function containsInternalUrl(command) {
  const urlRe = /https?:\/\/[^\s"'`;|<>]+/gi;
  const matches = command.match(urlRe) || [];
  // Synchronous check — just check the hostname pattern
  for (const url of matches) {
    try {
      const parsed = new URL(url);
      const h = parsed.hostname;
      if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1' || h === '::' ||
          h.startsWith('10.') || h.startsWith('192.168.') ||
          /^172\.(1[6-9]|2\d|3[0-1])\./.test(h) ||
          h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) {
        return true;
      }
    } catch { /* ignore */ }
  }
  return false;
}
