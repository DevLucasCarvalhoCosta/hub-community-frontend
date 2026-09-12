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
    // No background → exercises the default double-line frame path; the participant
    // signature slot is always present, so this also covers a single-slot row.
    const buffer = await render({});
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.toString('latin1')).toMatch(/\/Type \/Pages\n\/Count 1\n/);
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
    expect(buffer.toString('latin1')).toMatch(/\/Type \/Pages\n\/Count 1\n/);
  });

  it('renders typed cursive signatures in all three fonts', async () => {
    // `server` is set in render(), so the fonts resolve from <cwd>/public/fonts.
    const buffer = await render({
      signatures: [
        { name: 'Ana', role: 'Org', text: 'Ana Souza', font: 'great_vibes' },
        { name: 'Bia', role: 'CTO', text: 'Bia Lima', font: 'allura' },
        { name: 'Caio', text: 'Caio Melo', font: 'dancing_script' },
      ],
    });
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.toString('latin1')).toMatch(/\/Type \/Pages\n\/Count 1\n/);
    const pdf = buffer.toString('latin1');
    // Embedded font dictionaries name the families, so all three must show up.
    expect(pdf).toMatch(/GreatVibes/);
    expect(pdf).toMatch(/Allura/);
    expect(pdf).toMatch(/DancingScript/);
  });

  it('prefers the image over typed text and falls back to the default font', async () => {
    const buffer = await render({
      signatures: [
        { name: 'A', image: PNG, text: 'ignored', font: 'allura' },
        { name: 'B', text: 'No font set' },
      ],
    });
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    const pdf = buffer.toString('latin1');
    expect(pdf).toMatch(/GreatVibes/);
    expect(pdf).not.toMatch(/Allura/);
  });

  it('renders 5 compact slots with 4 org signatures plus the participant', async () => {
    const buffer = await render({
      signatures: [
        { name: 'A', role: 'CEO', image: PNG },
        { name: 'B', role: 'CTO' },
        { name: 'C' },
        { name: 'D', role: 'Org', image: PNG },
      ],
    });
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.toString('latin1')).toMatch(/\/Type \/Pages\n\/Count 1\n/);
  });
}, 30_000);
