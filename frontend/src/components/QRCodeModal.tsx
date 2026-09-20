import { useEffect, useRef, useState } from 'react';
// Use the browser entry directly so production bundling never traverses the
// package's Node-only PNG/CLI dependencies.
import QRCode from 'qrcode/lib/browser.js';
import { Check, Copy, Download, ExternalLink, Printer, QrCode, X } from '../icons';
import { useToast } from './Toast';

export function QRCodeModal({ onClose }: { onClose: () => void }) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/qr-lead` : '/qr-lead';

  useEffect(() => {
    QRCode.toDataURL(publicUrl, {
      width: 360,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'H'
    })
      .then(url => setQrDataUrl(url))
      .catch(err => console.error('Failed to generate QR code', err));
  }, [publicUrl]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.show('Public lead form link copied to clipboard');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.show('Failed to copy link', 'error');
    }
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `gomata-lead-form-qr-${new Date().toISOString().slice(0, 10)}.png`;
    link.click();
    toast.show('QR Code image downloaded');
  };

  const printPoster = () => {
    window.print();
  };

  return (
    <div
      className="modal-layer"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal qr-modal">
        <div className="modal-head">
          <div>
            <span className="eyebrow">MOBILE & KIOSK CAPTURE</span>
            <h2>Scan QR for Lead Form</h2>
            <p>Scan from any phone or device to fill customer enquiries instantly.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>

        <div className="qr-modal-body" ref={printRef}>
          <div className="qr-canvas-card">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Lead Capture QR Code" className="qr-image" />
            ) : (
              <div className="qr-placeholder">
                <QrCode />
                <span>Generating QR…</span>
              </div>
            )}
            <div className="qr-card-caption">
              <strong>Gomata Vision LLP · Lead Form</strong>
              <small>Point your phone camera to scan and open</small>
            </div>
          </div>

          <div className="qr-link-box">
            <input type="text" readOnly value={publicUrl} className="qr-url-input" />
            <button
              type="button"
              className={`copy-btn ${copied ? 'copied' : ''}`}
              onClick={copyLink}
              title="Copy URL"
            >
              {copied ? <Check /> : <Copy />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="open-btn"
              title="Open public form in new tab"
            >
              <ExternalLink />
            </a>
          </div>

          <div className="qr-instructions">
            <div className="instruction-step">
              <span className="step-num">1</span>
              <div>
                <strong>Scan with any mobile camera</strong>
                <p>No app install or login required</p>
              </div>
            </div>
            <div className="instruction-step">
              <span className="step-num">2</span>
              <div>
                <strong>Customer or Executive fills form</strong>
                <p>Name, contact, reference & requirement</p>
              </div>
            </div>
            <div className="instruction-step">
              <span className="step-num">3</span>
              <div>
                <strong>Instant CRM Entry & Notification</strong>
                <p>Appears live in New Leads register</p>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-actions qr-actions">
          <button type="button" className="secondary" onClick={printPoster}>
            <Printer /> Print Poster
          </button>
          <button type="button" className="secondary" onClick={downloadQr} disabled={!qrDataUrl}>
            <Download /> Download PNG
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
