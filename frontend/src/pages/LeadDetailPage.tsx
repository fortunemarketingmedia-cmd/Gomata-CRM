import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  CircleDot,
  Clock3,
  Edit3,
  Flame,
  History,
  Link2,
  MapPin,
  MessageSquare,
  MessageSquarePlus,
  Pencil,
  Phone,
  PhoneCall,
  Save,
  ShieldAlert,
  Sparkles,
  ThermometerSnowflake,
  ThermometerSun,
  UserCheck,
  UserPlus,
  UserRound,
  X
} from '../icons';
import { api, fmtDate, fmtDateTime } from '../lib/api';
import type { Activity, Followup, Lead, LeadSource, LeadType, User } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';

type Details = {
  lead: Lead;
  activities: Activity[];
  followups: Followup[];
  bookings: Array<{id:number;plot_id:number;status:string;quoted_price:number;token_amount:number;booking_date:string;plot_number:string;project_name:string;paid_amount:number}>;
};

const stages = [
  { id: 'NEW', label: 'New Lead' },
  { id: 'CONTACTED', label: 'Contacted' },
  { id: 'FOLLOW_UP', label: 'Follow-up' },
  { id: 'SITE_VISIT', label: 'Site Visit' },
  { id: 'OFFICE_VISIT', label: 'Office Visit' },
  { id: 'WON', label: 'Closed Won' }
] as const;

export function LeadDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<Details | null>(null);
  const [assignees, setAssignees] = useState<User[]>([]);
  const [editing, setEditing] = useState(false);
  const [remark, setRemark] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [edit, setEdit] = useState({
    name: '',
    contact: '',
    address: '',
    referenceName: '',
    leadType: 'WARM' as LeadType,
    leadSource: 'WALK_IN' as LeadSource,
    assignedTo: '',
    projectName: '',
    enquiryDate: '',
    enquiryTime: ''
  });

  const toast = useToast();
  const nav = useNavigate();
  const [query] = useSearchParams();
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const load = () =>
    api<Details>(`/leads/${id}`)
      .then(result => {
        const normalized = {
          ...result,
          lead: {
            ...result.lead,
            enquiry_date: String(result.lead.enquiry_date).slice(0, 10),
            enquiry_time: String(result.lead.enquiry_time).slice(0, 5)
          }
        };
        setData(normalized);
        setEdit({
          name: normalized.lead.name,
          contact: normalized.lead.contact,
          address: normalized.lead.address || '',
          referenceName: normalized.lead.reference_name || '',
          leadType: normalized.lead.lead_type,
          leadSource: normalized.lead.lead_source,
          assignedTo: String(normalized.lead.assigned_to),
          projectName: normalized.lead.project_name || '',
          enquiryDate: normalized.lead.enquiry_date,
          enquiryTime: normalized.lead.enquiry_time
        });
      })
      .catch(() => nav('/gre'));

  useEffect(() => {
    void load();
    void api<{ users: User[] }>('/users/assignees').then(r => setAssignees(r.users));
  }, [id]);

  useEffect(() => {
    if (query.get('edit')) setEditing(true);
  }, [query]);

  if (!data) return <div className="loading">Loading lead journey & profile…</div>;

  const lead = data.lead;
  const upcoming = data.followups
    .filter(item => item.status === 'PENDING')
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];

  const addRemark = async () => {
    if (!remark.trim()) return;
    try {
      await api(`/leads/${id}/remarks`, { method: 'POST', body: JSON.stringify({ remark }) });
      setRemark('');
      toast.show('Remark saved to lead history');
      void load();
    } catch (e: any) {
      toast.show(e.message, 'error');
    }
  };

  const saveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEdit(true);
    try {
      const payload: Record<string, any> = {
        name: edit.name,
        contact: edit.contact,
        address: edit.address,
        referenceName: edit.referenceName,
        leadType: edit.leadType,
        leadSource: edit.leadSource,
        projectName: edit.projectName,
        enquiryDate: edit.enquiryDate,
        enquiryTime: edit.enquiryTime
      };

      if (canManage && edit.assignedTo) {
        payload.assignedTo = Number(edit.assignedTo);
      }

      await api(`/leads/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });

      setEditing(false);
      toast.show('Lead details updated successfully');
      void load();
    } catch (e: any) {
      toast.show(e.message || 'Failed to save lead updates', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  // Determine stage progression for visual journey
  const stageOrder = ['NEW', 'CONTACTED', 'FOLLOW_UP', 'SITE_VISIT', 'OFFICE_VISIT', 'WON'];
  const currentStageIndex = lead.workflow_status === 'LOST' ? -1 : stageOrder.indexOf(lead.workflow_status);

  return (
    <>
      <div className="detail-back">
        <Link to="/gre">
          <ArrowLeft /> Back to lead register
        </Link>
      </div>

      <div className="profile-hero">
        <div className="customer-avatar">
          {lead.name
            .split(' ')
            .map(x => x[0])
            .slice(0, 2)
            .join('')
            .toUpperCase()}
        </div>
        <div className="profile-title">
          <span>LEAD #{String(lead.serial_no).padStart(4, '0')}</span>
          <h1>{lead.name}</h1>
          <div className="hero-status-tags">
            <StatusBadge type={lead.lead_type} />
            <span className={`workflow-status ${lead.workflow_status.toLowerCase()}`}>
              {workflowLabel(lead.workflow_status)}
            </span>
          </div>
        </div>
        <div className="hero-actions">
          <button className="secondary" onClick={() => setEditing(!editing)}>
            {editing ? <X /> : <Pencil />}
            {editing ? 'Close Edit' : 'Edit Lead'}
          </button>
          <button className="primary" onClick={() => nav('/sales-pipeline')}>
            <CalendarPlus /> Open Sales Pipeline
          </button>
        </div>
      </div>

      {/* Visual Journey Progress Bar */}
      <section className="card lead-journey-tracker">
        <div className="tracker-header">
          <div>
            <span className="eyebrow">LEAD PROGRESSION</span>
            <h3>Lead Journey Lifecycle</h3>
          </div>
          {lead.workflow_status === 'LOST' && (
            <span className="lost-badge">
              <ShieldAlert size={15} /> Closed Lost
            </span>
          )}
        </div>

        <div className="journey-stepper">
          {stages.map((stage, idx) => {
            const isDone = currentStageIndex > idx || (lead.workflow_status === 'WON' && stage.id === 'WON');
            const isCurrent = lead.workflow_status === stage.id;
            const isUpcoming = currentStageIndex < idx;

            return (
              <div
                key={stage.id}
                className={`journey-step ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''} ${
                  isUpcoming ? 'upcoming' : ''
                }`}
              >
                <div className="step-circle">
                  {isDone ? <Check size={16} /> : <span>{idx + 1}</span>}
                </div>
                <div className="step-content">
                  <strong>{stage.label}</strong>
                  <small>{isCurrent ? 'Active Stage' : isDone ? 'Completed' : 'Pending'}</small>
                </div>
                {idx < stages.length - 1 && <div className="step-line" />}
              </div>
            );
          })}
        </div>
      </section>

      {lead.workflow_status==='WON'&&<section className="card lead-booking-card"><div className="card-head"><div><span className="eyebrow">POST-CLOSE JOURNEY</span><h3>Plot allocation & onboarding</h3><p>Connect this converted client to inventory, payments and documents.</p></div>{data.bookings.length===0&&<button className="primary" onClick={()=>nav('/inventory?leadId='+lead.id)}><Building2/>Select plot</button>}</div>{data.bookings.length>0?<div className="lead-booking-list">{data.bookings.map(booking=><button key={booking.id} onClick={()=>nav(`/inventory/bookings/${booking.id}`)}><Building2/><span><strong>{booking.project_name} · Plot {booking.plot_number}</strong><small>{booking.status.replace('_',' ')} · ₹{Number(booking.paid_amount).toLocaleString('en-IN')} received of ₹{Number(booking.quoted_price).toLocaleString('en-IN')}</small></span><ArrowRight/></button>)}</div>:<p className="muted">This closed-won lead is ready to be allocated to an available plot.</p>}</section>}

      <div className="detail-grid">
        <div>
          {/* Customer Details / Edit Form */}
          <section className="card info-card">
            <div className="card-head">
              <div>
                <h3>Customer Details</h3>
                <p>
                  {editing
                    ? 'Edit customer information. Journey & audit logs remain immutable.'
                    : 'Original enquiry & contact details · Manage stages via Sales Pipeline'}
                </p>
              </div>
              {!editing && (
                <button className="text-button" onClick={() => setEditing(true)}>
                  <Pencil size={15} /> Edit
                </button>
              )}
            </div>

            {editing ? (
              <form className="edit-lead-form" onSubmit={saveChanges}>
                <div className="form-grid two">
                  <label>
                    Customer Name *
                    <input
                      required
                      value={edit.name}
                      onChange={e => setEdit({ ...edit, name: e.target.value })}
                      placeholder="Full name"
                    />
                  </label>

                  <label>
                    Contact Number *
                    <input
                      required
                      type="tel"
                      value={edit.contact}
                      onChange={e => setEdit({ ...edit, contact: e.target.value })}
                      placeholder="10-15 digit mobile number"
                    />
                  </label>
                </div>

                <div className="form-grid two">
                  <label>
                    Lead Classification
                    <select
                      value={edit.leadType}
                      onChange={e => setEdit({ ...edit, leadType: e.target.value as LeadType })}
                    >
                      <option value="HOT">HOT (Ready to proceed)</option>
                      <option value="WARM">WARM (Interested / Follow-up)</option>
                      <option value="COLD">COLD (Long-term / Low interest)</option>
                    </select>
                  </label>

                  <label>
                    Lead Source
                    <select
                      value={edit.leadSource}
                      onChange={e => setEdit({ ...edit, leadSource: e.target.value as LeadSource })}
                    >
                      <option value="WALK_IN">Walk-in</option>
                      <option value="WEBSITE">Website</option>
                      <option value="CALLING">Calling</option>
                      <option value="OTHER">Others</option>
                    </select>
                  </label>
                </div>

                <div className="form-grid two">
                  <label>
                    Reference / Referred By
                    <input
                      value={edit.referenceName}
                      onChange={e => setEdit({ ...edit, referenceName: e.target.value })}
                      placeholder="From whose reference the lead had come"
                      maxLength={150}
                    />
                  </label>

                  <label>
                    Project / Site Name
                    <input
                      value={edit.projectName}
                      onChange={e => setEdit({ ...edit, projectName: e.target.value })}
                      placeholder="Project name or site"
                    />
                  </label>
                </div>

                <div className="form-grid two">
                  <label>
                    Enquiry Date
                    <input
                      type="date"
                      value={edit.enquiryDate}
                      onChange={e => setEdit({ ...edit, enquiryDate: e.target.value })}
                    />
                  </label>

                  <label>
                    Enquiry Time
                    <input
                      type="time"
                      value={edit.enquiryTime}
                      onChange={e => setEdit({ ...edit, enquiryTime: e.target.value })}
                    />
                  </label>
                </div>

                {canManage && (
                  <label>
                    Assigned Executive
                    <select
                      value={edit.assignedTo}
                      onChange={e => setEdit({ ...edit, assignedTo: e.target.value })}
                    >
                      {assignees.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({roleLabel(item.role)})
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label>
                  Customer Address
                  <textarea
                    rows={2}
                    value={edit.address}
                    onChange={e => setEdit({ ...edit, address: e.target.value })}
                    placeholder="House/flat, area, city"
                  />
                </label>

                <div className="inline-actions">
                  <button type="button" className="secondary" onClick={() => setEditing(false)}>
                    <X /> Cancel
                  </button>
                  <button type="submit" className="primary" disabled={savingEdit}>
                    <Save /> {savingEdit ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="info-list">
                <Info icon={<UserRound />} label="Customer name" value={lead.name} />
                <Info icon={<Phone />} label="Contact number" value={lead.contact} />
                <Info
                  icon={<Link2 />}
                  label="Reference / Referred by"
                  value={lead.reference_name || 'Direct / None'}
                />
                <Info icon={<MapPin />} label="Address" value={lead.address || 'Not provided'} />
                <Info
                  icon={<UserRound />}
                  label="Assigned executive"
                  value={lead.assigned_name || 'Not assigned'}
                />
                <Info
                  icon={<CircleDot />}
                  label="Lead source"
                  value={sourceLabel(lead.lead_source)}
                />
                <Info
                  icon={<CalendarDays />}
                  label="Enquiry date"
                  value={`${fmtDate(lead.enquiry_date)} · ${new Intl.DateTimeFormat('en-IN', {
                    weekday: 'long'
                  }).format(new Date(`${lead.enquiry_date}T00:00:00`))}`}
                />
                <Info icon={<Clock3 />} label="Enquiry time" value={lead.enquiry_time} />
                <Info
                  icon={<CircleDot />}
                  label="Pipeline stage"
                  value={workflowLabel(lead.workflow_status)}
                />
                {lead.contact_outcome && (
                  <Info
                    icon={<PhoneCall />}
                    label="Contact outcome"
                    value={contactOutcomeLabel(lead.contact_outcome)}
                  />
                )}
                {lead.project_name && (
                  <Info icon={<Building2 />} label="Project / site" value={lead.project_name} />
                )}
                {lead.lost_reason && (
                  <Info
                    icon={<ShieldAlert />}
                    label="Lost reason"
                    value={
                      lead.lost_reason === 'OTHER' && lead.lost_reason_detail
                        ? `Other — ${lead.lost_reason_detail}`
                        : lostReasonLabel(lead.lost_reason)
                    }
                  />
                )}
              </div>
            )}
          </section>

          {/* Lead Journey & Activity History (Immutable audit trail) */}
          <section className="card activity-card">
            <div className="card-head">
              <div>
                <h3>Lead Journey & Activity Log</h3>
                <p>Complete audit trail of who performed what action on this lead</p>
              </div>
            </div>

            <div className="remark-compose">
              <textarea
                rows={2}
                placeholder="Add a new remark or note to lead history…"
                value={remark}
                onChange={e => setRemark(e.target.value)}
              />
              <button className="primary" onClick={addRemark} disabled={!remark.trim()}>
                <MessageSquarePlus /> Add Remark
              </button>
            </div>

            <div className="journey-timeline">
              {data.activities.map(item => (
                <div className="journey-item" key={item.id}>
                  <div className={`journey-dot ${item.type.toLowerCase()}`}>
                    {getActivityIcon(item.type)}
                  </div>

                  <div className="journey-content-card">
                    <div className="journey-header">
                      <div className="journey-actor">
                        <span className="actor-avatar">
                          {item.user_name
                            ? item.user_name
                                .split(' ')
                                .map(w => w[0])
                                .slice(0, 2)
                                .join('')
                                .toUpperCase()
                            : 'SY'}
                        </span>
                        <div>
                          <strong>{item.user_name || 'System / Kiosk'}</strong>
                          {item.user_role && (
                            <span className="actor-role-badge">{roleLabel(item.user_role)}</span>
                          )}
                        </div>
                      </div>

                      <div className="journey-time">
                        <time>{fmtDateTime(item.created_at)}</time>
                      </div>
                    </div>

                    <div className="journey-action-tag">
                      <span className={`action-badge ${item.type.toLowerCase()}`}>
                        {activityLabel(item.type)}
                      </span>
                    </div>

                    <p className="journey-description">{item.content}</p>

                    {item.metadata?.diffs && Array.isArray(item.metadata.diffs) && (
                      <div className="journey-diffs">
                        {item.metadata.diffs.map((diff: string, i: number) => (
                          <span key={i} className="diff-chip">
                            {diff}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {data.activities.length === 0 && (
                <p className="muted padded">No journey activities recorded yet.</p>
              )}
            </div>
          </section>
        </div>

        <aside>
          <section
            className={`card next-card ${
              upcoming && new Date(upcoming.scheduled_at) < new Date() ? 'overdue' : ''
            }`}
          >
            <div className="card-head">
              <h3>
                {upcoming?.kind === 'SITE_VISIT' ? 'Upcoming Site Visit' : upcoming?.kind === 'OFFICE_VISIT' ? 'Upcoming Office Visit' : 'Upcoming Follow-up'}
              </h3>
            </div>
            {upcoming ? (
              <>
                <div className="next-date">
                  <CalendarDays />
                  <div>
                    <strong>{fmtDate(upcoming.scheduled_at)}</strong>
                    <span>
                      {new Intl.DateTimeFormat('en-IN', {
                        weekday: 'long',
                        hour: '2-digit',
                        minute: '2-digit'
                      }).format(new Date(upcoming.scheduled_at))}
                    </span>
                  </div>
                </div>
                <p>{upcoming.remark || 'No purpose added'}</p>
                {new Date(upcoming.scheduled_at) < new Date() && (
                  <span className="overdue-pill">OVERDUE</span>
                )}
                <button
                  className="primary full"
                  onClick={() =>
                    nav(
                      `/follow-ups?scope=${
                        new Date(upcoming.scheduled_at) < new Date() ? 'overdue' : 'today'
                      }`
                    )
                  }
                >
                  Open in Follow-ups Queue
                </button>
              </>
            ) : (
              <div className="empty">
                <CalendarPlus />
                <p>No pending reminder</p>
                <button className="secondary small" onClick={() => nav('/sales-pipeline')}>
                  Plan in Pipeline
                </button>
              </div>
            )}
          </section>

          <section className="card history-card">
            <div className="card-head">
              <h3>Reminder History</h3>
              <span>{data.followups.length}</span>
            </div>
            {data.followups.map(item => (
              <div className="history-row" key={item.id}>
                {item.status === 'COMPLETED' ? (
                  <CheckCircle2 className="complete" />
                ) : (
                  <CircleDot />
                )}
                <div>
                  <strong>{fmtDateTime(item.scheduled_at)}</strong>
                  <p>
                    {item.status === 'COMPLETED'
                      ? item.completion_remark || 'Completed'
                      : item.remark || 'Scheduled'}
                  </p>
                </div>
                <span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span>
              </div>
            ))}
            {data.followups.length === 0 && <p className="muted padded">No reminder history yet.</p>}
          </section>
        </aside>
      </div>
    </>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      {icon}
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </div>
  );
}

function workflowLabel(value: string) {
  return (
    ({
      NEW: 'New Lead',
      CONTACTED: 'Contacted',
      FOLLOW_UP: 'Follow-up',
      SITE_VISIT: 'Site Visit',
      OFFICE_VISIT: 'Office Visit',
      WON: 'Closed Won',
      LOST: 'Closed Lost'
    } as Record<string, string>)[value] || value
  );
}

function sourceLabel(value: string) {
  return (
    ({
      WALK_IN: 'Walk-in',
      WEBSITE: 'Website',
      CALLING: 'Calling',
      OTHER: 'Others'
    } as Record<string, string>)[value] || value
  );
}

function roleLabel(role: string) {
  return (
    ({
      ADMIN: 'Administrator',
      MANAGER: 'Manager',
      GRE_EXECUTIVE: 'GRE Executive',
      SALES_EXECUTIVE: 'Sales Executive'
    } as Record<string, string>)[role] || role
  );
}

function contactOutcomeLabel(value: string) {
  return (
    ({
      INTERESTED: 'Customer interested',
      CALL_LATER: 'Asked to call later',
      NO_RESPONSE: 'No response',
      SITE_VISIT_REQUESTED: 'Wants a site visit',
      NOT_INTERESTED: 'Not interested',
      WRONG_NUMBER: 'Wrong number',
      OTHER: 'Other'
    } as Record<string, string>)[value] || value
  );
}

function lostReasonLabel(value: string) {
  return (
    ({
      PRICE_ISSUE: 'Price issue',
      NOT_INTERESTED: 'Not interested',
      PURCHASED_ELSEWHERE: 'Purchased elsewhere',
      LOCATION_ISSUE: 'Location issue',
      BUDGET_ISSUE: 'Budget issue',
      NO_RESPONSE: 'No response',
      POSTPONED_PURCHASE: 'Postponed purchase',
      OTHER: 'Other'
    } as Record<string, string>)[value] || value
  );
}

function activityLabel(type: string) {
  return (
    ({
      CREATED: 'Lead Captured',
      REMARK: 'Remark Added',
      TYPE_CHANGED: 'Classification Updated',
      DETAILS_UPDATED: 'Lead Details Edited',
      STAGE_CHANGED: 'Pipeline Stage Changed',
      FOLLOWUP_SCHEDULED: 'Reminder Scheduled',
      FOLLOWUP_COMPLETED: 'Follow-up Completed',
      FOLLOWUP_RESCHEDULED: 'Reminder Rescheduled'
    } as Record<string, string>)[type] || type
  );
}

function getActivityIcon(type: string) {
  switch (type) {
    case 'CREATED':
      return <UserPlus size={16} />;
    case 'STAGE_CHANGED':
      return <ArrowRight size={16} />;
    case 'TYPE_CHANGED':
      return <Flame size={16} />;
    case 'DETAILS_UPDATED':
      return <Edit3 size={16} />;
    case 'FOLLOWUP_SCHEDULED':
      return <CalendarClock size={16} />;
    case 'FOLLOWUP_COMPLETED':
      return <CheckCircle2 size={16} />;
    case 'FOLLOWUP_RESCHEDULED':
      return <Clock3 size={16} />;
    case 'REMARK':
    default:
      return <MessageSquare size={16} />;
  }
}
