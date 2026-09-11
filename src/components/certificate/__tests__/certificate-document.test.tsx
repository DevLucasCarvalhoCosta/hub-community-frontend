// @vitest-environment node
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { CertificateDocument } from '../certificate-document';
import { generateQrDataUrl } from '@/lib/certificate-qr';

// 1x1 transparent PNG — keeps the test offline.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const event = {
  title: 'React Summit Goiânia',
  slug: 'react-summit-goiania',
  start_date: '2026-08-01T12:00:00.000Z',
  end_date: '2026-08-01T21:30:00.000Z',
  location: { title: 'Sebrae', city: 'Goiânia' },
  communities: [{ title: 'Reactivando' }],
};

const render = async (config: Parameters<typeof CertificateDocument>[0]['config']) => {
  const qrDataUrl = await generateQrDataUrl('https://hubcommunity.io/certificado/verificar/RCT-AAAAAAAA');
  const buffer = await renderToBuffer(
    <CertificateDocument
      config={config}
      event={event}
      certificate={{ code: 'RCT-AAAAAAAA', name: 'Ana Souza' }}
      verifyUrl="https://hubcommunity.io/certificado/verificar/RCT-AAAAAAAA"
      qrDataUrl={qrDataUrl}
      server
    />,
  );
  return buffer;
};

describe('CertificateDocument', () => {
  it('renders a PDF with the minimal config', async () => {
    const buffer = await render({});
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('renders with background, logo, 8 sponsors and 4 signatures', async () => {
    const buffer = await render({
      title: 'Certificado',
      issuer_name: 'Reactivando',
      primary_color: '#8B5CF6',
      logo: PNG,
      background: PNG,
      sponsors: Array.from({ length: 8 }, (_, i) => ({ name: `S${i}`, logo: PNG })),
      signatures: [
        { name: 'A', role: 'CEO', image: PNG },
        { name: 'B', role: 'CTO' },
        { name: 'C' },
        { name: 'D', role: 'Org', image: PNG },
      ],
    });
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });
}, 30_000);
