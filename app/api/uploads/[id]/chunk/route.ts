import { NextRequest, NextResponse } from 'next/server';
import { appendChunk, DEFAULT_CHUNK_SIZE, getUpload } from '../../../../../lib/upload-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const offset = Number(req.nextUrl.searchParams.get('offset') || '0');
    const length = Number(req.headers.get('content-length') || '0');
    if (!Number.isFinite(offset) || offset < 0) throw new Error('Offset inválido.');
    if (length > DEFAULT_CHUNK_SIZE + 1024) throw new Error('Chunk demasiado grande.');
    const bytes = new Uint8Array(await req.arrayBuffer());
    const meta = await appendChunk(id, offset, bytes);
    return NextResponse.json({ uploadId: id, received: meta.received, size: meta.size, complete: meta.complete });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo subir el fragmento.' }, { status: 400 });
  }
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const meta = await getUpload(id);
    return NextResponse.json({ uploadId: id, received: meta.received, size: meta.size, complete: meta.complete });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload no encontrado.' }, { status: 404 });
  }
}
