import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import {
  resolveBody,
  imageSrc,
  DEFAULT_TITLE,
  DEFAULT_PRIMARY_COLOR,
  type CertificateConfigLike,
  type CertificateEventInfo,
} from '@/lib/certificate';

export interface CertificateDocumentProps {
  config: CertificateConfigLike;
  event: CertificateEventInfo;
  certificate: { code: string; name: string };
  verifyUrl: string;
  qrDataUrl: string;
  /** true when rendering in a route handler (images fetched directly, no proxy) */
  server?: boolean;
}

// A4 landscape: 841.89 x 595.28 pt
const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
    position: 'relative',
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 841.89,
    // 0.01pt under the page's full height (595.28pt): react-pdf's Yoga layout
    // engine computes box heights in float32, so a background sized to the
    // exact page height can come out a hair taller than the page's content
    // area and trip its "can't wrap between pages" warning. The 0.01pt
    // margin (~0.0035mm) is visually imperceptible.
    height: 595.27,
  },
  content: { flex: 1, flexDirection: 'column', justifyContent: 'space-between', padding: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 60 },
  logo: { maxHeight: 60, maxWidth: 200, objectFit: 'contain' },
  issuer: { fontSize: 12, color: '#475569' },
  main: { alignItems: 'center', paddingHorizontal: 40 },
  title: { fontSize: 30, fontFamily: 'Helvetica-Bold', marginBottom: 18, textAlign: 'center' },
  name: { fontSize: 24, fontFamily: 'Helvetica-Bold', color: '#0f172a', marginBottom: 14, textAlign: 'center' },
  body: { fontSize: 13, lineHeight: 1.6, color: '#1e293b', textAlign: 'center', maxWidth: 640 },
  sponsorsBlock: { alignItems: 'center', marginTop: 10 },
  sponsorsLabel: { fontSize: 8, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  sponsorsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16 },
  sponsorLogo: { height: 32, maxWidth: 90, objectFit: 'contain' },
  signaturesRow: { flexDirection: 'row', justifyContent: 'center', gap: 32, marginTop: 10 },
  signature: { width: 150, alignItems: 'center' },
  signatureImage: { height: 40, maxWidth: 140, objectFit: 'contain', marginBottom: 4 },
  signatureSpacer: { height: 44 },
  signatureLine: { width: 140, borderTopWidth: 1, borderTopColor: '#94a3b8', marginBottom: 4 },
  signatureName: { fontSize: 10, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  signatureRole: { fontSize: 9, color: '#64748b', textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  footerText: { fontSize: 8, color: '#64748b' },
  code: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#0f172a', marginBottom: 2 },
  qr: { width: 56, height: 56 },
});

export function CertificateDocument({
  config,
  event,
  certificate,
  verifyUrl,
  qrDataUrl,
  server = false,
}: CertificateDocumentProps) {
  const primary = config.primary_color || DEFAULT_PRIMARY_COLOR;
  const title = config.title?.trim() || DEFAULT_TITLE;
  const body = resolveBody(config, event, certificate.name);
  const src = (url?: string | null) => imageSrc(url, { server });
  const sponsors = (config.sponsors || []).filter((s) => s.logo);
  const signatures = (config.signatures || []).slice(0, 4);

  return (
    <Document title={`${title} - ${certificate.name}`} author={config.issuer_name || 'Hub Community'}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {config.background ? <Image src={src(config.background)!} style={styles.background} /> : null}

        <View style={styles.content}>
          <View style={styles.header}>
            {config.logo ? <Image src={src(config.logo)!} style={styles.logo} /> : <View />}
            {config.issuer_name ? <Text style={styles.issuer}>{config.issuer_name}</Text> : null}
          </View>

          <View style={styles.main}>
            <Text style={[styles.title, { color: primary }]}>{title}</Text>
            <Text style={styles.name}>{certificate.name}</Text>
            <Text style={styles.body}>{body}</Text>
          </View>

          {sponsors.length > 0 ? (
            <View style={styles.sponsorsBlock}>
              <Text style={styles.sponsorsLabel}>Patrocínio</Text>
              <View style={styles.sponsorsRow}>
                {sponsors.map((s, i) => (
                  <Image key={`${s.name}-${i}`} src={src(s.logo)!} style={styles.sponsorLogo} />
                ))}
              </View>
            </View>
          ) : null}

          {signatures.length > 0 ? (
            <View style={styles.signaturesRow}>
              {signatures.map((s, i) => (
                <View key={`${s.name}-${i}`} style={styles.signature}>
                  {s.image ? (
                    <Image src={src(s.image)!} style={styles.signatureImage} />
                  ) : (
                    <View style={styles.signatureSpacer} />
                  )}
                  <View style={styles.signatureLine} />
                  <Text style={styles.signatureName}>{s.name}</Text>
                  {s.role ? <Text style={styles.signatureRole}>{s.role}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.footer}>
            <View>
              <Text style={styles.code}>Código: {certificate.code}</Text>
              <Text style={styles.footerText}>Verifique a autenticidade em {verifyUrl}</Text>
            </View>
            <Image src={qrDataUrl} style={styles.qr} />
          </View>
        </View>
      </Page>
    </Document>
  );
}

export default CertificateDocument;
