import bcrypt from 'bcryptjs';
import pg from 'pg';
import type { Pool as PgPool, PoolClient, QueryResult, QueryResultRow } from 'pg';

const { Pool, types } = pg;

types.setTypeParser(20, value => Number(value));

export interface Db {
  query<R extends QueryResultRow = any>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

export async function openDatabase(): Promise<PgPool> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required. Add your PostgreSQL connection string to .env.');
  }

  return new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_SIZE || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl:
      process.env.DATABASE_SSL === 'true'
        ? {
            rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false'
          }
        : undefined
  });
}

export async function migrate(db: Db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      phone VARCHAR(20) NOT NULL DEFAULT '',
      role VARCHAR(20) NOT NULL DEFAULT 'ADMIN' CHECK(role IN ('ADMIN','MANAGER','GRE_EXECUTIVE','SALES_EXECUTIVE')),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS leads (
      id BIGSERIAL PRIMARY KEY,
      serial_no BIGSERIAL UNIQUE NOT NULL,
      enquiry_date DATE NOT NULL,
      enquiry_time TIME NOT NULL,
      name VARCHAR(100) NOT NULL,
      address VARCHAR(500) NOT NULL DEFAULT '',
      contact VARCHAR(16) NOT NULL UNIQUE,
      reference_name VARCHAR(150) NOT NULL DEFAULT '',
      lead_type VARCHAR(4) NOT NULL CHECK(lead_type IN ('HOT','WARM','COLD')),
      lead_source VARCHAR(30) NOT NULL DEFAULT 'WALK_IN' CHECK(lead_source IN ('WALK_IN','WEBSITE','CALLING','OTHER')),
      workflow_status VARCHAR(30) NOT NULL DEFAULT 'NEW' CHECK(workflow_status IN ('NEW','CONTACTED','FOLLOW_UP','SITE_VISIT','OFFICE_VISIT','WON','LOST')),
      status VARCHAR(9) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CONVERTED','INACTIVE')),
      created_by BIGINT NOT NULL REFERENCES users(id),
      assigned_to BIGINT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      archived_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS lead_activities (
      id BIGSERIAL PRIMARY KEY,
      lead_id BIGINT NOT NULL REFERENCES leads(id),
      user_id BIGINT NOT NULL REFERENCES users(id),
      type VARCHAR(32) NOT NULL CHECK(type IN ('CREATED','REMARK','TYPE_CHANGED','DETAILS_UPDATED','STAGE_CHANGED','FOLLOWUP_SCHEDULED','FOLLOWUP_COMPLETED','FOLLOWUP_RESCHEDULED')),
      content VARCHAR(1000) NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS followups (
      id BIGSERIAL PRIMARY KEY,
      lead_id BIGINT NOT NULL REFERENCES leads(id),
      assigned_to BIGINT NOT NULL REFERENCES users(id),
      scheduled_at TIMESTAMPTZ NOT NULL,
      remark VARCHAR(1000) NOT NULL DEFAULT '',
      kind VARCHAR(20) NOT NULL DEFAULT 'FOLLOW_UP' CHECK(kind IN ('FOLLOW_UP','SITE_VISIT','OFFICE_VISIT')),
      status VARCHAR(9) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','COMPLETED','CANCELLED')),
      completed_at TIMESTAMPTZ,
      completion_remark VARCHAR(1000) NOT NULL DEFAULT '',
      created_by BIGINT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id),
      followup_id BIGINT REFERENCES followups(id),
      title VARCHAR(100) NOT NULL,
      message VARCHAR(500) NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, followup_id)
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id BIGSERIAL PRIMARY KEY,
      title VARCHAR(180) NOT NULL,
      description VARCHAR(1500) NOT NULL DEFAULT '',
      event_type VARCHAR(20) NOT NULL CHECK(event_type IN ('TASK','MEETING','GENERAL')),
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ,
      all_day BOOLEAN NOT NULL DEFAULT FALSE,
      assigned_to BIGINT NOT NULL REFERENCES users(id),
      lead_id BIGINT REFERENCES leads(id) ON DELETE SET NULL,
      location VARCHAR(250) NOT NULL DEFAULT '',
      priority VARCHAR(10) NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('LOW','MEDIUM','HIGH','URGENT')),
      status VARCHAR(12) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','IN_PROGRESS','COMPLETED','CANCELLED')),
      reminder_minutes INTEGER NOT NULL DEFAULT 15 CHECK(reminder_minutes BETWEEN 0 AND 10080),
      created_by BIGINT NOT NULL REFERENCES users(id),
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS realestate_projects (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(180) NOT NULL UNIQUE,
      location VARCHAR(300) NOT NULL DEFAULT '',
      description VARCHAR(1500) NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by BIGINT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS plots (
      id BIGSERIAL PRIMARY KEY,
      project_id BIGINT NOT NULL REFERENCES realestate_projects(id) ON DELETE CASCADE,
      plot_number VARCHAR(80) NOT NULL,
      area NUMERIC(14,2) NOT NULL CHECK(area > 0),
      area_unit VARCHAR(20) NOT NULL DEFAULT 'SQ_FT',
      facing VARCHAR(40) NOT NULL DEFAULT '',
      base_price NUMERIC(16,2) NOT NULL CHECK(base_price >= 0),
      minimum_token NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK(minimum_token >= 0),
      max_investors INTEGER NOT NULL DEFAULT 1 CHECK(max_investors BETWEEN 1 AND 100),
      status VARCHAR(15) NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE','PARTIAL','RESERVED','SOLD','BLOCKED')),
      notes VARCHAR(1500) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, plot_number)
    );

    CREATE TABLE IF NOT EXISTS plot_bookings (
      id BIGSERIAL PRIMARY KEY,
      plot_id BIGINT NOT NULL REFERENCES plots(id),
      lead_id BIGINT NOT NULL REFERENCES leads(id),
      customer_name VARCHAR(150) NOT NULL,
      customer_contact VARCHAR(20) NOT NULL,
      quoted_price NUMERIC(16,2) NOT NULL CHECK(quoted_price >= 0),
      token_amount NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK(token_amount >= 0),
      booking_date DATE NOT NULL DEFAULT CURRENT_DATE,
      status VARCHAR(16) NOT NULL DEFAULT 'TOKEN_PENDING' CHECK(status IN ('TOKEN_PENDING','ACTIVE','COMPLETED','CANCELLED')),
      notes VARCHAR(1500) NOT NULL DEFAULT '',
      created_by BIGINT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(plot_id, lead_id)
    );

    CREATE TABLE IF NOT EXISTS booking_steps (
      id BIGSERIAL PRIMARY KEY,
      booking_id BIGINT NOT NULL REFERENCES plot_bookings(id) ON DELETE CASCADE,
      step_key VARCHAR(40) NOT NULL,
      label VARCHAR(120) NOT NULL,
      sequence INTEGER NOT NULL,
      target_amount NUMERIC(16,2),
      due_date DATE,
      status VARCHAR(12) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','COMPLETED','SKIPPED')),
      completed_at TIMESTAMPTZ,
      notes VARCHAR(800) NOT NULL DEFAULT '',
      UNIQUE(booking_id, step_key)
    );

    CREATE TABLE IF NOT EXISTS booking_payments (
      id BIGSERIAL PRIMARY KEY,
      booking_id BIGINT NOT NULL REFERENCES plot_bookings(id) ON DELETE CASCADE,
      step_id BIGINT REFERENCES booking_steps(id) ON DELETE SET NULL,
      amount NUMERIC(16,2) NOT NULL CHECK(amount > 0),
      paid_at DATE NOT NULL,
      mode VARCHAR(30) NOT NULL,
      reference VARCHAR(120) NOT NULL DEFAULT '',
      notes VARCHAR(500) NOT NULL DEFAULT '',
      received_by BIGINT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS booking_documents (
      id BIGSERIAL PRIMARY KEY,
      booking_id BIGINT NOT NULL REFERENCES plot_bookings(id) ON DELETE CASCADE,
      document_type VARCHAR(60) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      file_size INTEGER NOT NULL CHECK(file_size > 0 AND file_size <= 5242880),
      file_data BYTEA NOT NULL,
      uploaded_by BIGINT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lead_documents (
      id BIGSERIAL PRIMARY KEY,
      lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      document_type VARCHAR(60) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      file_size INTEGER NOT NULL CHECK(file_size > 0 AND file_size <= 5242880),
      file_data BYTEA NOT NULL,
      uploaded_by BIGINT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      platform VARCHAR(30) NOT NULL CHECK(platform IN ('META','INSTAGRAM','FACEBOOK','WHATSAPP','GOOGLE','WEBSITE','LANDING_PAGE','CHANNEL_PARTNER','REFERRAL','MANUAL','OTHER')),
      project_id BIGINT REFERENCES realestate_projects(id) ON DELETE SET NULL,
      start_date DATE,
      end_date DATE,
      budget NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK(budget>=0),
      status VARCHAR(12) NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','PAUSED','COMPLETED','ARCHIVED')),
      description VARCHAR(1500) NOT NULL DEFAULT '',
      created_by BIGINT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS channel_partners (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      company VARCHAR(180) NOT NULL DEFAULT '',
      phone VARCHAR(16) NOT NULL UNIQUE,
      email VARCHAR(255),
      city VARCHAR(100) NOT NULL DEFAULT '',
      commission_type VARCHAR(15) NOT NULL DEFAULT 'PERCENT' CHECK(commission_type IN ('PERCENT','FIXED')),
      commission_value NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK(commission_value>=0),
      status VARCHAR(12) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE','BLOCKED')),
      notes VARCHAR(1200) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS channel_partner_projects (
      partner_id BIGINT NOT NULL REFERENCES channel_partners(id) ON DELETE CASCADE,
      project_id BIGINT NOT NULL REFERENCES realestate_projects(id) ON DELETE CASCADE,
      PRIMARY KEY(partner_id,project_id)
    );

    CREATE TABLE IF NOT EXISTS channel_partner_documents (
      id BIGSERIAL PRIMARY KEY,
      partner_id BIGINT NOT NULL REFERENCES channel_partners(id) ON DELETE CASCADE,
      document_type VARCHAR(60) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      file_size INTEGER NOT NULL CHECK(file_size > 0 AND file_size <= 5242880),
      file_data BYTEA NOT NULL,
      uploaded_by BIGINT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lead_enquiries (
      id BIGSERIAL PRIMARY KEY,
      lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      platform VARCHAR(30) NOT NULL,
      campaign_id BIGINT REFERENCES campaigns(id) ON DELETE SET NULL,
      campaign_name VARCHAR(180) NOT NULL DEFAULT '',
      ad_name VARCHAR(180) NOT NULL DEFAULT '',
      form_name VARCHAR(180) NOT NULL DEFAULT '',
      external_lead_id VARCHAR(180),
      landing_page_url VARCHAR(600) NOT NULL DEFAULT '',
      utm_source VARCHAR(180) NOT NULL DEFAULT '',
      utm_medium VARCHAR(180) NOT NULL DEFAULT '',
      utm_campaign VARCHAR(180) NOT NULL DEFAULT '',
      utm_content VARCHAR(180) NOT NULL DEFAULT '',
      raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS integration_accounts (
      id BIGSERIAL PRIMARY KEY,
      provider VARCHAR(30) NOT NULL UNIQUE,
      display_name VARCHAR(120) NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      status VARCHAR(15) NOT NULL DEFAULT 'DISCONNECTED' CHECK(status IN ('DISCONNECTED','CONNECTED','ERROR')),
      webhook_secret_hash TEXT,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      last_event_at TIMESTAMPTZ,
      last_error VARCHAR(500),
      updated_by BIGINT REFERENCES users(id),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id BIGSERIAL PRIMARY KEY,
      provider VARCHAR(30) NOT NULL,
      external_event_id VARCHAR(200),
      event_type VARCHAR(80) NOT NULL DEFAULT 'LEAD',
      status VARCHAR(15) NOT NULL DEFAULT 'RECEIVED' CHECK(status IN ('RECEIVED','PROCESSED','DUPLICATE','FAILED')),
      payload JSONB NOT NULL,
      error VARCHAR(500),
      received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMPTZ,
      UNIQUE(provider,external_event_id)
    );

    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id BIGSERIAL PRIMARY KEY,
      lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      whatsapp_message_id VARCHAR(180) UNIQUE,
      direction VARCHAR(10) NOT NULL CHECK(direction IN ('INCOMING','OUTGOING')),
      message TEXT NOT NULL DEFAULT '',
      media_url VARCHAR(600),
      media_type VARCHAR(80),
      delivery_status VARCHAR(15) NOT NULL DEFAULT 'RECEIVED' CHECK(delivery_status IN ('QUEUED','SENT','DELIVERED','READ','FAILED','RECEIVED')),
      sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS site_visits (
      id BIGSERIAL PRIMARY KEY,
      lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      project_id BIGINT REFERENCES realestate_projects(id) ON DELETE SET NULL,
      plot_id BIGINT REFERENCES plots(id) ON DELETE SET NULL,
      scheduled_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(15) NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','CONFIRMED','COMPLETED','CANCELLED','NO_SHOW','RESCHEDULED')),
      notes VARCHAR(1200) NOT NULL DEFAULT '',
      feedback VARCHAR(1200) NOT NULL DEFAULT '',
      customer_interest VARCHAR(15) CHECK(customer_interest IN ('HIGH','MEDIUM','LOW','NONE')),
      next_action VARCHAR(500) NOT NULL DEFAULT '',
      created_by BIGINT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS commissions (
      id BIGSERIAL PRIMARY KEY,
      partner_id BIGINT NOT NULL REFERENCES channel_partners(id),
      booking_id BIGINT NOT NULL REFERENCES plot_bookings(id) ON DELETE CASCADE,
      amount NUMERIC(16,2) NOT NULL CHECK(amount>=0),
      status VARCHAR(12) NOT NULL DEFAULT 'GENERATED' CHECK(status IN ('GENERATED','APPROVED','PAID','CANCELLED')),
      paid_at DATE,
      reference VARCHAR(120) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(partner_id,booking_id)
    );

    CREATE TABLE IF NOT EXISTS project_sales_assignments (
      project_id BIGINT NOT NULL REFERENCES realestate_projects(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      priority INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(project_id,user_id)
    );

    CREATE TABLE IF NOT EXISTS payment_plans (
      id BIGSERIAL PRIMARY KEY,
      project_id BIGINT NOT NULL REFERENCES realestate_projects(id) ON DELETE CASCADE,
      name VARCHAR(150) NOT NULL,
      description VARCHAR(800) NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by BIGINT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id,name)
    );

    CREATE TABLE IF NOT EXISTS payment_plan_milestones (
      id BIGSERIAL PRIMARY KEY,
      payment_plan_id BIGINT NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,
      label VARCHAR(120) NOT NULL,
      percentage NUMERIC(6,3) NOT NULL CHECK(percentage > 0 AND percentage <= 100),
      due_days INTEGER NOT NULL DEFAULT 0 CHECK(due_days BETWEEN 0 AND 3650),
      sequence INTEGER NOT NULL,
      UNIQUE(payment_plan_id,sequence)
    );

    CREATE TABLE IF NOT EXISTS plot_holds (
      id BIGSERIAL PRIMARY KEY,
      plot_id BIGINT NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
      lead_id BIGINT REFERENCES leads(id) ON DELETE SET NULL,
      held_until TIMESTAMPTZ NOT NULL,
      reason VARCHAR(500) NOT NULL DEFAULT '',
      status VARCHAR(12) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','RELEASED','EXPIRED','CONVERTED')),
      created_by BIGINT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      released_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS commission_slabs (
      id BIGSERIAL PRIMARY KEY,
      partner_id BIGINT NOT NULL REFERENCES channel_partners(id) ON DELETE CASCADE,
      min_bookings INTEGER NOT NULL CHECK(min_bookings > 0),
      max_bookings INTEGER CHECK(max_bookings IS NULL OR max_bookings >= min_bookings),
      commission_type VARCHAR(15) NOT NULL CHECK(commission_type IN ('PERCENT','FIXED')),
      commission_value NUMERIC(16,2) NOT NULL CHECK(commission_value >= 0),
      UNIQUE(partner_id,min_bookings)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_by BIGINT REFERENCES users(id),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_reset_requests (
      id BIGSERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ip_address VARCHAR(64) NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT REFERENCES users(id),
      action VARCHAR(60) NOT NULL,
      entity_type VARCHAR(30) NOT NULL,
      entity_id BIGINT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'ADMIN';
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_source VARCHAR(30) NOT NULL DEFAULT 'WALK_IN';
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS workflow_status VARCHAR(20) NOT NULL DEFAULT 'NEW';
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS reference_name VARCHAR(150) NOT NULL DEFAULT '';
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_outcome VARCHAR(40);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS lost_reason VARCHAR(40);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS lost_reason_detail VARCHAR(250);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS project_name VARCHAR(150);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS site_visit_at TIMESTAMPTZ;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS office_visit_at TIMESTAMPTZ;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE followups ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'FOLLOW_UP';

    ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_lead_source_check;
    UPDATE leads SET lead_source='OTHER' WHERE lead_source NOT IN ('WALK_IN','WEBSITE','CALLING','OTHER');
    ALTER TABLE leads ADD CONSTRAINT leads_lead_source_check CHECK(lead_source IN ('WALK_IN','WEBSITE','CALLING','OTHER'));

    CREATE INDEX IF NOT EXISTS idx_leads_date ON leads(enquiry_date);
    CREATE INDEX IF NOT EXISTS idx_leads_type ON leads(lead_type);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(lead_source);
    CREATE INDEX IF NOT EXISTS idx_leads_workflow ON leads(workflow_status);
    CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_leads_reference ON leads(reference_name);
    CREATE INDEX IF NOT EXISTS idx_followups_scheduled ON followups(scheduled_at, status);
    CREATE INDEX IF NOT EXISTS idx_activities_lead ON lead_activities(lead_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_calendar_range ON calendar_events(starts_at, status);
    CREATE INDEX IF NOT EXISTS idx_calendar_assignee ON calendar_events(assigned_to, starts_at);
    CREATE INDEX IF NOT EXISTS idx_plots_project ON plots(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_bookings_plot ON plot_bookings(plot_id, status);
    CREATE INDEX IF NOT EXISTS idx_bookings_lead ON plot_bookings(lead_id);
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_id BIGINT REFERENCES calendar_events(id) ON DELETE CASCADE;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS notification_type VARCHAR(30) NOT NULL DEFAULT 'FOLLOWUP';
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url VARCHAR(300);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS alternate_phone VARCHAR(16);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS email VARCHAR(255);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS city VARCHAR(100) NOT NULL DEFAULT '';
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_type VARCHAR(60);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget_min NUMERIC(16,2);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget_max NUMERIC(16,2);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS preferred_location VARCHAR(200);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS purchase_purpose VARCHAR(30);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS purchase_timeline VARCHAR(40);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority VARCHAR(10) NOT NULL DEFAULT 'MEDIUM';
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS expected_deal_value NUMERIC(16,2);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign_id BIGINT REFERENCES campaigns(id) ON DELETE SET NULL;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS channel_partner_id BIGINT REFERENCES channel_partners(id) ON DELETE SET NULL;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS meta_lead_id VARCHAR(180);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(16);
    ALTER TABLE plot_bookings ADD COLUMN IF NOT EXISTS campaign_id BIGINT REFERENCES campaigns(id) ON DELETE SET NULL;
    ALTER TABLE plot_bookings ADD COLUMN IF NOT EXISTS channel_partner_id BIGINT REFERENCES channel_partners(id) ON DELETE SET NULL;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_contacted_at TIMESTAMPTZ;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS response_sla_due_at TIMESTAMPTZ;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS response_sla_alerted_at TIMESTAMPTZ;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS partner_lock_until TIMESTAMPTZ;
    ALTER TABLE plots ADD COLUMN IF NOT EXISTS phase VARCHAR(80) NOT NULL DEFAULT '';
    ALTER TABLE plots ADD COLUMN IF NOT EXISTS tower VARCHAR(80) NOT NULL DEFAULT '';
    ALTER TABLE plots ADD COLUMN IF NOT EXISTS wing VARCHAR(80) NOT NULL DEFAULT '';
    ALTER TABLE plots ADD COLUMN IF NOT EXISTS floor VARCHAR(80) NOT NULL DEFAULT '';
    ALTER TABLE plot_bookings ADD COLUMN IF NOT EXISTS payment_plan_id BIGINT REFERENCES payment_plans(id) ON DELETE SET NULL;
    ALTER TABLE channel_partners ADD COLUMN IF NOT EXISTS rera_number VARCHAR(80) NOT NULL DEFAULT '';
    ALTER TABLE channel_partners ADD COLUMN IF NOT EXISTS gstin VARCHAR(20) NOT NULL DEFAULT '';
    ALTER TABLE channel_partners ADD COLUMN IF NOT EXISTS verification_status VARCHAR(15) NOT NULL DEFAULT 'PENDING';
    ALTER TABLE channel_partners ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
    ALTER TABLE channel_partners ADD COLUMN IF NOT EXISTS verified_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(LOWER(email));
    CREATE INDEX IF NOT EXISTS idx_leads_alt_phone ON leads(alternate_phone);
    CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_enquiries_lead ON lead_enquiries(lead_id,received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_site_visits_date ON site_visits(scheduled_at,status);
    CREATE INDEX IF NOT EXISTS idx_whatsapp_lead ON whatsapp_messages(lead_id,sent_at DESC);
    CREATE INDEX IF NOT EXISTS idx_campaign_dates ON campaigns(status,start_date,end_date);
    CREATE INDEX IF NOT EXISTS idx_leads_sla ON leads(response_sla_due_at,first_contacted_at) WHERE archived_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_plot_holds_active ON plot_holds(plot_id,held_until) WHERE status='ACTIVE';
    CREATE INDEX IF NOT EXISTS idx_plan_project ON payment_plans(project_id,active);
    CREATE INDEX IF NOT EXISTS idx_commission_slabs_partner ON commission_slabs(partner_id,min_bookings);
    CREATE INDEX IF NOT EXISTS idx_lead_documents_lead ON lead_documents(lead_id,created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_event_user ON notifications(user_id,event_id) WHERE event_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_action_user ON notifications(user_id,notification_type,action_url) WHERE action_url IS NOT NULL AND notification_type IN ('SLA','PAYMENT_DUE');
  `);

  await db.query('ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS calendar_events_event_type_check');
  await db.query("ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_event_type_check CHECK(event_type IN ('TASK','MEETING','GENERAL','SITE_VISIT'))");

  // Upgrade older installations from the original generic statuses to the
  // operational sales pipeline. Constraint names are PostgreSQL's defaults.
  await db.query('ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_workflow_status_check');

  await db.query(
    "UPDATE leads SET workflow_status=CASE workflow_status WHEN 'FOLLOW_UP_REQUIRED' THEN 'FOLLOW_UP' WHEN 'FOLLOW_UP_SCHEDULED' THEN 'FOLLOW_UP' WHEN 'INTERESTED' THEN 'FOLLOW_UP' WHEN 'SITE_VISIT_SCHEDULED' THEN 'SITE_VISIT' WHEN 'SITE_VISIT_COMPLETED' THEN 'SITE_VISIT' WHEN 'CONVERTED' THEN 'WON' ELSE workflow_status END"
  );

  await db.query(
    "ALTER TABLE leads ADD CONSTRAINT leads_workflow_status_check CHECK(workflow_status IN ('NEW','CONTACTED','QUALIFIED','FOLLOW_UP','SITE_VISIT','SITE_VISIT_COMPLETED','OFFICE_VISIT','NEGOTIATION','BOOKING_PENDING','WON','LOST'))"
  );

  await db.query('ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_lead_source_check');
  await db.query(
    "ALTER TABLE leads ADD CONSTRAINT leads_lead_source_check CHECK(lead_source IN ('META','INSTAGRAM','FACEBOOK','WHATSAPP','WEBSITE','GOOGLE','CHANNEL_PARTNER','REFERRAL','WALK_IN','CALLING','MANUAL','OTHER'))"
  );
  await db.query('ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_priority_check');
  await db.query("ALTER TABLE leads ADD CONSTRAINT leads_priority_check CHECK(priority IN ('LOW','MEDIUM','HIGH','URGENT'))");
  await db.query('ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_score_check');
  await db.query('ALTER TABLE leads ADD CONSTRAINT leads_score_check CHECK(lead_score BETWEEN 0 AND 100)');

  await db.query('ALTER TABLE followups DROP CONSTRAINT IF EXISTS followups_kind_check');
  await db.query("ALTER TABLE followups ADD CONSTRAINT followups_kind_check CHECK(kind IN ('FOLLOW_UP','SITE_VISIT','OFFICE_VISIT'))");

  await db.query('ALTER TABLE lead_activities DROP CONSTRAINT IF EXISTS lead_activities_type_check');

  await db.query(
    "ALTER TABLE lead_activities ADD CONSTRAINT lead_activities_type_check CHECK(type IN ('CREATED','REMARK','TYPE_CHANGED','DETAILS_UPDATED','STAGE_CHANGED','FOLLOWUP_SCHEDULED','FOLLOWUP_COMPLETED','FOLLOWUP_RESCHEDULED','SOURCE_CAPTURED','WHATSAPP_MESSAGE','SITE_VISIT_UPDATED','BOOKING_CREATED','DUPLICATE_MERGED'))"
  );

  await db.query("UPDATE settings SET value='NEW' WHERE key='default_workflow_status'");
  await db.query("UPDATE settings SET value='OTHER' WHERE key='default_lead_source' AND value NOT IN ('META','INSTAGRAM','FACEBOOK','WHATSAPP','WEBSITE','GOOGLE','CHANNEL_PARTNER','REFERRAL','WALK_IN','CALLING','MANUAL','OTHER')");

  await db.query(`
    INSERT INTO integration_accounts(provider,display_name) VALUES
      ('META','Meta Lead Ads'),('WHATSAPP','WhatsApp Business'),('WEBSITE','Website Forms'),('GOOGLE','Google Ads')
    ON CONFLICT(provider) DO NOTHING
  `);

  await db.query(`
    INSERT INTO settings(key,value) VALUES
      ('company_name','Gomata Vision LLP'),
      ('reminder_minutes','15'),
      ('timezone','Asia/Kolkata'),
      ('default_lead_type','WARM'),
      ('default_lead_source','WALK_IN'),
      ('default_workflow_status','NEW'),
      ('allow_backdated_entries','true'),
      ('show_overdue_banner','true'),
      ('dashboard_recent_limit','7')
      ,('task_reminder_minutes','30')
      ,('meeting_reminder_minutes','60')
      ,('default_area_unit','SQ_FT')
      ,('default_max_investors','1')
      ,('default_token_percent','5')
      ,('lead_response_sla_minutes','30')
      ,('partner_lead_lock_days','60')
    ON CONFLICT(key) DO NOTHING
  `);

  const count = Number(
    (await db.query<{ count: string }>('SELECT COUNT(*) AS count FROM users')).rows[0].count
  );

  if (!count) {
    if (process.env.NODE_ENV === 'production' && !process.env.SEED_ADMIN_PASSWORD) {
      throw new Error('SEED_ADMIN_PASSWORD is required for the first production launch.');
    }

    const email = (process.env.SEED_ADMIN_EMAIL || 'admin@gomatavision.com').toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD || 'Gomata@123';

    await db.query(
      'INSERT INTO users(name,email,password_hash) VALUES ($1,$2,$3)',
      ['Gomata Administrator', email, bcrypt.hashSync(password, 12)]
    );
  }
}

export async function transaction<T>(db: Db, work: (client: Db) => Promise<T>): Promise<T> {
  const connect = (db as Db & { connect?: () => Promise<PoolClient> }).connect;

  if (!connect) return work(db);

  const client = await connect.call(db);

  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
