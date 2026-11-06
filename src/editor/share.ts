/**
 * Share by URL: the kit as JSON, compressed with CompressionStream('deflate-raw') when
 * available, base64url-encoded into #k=…  Fallback: uncompressed base64url JSON.
 * A one-letter prefix says which: "z." deflate-raw, "j." plain JSON.
 */
import type { Kit } from '../engine/types';

export const HASH_KEY = 'k';

const toB64url = (bytes: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromB64url = (s: string): Uint8Array => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const pipe = async (bytes: Uint8Array, t: CompressionStream | DecompressionStream) =>
  new Uint8Array(
    await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(t)).arrayBuffer(),
  );

export const canCompress = (): boolean => typeof CompressionStream != 'undefined';

/** Encode a kit for the URL hash. */
export async function encodeKit(kit: Kit, compress = canCompress()): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(kit));
  if (compress) return 'z.' + toB64url(await pipe(bytes, new CompressionStream('deflate-raw')));
  return 'j.' + toB64url(bytes);
}

/** Decode what encodeKit produced. Throws a readable Error on bad input. */
export async function decodeKit(value: string): Promise<unknown> {
  const [kind, data] = value.includes('.') ? value.split('.', 2) : ['j', value];
  if (!data) throw new Error('The share link is empty.');
  let bytes: Uint8Array;
  try {
    bytes = fromB64url(data);
  } catch {
    throw new Error('The share link is damaged (not valid base64url).');
  }
  if (kind == 'z') {
    if (typeof DecompressionStream == 'undefined')
      throw new Error('This browser cannot open compressed share links.');
    try {
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    } catch {
      throw new Error('The share link is damaged (could not decompress).');
    }
  } else if (kind != 'j') throw new Error(`Unknown share link format "${kind}".`);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('The share link does not contain valid JSON.');
  }
}

/** The encoded kit in a location hash (#k=…), or null. */
export function readHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return params.get(HASH_KEY);
}

export async function shareUrl(kit: Kit, base: string): Promise<string> {
  return `${base.split('#')[0]}#${HASH_KEY}=${await encodeKit(kit)}`;
}
