import { useState } from 'react';
import { Building2, CheckCircle2, Send, Sparkles } from '../icons';
import { currentLeadForm } from '../components/LeadFormFields';
import { createLeadBatchRow, LeadBatchFields, type LeadBatchRow } from '../components/LeadBatchFields';

export function PublicLeadFormPage() {
  const [rows, setRows] = useState<LeadBatchRow[]>(() => [createLeadBatchRow(currentLeadForm('OTHER'))]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState<Array<{ id: number; serial_no: number; name: string }> | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const leads = rows.map(row => ({ ...row.form, contact: row.form.contact.replace(/[\s()-]/g, '') }));
    if (leads.some(lead => !/^\+?[0-9]{10,15}$/.test(lead.contact))) {
      setError('Please enter a valid 10 to 15 digit contact number for every lead');
      return;
    }
    if (new Set(leads.map(lead => lead.contact)).size !== leads.length) return setError('Each lead must have a different contact number.');

    setSubmitting(true);
    try {
      const response = await fetch('/api/public/leads/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to submit enquiry. Please try again.');
      setSubmitted(data.leads);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    const source = rows[0]?.form.leadSource || 'OTHER';
    setRows([createLeadBatchRow(currentLeadForm(source))]);
    setSubmitted(null);
    setError('');
  };

  return (
    <div className="public-lead-page shared-lead-page">
      <div className="public-lead-container">
        <header className="public-lead-header">
          <span className="brand-badge"><Building2 /> GOMATA VISION LLP</span>
          <h1>Customer Enquiry Form</h1>
          <p>Enter the enquiry using the same lead form used by our GRE team.</p>
        </header>

        {submitted ? (
          <div className="public-success-card">
            <div className="success-icon-wrap"><CheckCircle2 className="success-icon" /></div>
            <h2>{submitted.length} lead{submitted.length === 1 ? '' : 's'} submitted!</h2>
            <p className="success-subtitle">{submitted.map(lead => lead.name).join(', ')} {submitted.length === 1 ? 'has' : 'have'} been registered with our sales desk.</p>
            <div className="success-meta-box">
              <span>Enquiry Reference</span>
              <strong>{submitted.map(lead => `#${String(lead.serial_no).padStart(4, '0')}`).join(', ')}</strong>
            </div>
            <div className="success-details">
              <p><Sparkles /> A Gomata Vision executive will contact you shortly.</p>
            </div>
            <button type="button" className="primary full" onClick={reset}>Add another lead</button>
          </div>
        ) : (
          <form onSubmit={submit} className="modal lead-modal public-shared-lead-form">
            <div className="modal-head">
              <div>
                <span className="eyebrow">NEW ENQUIRY</span>
                <h2>Add New Lead</h2>
                <p>Capture customer enquiry details and initial requirements.</p>
              </div>
            </div>
            <div className="shared-lead-fields">
              {error && <div className="public-error-banner" role="alert">{error}</div>}
              <LeadBatchFields rows={rows} onChange={next => { setError(''); setRows(next); }} />
              <div className="modal-actions">
                <button type="submit" className="primary" disabled={submitting}>
                  {submitting ? 'Saving…' : <>Save {rows.length} lead{rows.length === 1 ? '' : 's'} <Send /></>}
                </button>
              </div>
            </div>
          </form>
        )}

        <footer className="public-lead-footer">
          <p>© {new Date().getFullYear()} Gomata Vision LLP. All rights reserved.</p>
          <small>Powered by <strong>Fortech CRM</strong></small>
        </footer>
      </div>
    </div>
  );
}
