import { NextRequest, NextResponse } from 'next/server';
import { createUpload, DEFAULT_CHUNK_SIZE } from '../../../../lib/upload-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { name?: string; type?: string; size?: number };
    const meta = await createUpload(String(body.name || 'sparring.mp4'), String(body.type || 'video/mp4'), Number(body.size || 0));
    return NextResponse.json({ uploadId: meta.id, chunkSize: DEFAULT_CHUNK_SIZE, received: meta.received, size: meta.size });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo iniciar la carga.' }, { status: 400 });
  }
}
