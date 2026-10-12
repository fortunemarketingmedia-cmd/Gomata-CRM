import type { Db } from './db.js';

export async function createDueNotifications(db: Db, userId?: number) {
  const setting = await db.query<{ value: string }>("SELECT value FROM settings WHERE key='reminder_minutes'");
  const reminder = Number(setting.rows[0]?.value || 15);
  const params: unknown[] = [new Date(Date.now() + reminder * 60000)];
  const userClause = userId ? ' AND f.assigned_to=$2' : '';
  if (userId) params.push(userId);
  await db.query(`INSERT INTO notifications(user_id,followup_id,title,message,notification_type,action_url)
    SELECT f.assigned_to,f.id,CASE WHEN f.kind='SITE_VISIT' THEN 'Site Visit Reminder' WHEN f.kind='OFFICE_VISIT' THEN 'Office Visit Reminder' ELSE 'Follow-up Reminder' END,l.name || ' • ' || l.contact || CASE WHEN f.kind='SITE_VISIT' THEN ' • Site visit due' WHEN f.kind='OFFICE_VISIT' THEN ' • Office visit due' ELSE ' • Follow-up due' END,'FOLLOWUP','/gre/'||l.id
    FROM followups f JOIN leads l ON l.id=f.lead_id
    WHERE f.status='PENDING' AND f.scheduled_at<=$1 ${userClause}
    ON CONFLICT(user_id,followup_id) DO NOTHING`, params);

  const leadParams:unknown[]=[];
  const leadUserClause=userId?' AND l.assigned_to=$1':'';
  if(userId)leadParams.push(userId);
  await db.query(`INSERT INTO notifications(user_id,title,message,notification_type,action_url)
    SELECT l.assigned_to,'Lead response SLA overdue',l.name || ' • ' || l.contact || ' • No first contact recorded','SLA','/gre/'||l.id
    FROM leads l WHERE l.archived_at IS NULL AND l.first_contacted_at IS NULL AND l.response_sla_due_at IS NOT NULL AND l.response_sla_due_at<=CURRENT_TIMESTAMP${leadUserClause}
    ON CONFLICT DO NOTHING`,leadParams);
  await db.query(`UPDATE leads l SET response_sla_alerted_at=COALESCE(response_sla_alerted_at,CURRENT_TIMESTAMP)
    WHERE l.archived_at IS NULL AND l.first_contacted_at IS NULL AND l.response_sla_due_at<=CURRENT_TIMESTAMP${leadUserClause}`,leadParams);

  const paymentParams:unknown[]=[];
  const paymentUserClause=userId?' AND l.assigned_to=$1':'';
  if(userId)paymentParams.push(userId);
  await db.query(`INSERT INTO notifications(user_id,title,message,notification_type,action_url)
    SELECT l.assigned_to,'Payment milestone due',b.customer_name || ' • ' || p.name || ' / ' || pl.plot_number || ' • ' || s.label,'PAYMENT_DUE','/inventory/bookings/'||b.id||'?step='||s.id
    FROM booking_steps s JOIN plot_bookings b ON b.id=s.booking_id JOIN plots pl ON pl.id=b.plot_id JOIN realestate_projects p ON p.id=pl.project_id JOIN leads l ON l.id=b.lead_id
    WHERE s.status='PENDING' AND s.due_date IS NOT NULL AND s.due_date<=CURRENT_DATE+7 AND b.status<>'CANCELLED'${paymentUserClause}
    ON CONFLICT DO NOTHING`,paymentParams);
}
