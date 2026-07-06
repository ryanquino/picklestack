import { useState, useEffect } from 'react';
import QRCode from 'qrcode';

interface QRCodeDisplayProps {
  url: string;
  size?: number;
}

function QRCodeDisplay({ url, size = 160 }: QRCodeDisplayProps) {
  const [svgString, setSvgString] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const displaySize = Math.max(size, 128);

  useEffect(() => {
    let cancelled = false;

    QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'H', width: displaySize })
      .then((svg) => {
        if (!cancelled) {
          setSvgString(svg);
          setError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSvgString(null);
          setError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url, displaySize]);

  if (error) {
    return (
      <div className="qr-code-display qr-code-display--error" aria-label="QR code unavailable">
        <p className="qr-code-display__fallback-text">QR code unavailable</p>
        <code className="qr-code-display__url">{url}</code>
      </div>
    );
  }

  if (!svgString) {
    return null;
  }

  return (
    <div
      className="qr-code-display"
      style={{ width: `${displaySize}px`, height: `${displaySize}px` }}
      aria-label={`QR code for ${url}`}
      dangerouslySetInnerHTML={{ __html: svgString }}
    />
  );
}

export default QRCodeDisplay;
