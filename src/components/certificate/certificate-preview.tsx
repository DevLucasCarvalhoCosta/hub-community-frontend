'use client';

import { useEffect, useState } from 'react';
import { PDFViewer } from '@react-pdf/renderer';
import { CertificateDocument } from '@/components/certificate/certificate-document';
import { generateQrDataUrl } from '@/lib/certificate-qr';
import { verifyUrl, type CertificateConfigLike, type CertificateEventInfo } from '@/lib/certificate';
import { Skeleton } from '@/components/ui/skeleton';

interface CertificatePreviewProps {
  config: CertificateConfigLike;
  event: CertificateEventInfo;
  certificate: { code: string; name: string };
  height?: number;
}

// Heavy module (react-pdf). Consumers must load this with next/dynamic({ ssr: false }).
export default function CertificatePreview({ config, event, certificate, height = 480 }: CertificatePreviewProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const url = verifyUrl(certificate.code);

  useEffect(() => {
    let active = true;
    generateQrDataUrl(url)
      .then((data) => {
        if (active) setQrDataUrl(data);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [url]);

  if (qrDataUrl === null) return <Skeleton className="w-full" style={{ height }} />;

  return (
    <PDFViewer width="100%" height={height} showToolbar={false} className="rounded-lg border">
      <CertificateDocument
        config={config}
        event={event}
        certificate={certificate}
        verifyUrl={url}
        qrDataUrl={qrDataUrl}
      />
    </PDFViewer>
  );
}
