import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { fetchCertificateBundle, renderCertificatePdf } from '@/lib/certificate-server';
import { certificateFileName } from '@/lib/certificate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_CODES = 500;

/**
 * POST { codes: string[] } -> ZIP with one PDF per certificate.
 * Requires the admin's Authorization header (presence only: each code is unguessable
 * and already public via /certificado/[code]).
 */
export async function POST(request: NextRequest) {
  if (!request.headers.get('authorization')) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  let codes: string[] = [];
  try {
    const body = await request.json();
    codes = Array.isArray(body?.codes) ? body.codes.map((c: unknown) => String(c).toUpperCase()) : [];
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }
  if (codes.length === 0 || codes.length > MAX_CODES) {
    return NextResponse.json({ error: `Informe entre 1 e ${MAX_CODES} códigos` }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const code of codes) {
    try {
      const bundle = await fetchCertificateBundle(code);
      if (!bundle) continue; // revoked or unknown: skip, the UI already filtered
      const pdf = await renderCertificatePdf(bundle, baseUrl);
      let name = certificateFileName(bundle.event, bundle.certificate.name);
      if (usedNames.has(name)) name = name.replace(/\.pdf$/, `-${code}.pdf`);
      usedNames.add(name);
      zip.file(name, pdf);
    } catch (error: any) {
      console.error(`ZIP render error for ${code}:`, error);
      return NextResponse.json({ error: `Falha ao gerar o certificado ${code}`, code }, { status: 502 });
    }
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="certificados.zip"',
      'Cache-Control': 'private, no-store',
    },
  });
}
