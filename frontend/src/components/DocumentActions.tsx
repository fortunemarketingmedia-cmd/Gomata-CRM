import { useState } from 'react';
import { Download, Eye, X } from '../icons';

export type ViewableDocument = { id: number; document_type: string; file_name: string; mime_type?: string };

const previewable = (name: string, mime?: string) => /\.(pdf|png|jpe?g)$/i.test(name) || ['application/pdf', 'image/png', 'image/jpeg'].includes((mime || '').toLowerCase());
const isImage = (name: string, mime?: string) => /\.(png|jpe?g)$/i.test(name) || (mime || '').startsWith('image/');

/** Eye (preview) + Download buttons, side by side. `base` is the API document route, e.g. /api/partner/documents */
export function DocumentActions({ doc, base }: { doc: ViewableDocument; base: string }) {
  const [open, setOpen] = useState(false);
  const url = `${base}/${doc.id}/download`;
  const canPreview = previewable(doc.file_name, doc.mime_type);
  return <>
    <span className="document-actions">
      <button type="button" className="icon-button" title={canPreview ? 'View document' : 'Preview not available for this file type'} aria-label={`View ${doc.file_name}`} disabled={!canPreview} onClick={() => setOpen(true)}><Eye /></button>
      <a className="icon-button" href={url} download={doc.file_name} title="Download document" aria-label={`Download ${doc.file_name}`}><Download /></a>
    </span>
    {open && <div className="modal-layer document-viewer-layer" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="modal document-viewer">
        <div className="modal-head"><div><h2>{doc.document_type.replaceAll('_', ' ')}</h2><p>{doc.file_name}</p></div>
          <div className="document-actions"><a className="icon-button" href={url} download={doc.file_name} title="Download document" aria-label="Download document"><Download /></a><button type="button" className="icon-button" aria-label="Close preview" onClick={() => setOpen(false)}><X /></button></div></div>
        <div className="document-viewer-body">{isImage(doc.file_name, doc.mime_type) ? <img src={`${url}?inline=1`} alt={doc.file_name} /> : <iframe title={doc.file_name} src={`${url}?inline=1`} />}</div>
      </div>
    </div>}
  </>;
}
