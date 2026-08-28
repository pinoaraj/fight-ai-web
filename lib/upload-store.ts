import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = '/tmp/fight-ai-web-uploads';
export const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;
export const MAX_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024;

export type UploadMeta = {
  id: string;
  name: string;
  type: string;
  size: number;
  received: number;
  createdAt: number;
  complete: boolean;
};

function safeId(id: string) {
  if (!/^[a-f0-9-]{20,80}$/i.test(id)) throw new Error('Upload id inválido.');
  return id;
}
function dataPath(id: string) { return path.join(ROOT, safeId(id) + '.bin'); }
function metaPath(id: string) { return path.join(ROOT, safeId(id) + '.json'); }

async function ensureRoot() { await mkdir(ROOT, { recursive: true }); }

export async function createUpload(name: string, type: string, size: number) {
  if (!Number.isFinite(size) || size <= 0) throw new Error('Tamaño de video inválido.');
  if (size > MAX_UPLOAD_SIZE) throw new Error('El video supera el máximo beta de 2 GB.');
  await ensureRoot();
  const id = crypto.randomUUID();
  const meta: UploadMeta = { id, name: name || 'sparring.mp4', type: type || 'video/mp4', size, received: 0, createdAt: Date.now(), complete: false };
  await writeFile(metaPath(id), JSON.stringify(meta), 'utf8');
  await writeFile(dataPath(id), new Uint8Array());
  return meta;
}

export async function getUpload(id: string): Promise<UploadMeta> {
  await ensureRoot();
  const raw = await readFile(metaPath(id), 'utf8');
  return JSON.parse(raw) as UploadMeta;
}

export async function appendChunk(id: string, offset: number, bytes: Uint8Array) {
  const meta = await getUpload(id);
  if (meta.complete) throw new Error('El upload ya está completo.');
  if (offset !== meta.received) throw new Error(`Offset inválido. Esperado ${meta.received}, recibido ${offset}.`);
  if (bytes.byteLength > DEFAULT_CHUNK_SIZE + 1024) throw new Error('Chunk demasiado grande.');
  if (meta.received + bytes.byteLength > meta.size) throw new Error('El chunk excede el tamaño declarado.');
  await appendFile(dataPath(id), bytes);
  meta.received += bytes.byteLength;
  meta.complete = meta.received === meta.size;
  await writeFile(metaPath(id), JSON.stringify(meta), 'utf8');
  return meta;
}

export async function uploadFilePath(id: string) {
  const meta = await getUpload(id);
  if (!meta.complete || meta.received !== meta.size) throw new Error('El video todavía no termina de subir.');
  return { meta, path: dataPath(id) };
}

export async function removeUpload(id: string) {
  await Promise.allSettled([rm(dataPath(id), { force: true }), rm(metaPath(id), { force: true })]);
}
