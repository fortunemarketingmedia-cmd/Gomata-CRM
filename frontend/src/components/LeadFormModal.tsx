import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, RotateCcw } from '../icons';
import { api, ApiError } from '../lib/api';
import type { Activity, Lead, LeadSource, LeadType, User } from '../types';
import { StatusBadge } from './StatusBadge';
import { useToast } from './Toast';
import { currentLeadForm } from './LeadFormFields';
import { createLeadBatchRow, LeadBatchFields, type LeadBatchRow } from './LeadBatchFields';

type Duplicate = { lead: Lead; history: Activity[] };

export function LeadFormModal({
  user: _user,
  onClose,
  onSaved,
  onCreated
}: {
  user?: User;
  onClose: () => void;
  onSaved: (lead: Lead) => void;
  onCreated?: (lead: Lead) => void;
}) {
  const [rows, setRows] = useState<LeadBatchRow[]>(() => [createLeadBatchRow()]);
  const [allowBackdated, setAllowBackdated] = useState(true);
  const [duplicates, setDuplicates] = useState<Record<number, Duplicate>>({});
  const [checking, setChecking] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const contacts = useMemo(() => rows.map(row => `${row.key}:${row.form.contact.replace(/[\s()-]/g, '')}`).join('|'), [rows]);

  useEffect(() => {
    const timer = setTimeout(() => {
      rows.forEach(row => {
        const contact = row.form.contact.replace(/[\s()-]/g, '');
        if (contact.length < 10) {
          setDuplicates(current => { const next = { ...current }; delete next[row.key]; return next; });
          return;
        }
        setChecking(current => ({ ...current, [row.key]: true }));
        void api<{ exists: boolean; lead?: Lead; history?: Activity[] }>(`/leads/check-contact/${encodeURIComponent(contact)}`)
          .then(result => setDuplicates(current => {
            const next = { ...current };
            if (result.lead) next[row.key] = { lead: result.lead, history: result.history || [] };
            else delete next[row.key];
            return next;
          }))
          .catch(() => {})
          .finally(() => setChecking(current => ({ ...current, [row.key]: false })));
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [contacts]);

  useEffect(() => {
    void api<{ settings: Record<string, string> }>('/settings').then(result => {
      setAllowBackdated(result.settings.allow_backdated_entries !== 'false');
      setRows(current => current.map(row => ({ ...row, form: {
        ...row.form,
        leadType: (result.settings.default_lead_type || 'WARM') as LeadType,
        leadSource: (result.settings.default_lead_source || 'WALK_IN') as LeadSource,
        workflowStatus: 'NEW'
      }})));
    }).catch(() => {});
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (Object.keys(duplicates).length) return toast.show('Remove or change duplicate contact numbers before saving', 'error');
    const contactsInBatch = rows.map(row => row.form.contact.replace(/[\s()-]/g, ''));
    if (new Set(contactsInBatch).size !== contactsInBatch.length) return toast.show('Each lead in this batch must have a different contact number', 'error');
    setBusy(true);
    try {
      const result = await api<{ leads: Lead[] }>('/leads/batch', { method: 'POST', body: JSON.stringify({ leads: rows.map(row => row.form) }) });
      result.leads.forEach(lead => onCreated?.(lead));
      toast.show(`${result.leads.length} lead${result.leads.length === 1 ? '' : 's'} captured successfully`);
      onSaved(result.leads[0]);
    } catch (caught) {
      const error = caught as ApiError;
      toast.show(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return <div className="modal-layer" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal lead-modal batch-lead-modal">
      <div className="modal-head"><div><span className="eyebrow">NEW ENQUIRY</span><h2>Add New Lead</h2><p>Add one or several customer enquiries in a single submission.</p></div></div>
      <form onSubmit={submit}>
        <LeadBatchFields rows={rows} onChange={setRows} allowBackdated={allowBackdated} afterContact={row => {
          const duplicate = duplicates[row.key];
          if (!duplicate) return checking[row.key] ? <small>Checking existing records…</small> : null;
          return <div className="duplicate-card"><AlertTriangle/><div><strong>Existing Lead Found</strong><p>{duplicate.lead.name} · {duplicate.lead.contact}</p><StatusBadge type={duplicate.lead.lead_type}/>{duplicate.history.slice(0, 3).map(activity => <small key={activity.id}>{activity.content}</small>)}</div><button type="button" onClick={() => location.assign(`/gre/${duplicate.lead.id}`)}>View full history <ArrowRight/></button></div>;
        }}/>
        <div className="modal-actions"><button type="button" className="text-button" onClick={()=>{setRows([createLeadBatchRow()]);setDuplicates({})}}><RotateCcw/>Clear form</button><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={busy || Boolean(Object.keys(duplicates).length)}>{busy ? 'Saving…' : `Save ${rows.length} lead${rows.length === 1 ? '' : 's'}`}</button></div>
      </form>
    </div>
  </div>;
}
