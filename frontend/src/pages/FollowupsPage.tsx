import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CalendarCheck, Clock3, Phone, Check, X, ArrowRight, CalendarClock } from '../icons';
import { api, fmtDateTime, toLocalInput } from '../lib/api';
import type { Followup, LeadType, WorkflowStatus } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';

const scopes = [['today', "Today's"], ['upcoming', 'Upcoming'], ['overdue', 'Overdue'], ['completed', 'Completed']] as const;

export function FollowupsPage() {
  const [params, setParams] = useSearchParams();
  const scope = params.get('scope') || 'today';
  const [items, setItems] = useState<Followup[]>([]);
  const [complete, setComplete] = useState<Followup | null>(null);
  const [reschedule, setReschedule] = useState<Followup | null>(null);
  const nav = useNavigate();
  const load = () => api<{ followups: Followup[] }>(`/followups?scope=${scope}`).then(r => setItems(r.followups));
  useEffect(() => { void load(); }, [scope]);
  return <>
    <div className="page-heading"><div><span className="eyebrow">CONNECTED ACTION QUEUE</span><h1>Follow-ups & Visits</h1><p>Customer actions stay synchronized with the calendar, dashboard and reminders.</p></div><button className="secondary" onClick={()=>nav('/calendar')}><CalendarClock/>Open unified calendar</button></div>
    <div className="tabs">{scopes.map(([key, label]) => <button className={scope === key ? 'active' : ''} onClick={() => setParams({ scope: key })} key={key}>{label}</button>)}</div>
    <section className="followup-list">
      {items.map(f => <article className={`card followup-row ${scope === 'overdue' ? 'overdue' : ''}`} key={f.id}>
        <div className="date-block"><span>{new Intl.DateTimeFormat('en-IN', { day: '2-digit' }).format(new Date(f.scheduled_at))}</span><small>{new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(new Date(f.scheduled_at)).toUpperCase()}</small></div>
        <div className="followup-main"><div><h3>{f.name}</h3><span className="cell-icon"><Phone />{f.contact}</span></div><StatusBadge type={f.lead_type} /><strong className="reminder-kind">{f.kind==='SITE_VISIT'?'SITE VISIT':f.kind==='OFFICE_VISIT'?'OFFICE VISIT':'FOLLOW-UP'}</strong><p>{f.remark || f.completion_remark || 'Contact customer'}</p></div>
        <div className="followup-time"><Clock3 /><strong>{new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(new Date(f.scheduled_at))}</strong><small>{scope === 'overdue' ? 'OVERDUE' : f.status}</small></div>
        <div className="followup-actions"><button className="secondary" onClick={() => nav(`/gre/${f.lead_id}`)}>View Lead <ArrowRight /></button>{f.status === 'PENDING' && <><button className="secondary" onClick={() => setReschedule(f)}><CalendarClock />Reschedule</button><button className="primary" onClick={() => setComplete(f)}><Check />Take action</button></>}</div>
      </article>)}
      {items.length === 0 && <div className="card empty-state"><CalendarCheck /><h2>No {scope} reminders</h2><p>{scope === 'overdue' ? "You're all caught up — excellent work." : 'Scheduled follow-ups, site visits and office visits will appear here.'}</p></div>}
    </section>
    {complete && <CompleteModal item={complete} onClose={() => setComplete(null)} onDone={() => { setComplete(null); void load(); }} />}
    {reschedule && <RescheduleModal item={reschedule} onClose={() => setReschedule(null)} onDone={() => { setReschedule(null); void load(); }} />}
  </>;
}

function CompleteModal({ item, onClose, onDone }: { item: Followup; onClose: () => void; onDone: () => void }) {
  const [remark, setRemark] = useState(''); const [type, setType] = useState<LeadType>(item.lead_type); const [nextStage, setNextStage] = useState<WorkflowStatus | ''>(''); const [scheduledAt,setScheduledAt]=useState(toLocalInput(new Date(Date.now()+3600000))); const[projectName,setProjectName]=useState(''); const[reason,setReason]=useState(''); const[reasonDetail,setReasonDetail]=useState(''); const [busy, setBusy] = useState(false); const toast = useToast();
  const action=item.kind==='SITE_VISIT'?'Site visit':item.kind==='OFFICE_VISIT'?'Office visit':'Follow-up';
  const scheduled=nextStage==='FOLLOW_UP'||nextStage==='SITE_VISIT'||nextStage==='OFFICE_VISIT';
  const nextByStage:Partial<Record<WorkflowStatus,WorkflowStatus[]>>={FOLLOW_UP:['FOLLOW_UP','QUALIFIED','SITE_VISIT','OFFICE_VISIT','NEGOTIATION','LOST'],SITE_VISIT:['FOLLOW_UP','SITE_VISIT','SITE_VISIT_COMPLETED','LOST'],SITE_VISIT_COMPLETED:['FOLLOW_UP','NEGOTIATION','LOST'],OFFICE_VISIT:['FOLLOW_UP','NEGOTIATION','LOST'],NEGOTIATION:['FOLLOW_UP','BOOKING_PENDING','LOST'],BOOKING_PENDING:['NEGOTIATION','WON','LOST']};
  const options=nextByStage[item.workflow_status]||[];
  const names:Record<string,string>={QUALIFIED:'Mark as Qualified',FOLLOW_UP:'Schedule another follow-up',SITE_VISIT:'Move to Site Visit',SITE_VISIT_COMPLETED:'Mark Visit Completed',OFFICE_VISIT:'Schedule Office Visit',NEGOTIATION:'Move to Negotiation',BOOKING_PENDING:'Move to Booking Pending',WON:'Close as Won',LOST:'Close as Lost'};
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); try { await api(`/followups/${item.id}/action`, { method: 'POST', body: JSON.stringify({ remark, leadType: type, nextStage:nextStage||undefined, scheduledAt:scheduled?new Date(scheduledAt).toISOString():undefined, projectName:nextStage==='SITE_VISIT'?projectName:undefined, lostReason:nextStage==='LOST'?reason:undefined, lostReasonDetail:nextStage==='LOST'&&reason==='OTHER'?reasonDetail:undefined }) }); toast.show(nextStage?`${action} completed and lead moved to the selected next action.`:`${action} completed.`); onDone(); } catch (e: any) { toast.show(e.message, 'error'); } finally { setBusy(false); } };
  return <div className="modal-layer"><div className="modal"><div className="modal-head"><div><span className="eyebrow">{action.toUpperCase()} OUTCOME</span><h2>Complete &amp; choose next action</h2><p>{item.name} · {fmtDateTime(item.scheduled_at)}</p></div><button className="icon-button" onClick={onClose}><X /></button></div><form onSubmit={submit}><label>Outcome remark *<textarea rows={3} value={remark} onChange={e => setRemark(e.target.value)} placeholder={`What happened during the ${action.toLowerCase()}?`} required /></label><fieldset><legend>Update lead classification</legend><div className="type-picker compact">{(['HOT', 'WARM', 'COLD'] as LeadType[]).map(t => <label className={type === t ? 'selected' : ''} key={t}><input type="radio" checked={type === t} onChange={() => setType(t)} /><i className={t.toLowerCase()} /><strong>{t}</strong></label>)}</div></fieldset><label>Next action<select value={nextStage} onChange={e=>setNextStage(e.target.value as WorkflowStatus|'')}><option value="">Complete only — decide later</option>{options.map(stage=><option value={stage} key={stage}>{names[stage]}</option>)}</select></label>{scheduled&&<label>Next action date &amp; time *<input type="datetime-local" min={toLocalInput()} value={scheduledAt} onChange={e=>setScheduledAt(e.target.value)} required/></label>}{nextStage==='SITE_VISIT'&&<label>Project / site *<input value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="Project name or site" required/></label>}{nextStage==='LOST'&&<><label>Lost reason *<select value={reason} onChange={e=>setReason(e.target.value)} required><option value="">Choose reason</option><option value="PRICE_ISSUE">Price issue</option><option value="NOT_INTERESTED">Not interested</option><option value="PURCHASED_ELSEWHERE">Purchased elsewhere</option><option value="LOCATION_ISSUE">Location issue</option><option value="BUDGET_ISSUE">Budget issue</option><option value="NO_RESPONSE">No response</option><option value="POSTPONED_PURCHASE">Postponed purchase</option><option value="OTHER">Other</option></select></label>{reason==='OTHER'&&<label>Other reason *<input value={reasonDetail} onChange={e=>setReasonDetail(e.target.value)} required/></label>}</>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Complete action'}</button></div></form></div></div>;
}

function RescheduleModal({ item, onClose, onDone }: { item: Followup; onClose: () => void; onDone: () => void }) {
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(new Date(Date.now() + 3600000))); const [remark, setRemark] = useState(item.remark); const [busy, setBusy] = useState(false); const toast = useToast();
  const action=item.kind==='SITE_VISIT'?'Site visit':item.kind==='OFFICE_VISIT'?'Office visit':'Follow-up';const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); try { await api(`/followups/${item.id}/reschedule`, { method: 'POST', body: JSON.stringify({ scheduledAt: new Date(scheduledAt).toISOString(), remark }) }); toast.show(`${action} rescheduled`); onDone(); } catch (e: any) { toast.show(e.message, 'error'); } finally { setBusy(false); } };
  return <div className="modal-layer"><div className="modal small"><div className="modal-head"><div><span className="eyebrow">MOVE REMINDER</span><h2>Reschedule {action}</h2><p>{item.name}</p></div><button className="icon-button" onClick={onClose}><X /></button></div><form onSubmit={submit}><label>New date & time<input type="datetime-local" min={toLocalInput()} value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} required /></label><label>Purpose / remark<textarea rows={3} value={remark} onChange={e => setRemark(e.target.value)} required /></label><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Reschedule'}</button></div></form></div></div>;
}
