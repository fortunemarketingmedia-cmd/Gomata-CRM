import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarClock, CircleCheck, GripVertical, Info, MapPin, Phone, Plus, Search, X } from '../icons';
import { api, fmtDateTime, toLocalInput } from '../lib/api';
import type { Lead, LeadSource, LeadType, User, WorkflowStatus } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { LeadFormModal } from '../components/LeadFormModal';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';

type BoardStage = WorkflowStatus | 'CLOSED';
const stages: Array<{id:BoardStage;label:string;hint:string}> = [
  {id:'NEW',label:'New Lead',hint:'Captured and awaiting first contact'},
  {id:'CONTACTED',label:'Contacted',hint:'Contact outcome has been recorded'},
  {id:'QUALIFIED',label:'Qualified',hint:'Budget and requirement are confirmed'},
  {id:'FOLLOW_UP',label:'Follow-up',hint:'Next conversation is scheduled'},
  {id:'SITE_VISIT',label:'Site Visit',hint:'Project visit is scheduled'},
  {id:'SITE_VISIT_COMPLETED',label:'Visit Done',hint:'Visit feedback is recorded'},
  {id:'NEGOTIATION',label:'Negotiation',hint:'Commercial terms are in discussion'},
  {id:'BOOKING_PENDING',label:'Booking Pending',hint:'Token or documents are awaited'},
  {id:'CLOSED',label:'Closed',hint:'Won and lost outcomes'}
];
const labels:Record<WorkflowStatus,string>={NEW:'New Lead',CONTACTED:'Contacted',QUALIFIED:'Qualified',FOLLOW_UP:'Follow-up',SITE_VISIT:'Site Visit',SITE_VISIT_COMPLETED:'Visit Completed',OFFICE_VISIT:'Office Visit',NEGOTIATION:'Negotiation',BOOKING_PENDING:'Booking Pending',WON:'Closed Won',LOST:'Closed Lost'};
const allowed:Record<WorkflowStatus,WorkflowStatus[]>={NEW:['CONTACTED','LOST'],CONTACTED:['QUALIFIED','FOLLOW_UP','LOST'],QUALIFIED:['FOLLOW_UP','SITE_VISIT','NEGOTIATION','LOST'],FOLLOW_UP:['FOLLOW_UP','QUALIFIED','SITE_VISIT','NEGOTIATION','LOST'],SITE_VISIT:['SITE_VISIT','SITE_VISIT_COMPLETED','FOLLOW_UP','LOST'],SITE_VISIT_COMPLETED:['NEGOTIATION','FOLLOW_UP','LOST'],OFFICE_VISIT:['FOLLOW_UP','NEGOTIATION','LOST'],NEGOTIATION:['BOOKING_PENDING','FOLLOW_UP','LOST'],BOOKING_PENDING:['WON','NEGOTIATION','LOST'],WON:['CONTACTED'],LOST:['CONTACTED']};
const canDrop=(from:WorkflowStatus,to:BoardStage)=>to==='CLOSED'?allowed[from].includes('WON'):allowed[from].includes(to);

export function SalesPipelinePage(){
  const[leads,setLeads]=useState<Lead[]>([]);const[users,setUsers]=useState<User[]>([]);const[search,setSearch]=useState('');const[type,setType]=useState('');const[source,setSource]=useState<LeadSource|''>('');const[assigned,setAssigned]=useState('');const[followup,setFollowup]=useState('');const[dragging,setDragging]=useState<Lead|null>(null);const[move,setMove]=useState<{lead:Lead;to?:WorkflowStatus}|null>(null);const[showRules,setShowRules]=useState(false);const[loading,setLoading]=useState(true);const[add,setAdd]=useState(false);const toast=useToast();const nav=useNavigate();const{user}=useAuth();
  const load=()=>api<{leads:Lead[]}>('/pipeline').then(result=>setLeads(result.leads)).finally(()=>setLoading(false));useEffect(()=>{void load();void api<{users:User[]}>('/users/assignees').then(result=>setUsers(result.users))},[]);
  const filtered=useMemo(()=>leads.filter(lead=>(!type||lead.lead_type===type)&&(!source||lead.lead_source===source)&&(!assigned||String(lead.assigned_to)===assigned)&&(!followup||(followup==='none'?!lead.next_followup:followup==='overdue'?Boolean(lead.next_followup&&new Date(lead.next_followup)<new Date()):Boolean(lead.next_followup&&new Date(lead.next_followup)>=new Date())))&&(!search||`${lead.name} ${lead.contact} ${lead.reference_name||''} ${lead.assigned_name||''}`.toLowerCase().includes(search.toLowerCase()))),[leads,search,type,source,assigned,followup]);
  const drop=(to:BoardStage)=>{if(!dragging)return;const lead=dragging;setDragging(null);if(!canDrop(lead.workflow_status,to)){toast.show(`Cannot move directly from ${labels[lead.workflow_status]} to ${to==='CLOSED'?'Closed':labels[to]}`,'error');return}setMove({lead,to:to==='CLOSED'?'WON':to})};
  return <><div className="page-heading pipeline-heading"><div><span className="eyebrow">GRE SALES PROCESS</span><h1>Sales Pipeline</h1><p>New → Contacted → Qualified → Follow-up → Site Visit → Negotiation → Booking Pending → Closed Won</p></div><div className="page-actions"><button className="secondary" onClick={()=>setShowRules(!showRules)}><Info/>{showRules?'Hide rules':'Pipeline rules'}</button><button className="primary" onClick={()=>setAdd(true)}><Plus/>Add New Lead</button></div></div>
    {showRules&&<section className="card pipeline-rules"><strong>Strict workflow controls</strong><div><span><CircleCheck/>Every stage movement requires a remark</span><span><CircleCheck/>Contacted requires the contact outcome</span><span><CircleCheck/>Follow-up requires a future reminder time</span><span><CircleCheck/>Site and Office Visits require a reminder time</span><span><CircleCheck/>Closed Won follows a completed visit</span><span><CircleCheck/>The Closed column combines Won and Lost; Lost requires a reason</span></div></section>}
    <div className="pipeline-toolbar expanded"><div className="searchbox"><Search/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search customer, contact, reference or executive…"/></div><select value={type} onChange={event=>setType(event.target.value)} aria-label="Filter by classification"><option value="">All classifications</option><option value="HOT">Hot</option><option value="WARM">Warm</option><option value="COLD">Cold</option></select><select value={source} onChange={event=>setSource(event.target.value as LeadSource|'')} aria-label="Filter by lead source"><option value="">All sources</option><option value="WALK_IN">Walk-in</option><option value="WEBSITE">Website</option><option value="CALLING">Calling</option><option value="OTHER">Others</option></select><select value={assigned} onChange={event=>setAssigned(event.target.value)} aria-label="Filter by assigned executive"><option value="">All executives</option>{users.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={followup} onChange={event=>setFollowup(event.target.value)} aria-label="Filter by next action"><option value="">Any next action</option><option value="upcoming">Upcoming</option><option value="overdue">Overdue</option><option value="none">Not scheduled</option></select><button className="clear-filters" onClick={()=>{setSearch('');setType('');setSource('');setAssigned('');setFollowup('')}}>Clear</button><span>{filtered.length} lead{filtered.length===1?'':'s'}</span></div>
    {dragging&&<div className="pipeline-drag-guide"><strong>Valid next stages for {dragging.name}:</strong> {stages.filter(stage=>canDrop(dragging.workflow_status,stage.id)).map(stage=>stage.label).join(' · ')||'Use Move / reschedule to select an outcome'}</div>}
    <section className={`pipeline-board ${dragging?'is-dragging':''}`}>{stages.map(stage=>{const valid=Boolean(dragging&&canDrop(dragging.workflow_status,stage.id));const invalid=Boolean(dragging&&!valid);const items=filtered.filter(lead=>stage.id==='CLOSED'?lead.workflow_status==='WON'||lead.workflow_status==='LOST':lead.workflow_status===stage.id);return <div aria-disabled={invalid} className={`pipeline-column stage-${stage.id.toLowerCase()} ${valid?'valid-drop':''} ${invalid?'invalid-drop':''}`} key={stage.id} onDragOver={event=>{if(valid)event.preventDefault()}} onDrop={event=>{event.preventDefault();if(valid)drop(stage.id)}}><header><div><strong>{stage.label}</strong><small>{invalid?'Not allowed from this stage':stage.hint}</small></div><b>{items.length}</b></header><div className="pipeline-card-list">{items.map(lead=><article className="pipeline-lead-card" key={lead.id} draggable tabIndex={0} role="button" aria-label={`Open ${lead.name} lead details`} onClick={()=>nav(`/gre/${lead.id}`)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' ')nav(`/gre/${lead.id}`)}} onDragStart={event=>{event.dataTransfer.effectAllowed='move';setDragging(lead)}} onDragEnd={()=>setDragging(null)}><div className="pipeline-card-head"><strong>{lead.name}</strong><GripVertical/></div><span className="pipeline-contact"><Phone/>{lead.contact}</span><div className="pipeline-card-meta"><StatusBadge type={lead.lead_type}/><span>{stage.id==='CLOSED'?labels[lead.workflow_status]:lead.assigned_name||'Unassigned'}</span></div>{lead.next_followup&&<div className="pipeline-next"><CalendarClock/><span><small>{lead.workflow_status==='SITE_VISIT'?'Site visit reminder':lead.workflow_status==='OFFICE_VISIT'?'Office visit reminder':'Follow-up reminder'}</small><strong>{fmtDateTime(lead.next_followup)}</strong></span></div>}{lead.project_name&&lead.workflow_status==='SITE_VISIT'&&<span className="pipeline-project"><MapPin/>{lead.project_name}</span>}<p>{lead.latest_remark||'No activity remark yet'}</p>{lead.workflow_status==='WON'&&<button className="pipeline-move-button won-action" onClick={event=>{event.stopPropagation();nav('/inventory?leadId='+lead.id)}}>Allocate plot & onboard <ArrowRight/></button>}<button className="pipeline-move-button" onClick={event=>{event.stopPropagation();setMove({lead})}}>{lead.workflow_status==='WON'?'Reopen lead':'Move / reschedule'} <ArrowRight/></button></article>)}{!items.length&&<div className="pipeline-empty">{loading?'Loading…':valid?'Drop lead here':'No leads'}</div>}</div></div>})}</section>
    {move&&<MoveLeadModal lead={move.lead} initialTarget={move.to} onClose={()=>setMove(null)} onDone={()=>{setMove(null);void load()}}/>}{add&&user&&<LeadFormModal user={user} onClose={()=>setAdd(false)} onSaved={lead=>{setAdd(false);void load();nav(`/gre/${lead.id}`)}}/>}
  </>;
}

function MoveLeadModal({lead,initialTarget,onClose,onDone}:{lead:Lead;initialTarget?:WorkflowStatus;onClose:()=>void;onDone:()=>void}){
  const destinations=allowed[lead.workflow_status];
  const[target,setTarget]=useState<WorkflowStatus>(initialTarget||destinations[0]);
  const[leadClassification,setLeadClassification]=useState<LeadType>(lead.lead_type||'WARM');
  const[remark,setRemark]=useState('');
  const[outcome,setOutcome]=useState('');
  const[scheduledAt,setScheduledAt]=useState(toLocalInput(new Date(Date.now()+3600000)));
  const[projectName,setProjectName]=useState(lead.project_name||'');
  const[reason,setReason]=useState('');
  const[reasonDetail,setReasonDetail]=useState('');
  const[busy,setBusy]=useState(false);
  const toast=useToast();

  const scheduled=target==='FOLLOW_UP'||target==='SITE_VISIT'||target==='OFFICE_VISIT';
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();
    setBusy(true);
    try{
      await api(`/leads/${lead.id}/pipeline-transition`,{
        method:'POST',
        body:JSON.stringify({
          toStage:target,
          remark,
          contactOutcome:target==='CONTACTED'?outcome:undefined,
          leadType:target==='CONTACTED'?leadClassification:undefined,
          scheduledAt:scheduled?new Date(scheduledAt).toISOString():undefined,
          projectName:target==='SITE_VISIT'?projectName:undefined,
          lostReason:target==='LOST'?reason:undefined,
          lostReasonDetail:target==='LOST'&&reason==='OTHER'?reasonDetail:undefined
        })
      });
      toast.show(`${lead.name} moved to ${labels[target]}`);
      onDone();
    }catch(error:any){
      toast.show(error.message,'error');
    }finally{
      setBusy(false);
    }
  };

  return <div className="modal-layer" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}>
    <div className="modal pipeline-move-modal">
      <div className="modal-head">
        <div>
          <span className="eyebrow">PIPELINE MOVEMENT</span>
          <h2>{lead.name}</h2>
          <p>{labels[lead.workflow_status]} <ArrowRight/> {labels[target]}</p>
        </div>
        <button className="icon-button" onClick={onClose}><X/></button>
      </div>
      <form onSubmit={submit}>
        <label>Move to
          <select value={target} onChange={event=>setTarget(event.target.value as WorkflowStatus)}>
            {destinations.map(stage=><option value={stage} key={stage}>{stage===lead.workflow_status?`Reschedule ${labels[stage]}`:labels[stage]}</option>)}
          </select>
        </label>

        {target==='CONTACTED'&&<>
          <label>Contact outcome *
            <select value={outcome} onChange={event=>setOutcome(event.target.value)} required>
              <option value="">Choose outcome</option>
              <option value="INTERESTED">Customer interested</option>
              <option value="CALL_LATER">Asked to call later</option>
              <option value="NO_RESPONSE">No response</option>
              <option value="SITE_VISIT_REQUESTED">Wants a site visit</option>
              <option value="NOT_INTERESTED">Not interested</option>
              <option value="WRONG_NUMBER">Wrong number</option>
              <option value="OTHER">Other</option>
            </select>
          </label>

          <fieldset>
            <legend>Lead classification *</legend>
            <div className="type-picker compact">
              {(['HOT', 'WARM', 'COLD'] as LeadType[]).map(type => (
                <label key={type} className={leadClassification === type ? 'selected' : ''}>
                  <input
                    type="radio"
                    name="pipelineClassification"
                    checked={leadClassification === type}
                    onChange={() => setLeadClassification(type)}
                  />
                  <i className={type.toLowerCase()} />
                  <span>
                    <strong>{type[0] + type.slice(1).toLowerCase()}</strong>
                    <small>
                      {type === 'HOT'
                        ? 'Ready to proceed soon'
                        : type === 'WARM'
                          ? 'Interested; needs follow-up'
                          : 'Long-term / low interest'}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </>}

        {scheduled&&<label>{target==='SITE_VISIT'?'Site visit':target==='OFFICE_VISIT'?'Office visit':'Follow-up'} date & time *<input type="datetime-local" value={scheduledAt} min={toLocalInput()} onChange={event=>setScheduledAt(event.target.value)} required/><small>A CRM notification will be created when this reminder becomes due.</small></label>}
        {target==='SITE_VISIT'&&<label>Project / site *<input value={projectName} onChange={event=>setProjectName(event.target.value)} placeholder="Project name or site" required/></label>}
        {target==='LOST'&&<><label>Lost reason *<select value={reason} onChange={event=>setReason(event.target.value)} required><option value="">Choose reason</option><option value="PRICE_ISSUE">Price issue</option><option value="NOT_INTERESTED">Not interested</option><option value="PURCHASED_ELSEWHERE">Purchased elsewhere</option><option value="LOCATION_ISSUE">Location issue</option><option value="BUDGET_ISSUE">Budget issue</option><option value="NO_RESPONSE">No response</option><option value="POSTPONED_PURCHASE">Postponed purchase</option><option value="OTHER">Other</option></select></label>{reason==='OTHER'&&<label>Other reason *<input value={reasonDetail} onChange={event=>setReasonDetail(event.target.value)} required/></label>}</>}
        <label>{target==='WON'?'Final conversion remark *':target==='LOST'?'Closing remark *':'Stage remark *'}<textarea rows={3} value={remark} onChange={event=>setRemark(event.target.value)} placeholder={target==='CONTACTED'?'Record what happened during contact':target==='FOLLOW_UP'?'Record the purpose of the scheduled follow-up':target==='SITE_VISIT'?'Record the agreed site visit details':target==='OFFICE_VISIT'?'Record the agreed office visit details':target==='WON'?'Booking, token or deal confirmation details':target==='LOST'?'Record the final conversation and context':'Record the customer interaction'} required/></label>
        <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy?'Saving…':target===lead.workflow_status?'Save reschedule':`Move to ${labels[target]}`}</button></div>
      </form>
    </div>
  </div>;
}
