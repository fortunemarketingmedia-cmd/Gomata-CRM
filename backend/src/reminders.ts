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
}
