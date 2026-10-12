import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pg from 'pg';
import bcrypt from 'bcryptjs';

import { migrate, type Db } from './db.js';
import { createApp } from './app.js';

type TestUser = {
  id: number;
  name: string;
  email: string;
  role: string;
};

const testDatabaseUrl = (() => {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL or TEST_DATABASE_URL is required for PostgreSQL tests');
  }
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = '/gomata_crm_test';
  return url.toString();
})();

const pool = new pg.Pool({ connectionString: testDatabaseUrl });
after(async () => pool.end());

async function setup() {
  process.env.NODE_ENV = 'test';
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await migrate(pool);

  return {
    db: pool as Db,
    agent: request.agent(createApp(pool))
  };
}

async function login(
  agent: ReturnType<typeof request.agent>
): Promise<TestUser> {
  const response = await agent
    .post('/api/auth/login')
    .send({
      email: 'admin@gomatavision.com',
      password: 'Gomata@123'
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.user.role, 'ADMIN');

  return response.body.user as TestUser;
}

const baseLead = () => ({
  name: 'Rahul Patil',
  address: 'Baner, Pune',
  contact: '9876543210',
  referenceName: 'Vikas Koli',
  leadType: 'HOT',
  leadSource: 'WALK_IN',
  workflowStatus: 'NEW',
  remark: 'Interested in project visit',
  enquiryDate: new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata'
  }).format(new Date()),
  enquiryTime: '10:30',
  followupDate: '',
  followupTime: ''
});

test('single administrator session protects the CRM', async () => {
  const { db, agent } = await setup();

  assert.equal((await agent.get('/api/leads')).status, 401);

  await login(agent);

  assert.equal((await agent.get('/api/leads')).status, 200);

  const users = await db.query<{ count: string }>(
    'SELECT COUNT(*) count FROM users'
  );

  assert.equal(Number(users.rows[0].count), 1);

  assert.equal((await agent.post('/api/auth/logout')).status, 204);
  assert.equal((await agent.get('/api/leads')).status, 401);
});

test(
  'PostgreSQL lead capture stores reference, generates a serial, history and blocks duplicates',
  async () => {
    const { db, agent } = await setup();

    await login(agent);

    const missingReference = await agent
      .post('/api/leads')
      .send({ ...baseLead(), referenceName: '' });

    assert.equal(missingReference.status, 400);
    assert.equal(missingReference.body.error, 'Reference / referred by is required');

    const created = await agent
      .post('/api/leads')
      .send(baseLead());

    assert.equal(created.status, 201);
    assert.equal(Number(created.body.lead.serial_no), 1);
    assert.equal(created.body.lead.lead_source, 'WALK_IN');
    assert.equal(created.body.lead.workflow_status, 'NEW');
    assert.equal(created.body.lead.reference_name, 'Vikas Koli');

    const duplicate = await agent
      .post('/api/leads')
      .send(baseLead());

    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error, 'Existing Lead Found');

    const detail = await agent.get(
      `/api/leads/${created.body.lead.id}`
    );

    assert.deepEqual(
      detail.body.activities
        .map((item: any) => item.type)
        .sort(),
      ['CREATED', 'REMARK']
    );

    const auditCount = await db.query<{ count: string }>(
      'SELECT COUNT(*) count FROM audit_logs WHERE action=$1',
      ['LEAD_CREATED']
    );

    assert.equal(Number(auditCount.rows[0].count), 1);

    const updated = await agent
      .patch(`/api/leads/${created.body.lead.id}`)
      .send({
        referenceName: 'Nitin Shah'
      });

    assert.equal(updated.status, 200);
    assert.equal(
      updated.body.lead.reference_name,
      'Nitin Shah'
    );
  }
);

test(
  'follow-up reminders, rescheduling and completion persist transactionally',
  async () => {
    const { agent } = await setup();

    await login(agent);

    const lead = (
      await agent.post('/api/leads').send(baseLead())
    ).body.lead;

    assert.equal(
      (
        await agent
          .post(`/api/leads/${lead.id}/followups`)
          .send({
            scheduledAt: new Date(
              Date.now() + 5 * 60000
            ).toISOString(),
            remark: 'Invalid early follow-up'
          })
      ).status,
      400
    );

    assert.equal(
      (
        await agent
          .post(`/api/leads/${lead.id}/pipeline-transition`)
          .send({
            toStage: 'CONTACTED',
            remark: 'Customer answered',
            contactOutcome: 'INTERESTED'
          })
      ).status,
      200
    );

    const scheduledAt = new Date(
      Date.now() + 5 * 60000
    ).toISOString();

    const followup = await agent
      .post(`/api/leads/${lead.id}/followups`)
      .send({
        scheduledAt,
        remark: 'Call about visit'
      });

    assert.equal(followup.status, 201);
    assert.equal(
      (await agent.get('/api/notifications')).body.unread,
      1
    );

    const movedAt = new Date(
      Date.now() + 2 * 3600000
    ).toISOString();

    assert.equal(
      (
        await agent
          .post(
            `/api/followups/${followup.body.followup.id}/reschedule`
          )
          .send({
            scheduledAt: movedAt,
            remark: 'Moved at customer request'
          })
      ).status,
      200
    );

    assert.equal(
      (await agent.get('/api/followups?scope=upcoming')).status,
      200
    );

    assert.equal(
      (await agent.get('/api/notifications')).body.unread,
      0
    );

    assert.equal(
      (
        await agent
          .post(
            `/api/followups/${followup.body.followup.id}/complete`
          )
          .send({
            remark: 'Spoke to customer',
            leadType: 'WARM'
          })
      ).status,
      200
    );

    const completed = await agent.get(
      '/api/followups?scope=completed'
    );

    assert.equal(completed.status, 200);
    assert.equal(completed.body.followups.length, 1);

    const detail = await agent.get(`/api/leads/${lead.id}`);

    assert.equal(detail.body.lead.lead_type, 'WARM');
    assert.equal(
      detail.body.lead.workflow_status,
      'FOLLOW_UP'
    );

    assert.ok(
      detail.body.activities.some(
        (item: any) =>
          item.type === 'FOLLOWUP_COMPLETED'
      )
    );
  }
);

test(
  'advanced lead filters include reference search and client-safe settings return expected records',
  async () => {
    const { agent } = await setup();

    await login(agent);

    await agent.post('/api/leads').send(baseLead());

    await agent
      .post('/api/leads')
      .send({
        ...baseLead(),
        name: 'Neha Joshi',
        contact: '9876543211',
        referenceName: 'Amit Deshmukh',
        leadType: 'COLD',
        leadSource: 'OTHER'
      });

    const hot = await agent.get(
      '/api/leads?type=HOT&workflow=NEW&source=WALK_IN&followup=none&search=Vikas'
    );

    assert.equal(hot.status, 200);
    assert.equal(hot.body.leads.length, 1);
    assert.equal(hot.body.leads[0].name, 'Rahul Patil');
    assert.equal(
      hot.body.leads[0].reference_name,
      'Vikas Koli'
    );

    const textSearch = await agent.get('/api/leads?search=Neha');
    assert.equal(textSearch.status, 200);
    assert.equal(textSearch.body.leads.length, 1);
    assert.equal(textSearch.body.leads[0].name, 'Neha Joshi');

    const settings = await agent.get('/api/settings');

    assert.equal(
      settings.body.settings.company_name,
      'Gomata Vision LLP'
    );
    assert.equal(
      settings.body.settings.database_provider,
      undefined
    );
    assert.equal(
      settings.body.settings.access_mode,
      undefined
    );
  }
);

test(
  'new leads auto-assign to creator and managers can reassign them later',
  async () => {
    const { db, agent } = await setup();

    const admin = await login(agent);

    const executive = (
      await db.query<any>(
        `INSERT INTO users(name,email,password_hash,role)
         VALUES ($1,$2,$3,$4)
         RETURNING id`,
        [
          'GRE User',
          'gre@gomatavision.com',
          bcrypt.hashSync('Gre@12345', 4),
          'GRE_EXECUTIVE'
        ]
      )
    ).rows[0];

    const created = await agent
      .post('/api/leads')
      .send({
        ...baseLead(),
        assignedTo: executive.id
      });

    assert.equal(created.status, 201);

    assert.equal(
      Number(created.body.lead.assigned_to),
      Number(admin.id)
    );

    const reassigned = await agent
      .patch(`/api/leads/${created.body.lead.id}`)
      .send({
        assignedTo: executive.id
      });

    assert.equal(reassigned.status, 200);
    assert.equal(
      Number(reassigned.body.lead.assigned_to),
      Number(executive.id)
    );

    const adminLead = await agent
      .post('/api/leads')
      .send({
        ...baseLead(),
        name: 'Admin Lead',
        contact: '9876543299',
        referenceName: 'Direct Walk-in'
      });

    assert.equal(adminLead.status, 201);
    assert.equal(
      Number(adminLead.body.lead.assigned_to),
      Number(admin.id)
    );

    const executiveAgent = request.agent(createApp(db));

    const signedIn = await executiveAgent
      .post('/api/auth/login')
      .send({
        email: 'gre@gomatavision.com',
        password: 'Gre@12345'
      });

    assert.equal(signedIn.status, 200);
    assert.equal(
      signedIn.body.user.role,
      'GRE_EXECUTIVE'
    );

    const visible = await executiveAgent.get('/api/leads');

    assert.equal(visible.status, 200);
    assert.equal(visible.body.leads.length, 1);
    assert.equal(
      visible.body.leads[0].name,
      'Rahul Patil'
    );

    assert.equal(
      (
        await executiveAgent.get(
          `/api/leads/${created.body.lead.id}`
        )
      ).status,
      200
    );

    assert.equal(
      (
        await executiveAgent.get(
          `/api/leads/${adminLead.body.lead.id}`
        )
      ).status,
      404
    );
  }
);

test(
  'CSV imports validate rows, store references, skip duplicate contacts and feed analytics',
  async () => {
    const { db, agent } = await setup();

    await login(agent);

    await agent.post('/api/leads').send(baseLead());

    const imported = await agent
      .post('/api/leads/import')
      .send({
        rows: [
          {
            name: 'Neha Joshi',
            contact: '9876543222',
            address: 'Pune',
            referenceName: 'Channel Partner A',
            leadType: 'COLD',
            leadSource: 'WEBSITE',
            workflowStatus: 'NEW',
            enquiryDate: '2026-08-16',
            enquiryTime: '09:15',
            remark: 'Imported register row'
          },
          {
            name: 'Duplicate Rahul',
            contact: '9876543210'
          },
          {
            name: 'Bad Row',
            contact: '123'
          }
        ]
      });

    assert.equal(imported.status, 200);
    assert.equal(imported.body.imported, 1);
    assert.equal(imported.body.duplicates.length, 1);
    assert.equal(imported.body.errors.length, 1);

    const search = await agent.get(
      '/api/leads?search=Channel%20Partner%20A'
    );

    assert.equal(search.status, 200);

    assert.ok(
      search.body.leads.some(
        (lead: any) =>
          lead.name === 'Neha Joshi' &&
          lead.reference_name === 'Channel Partner A'
      )
    );

    const analytics = await agent.get('/api/analytics');

    assert.equal(analytics.status, 200);
    assert.equal(analytics.body.summary.total, 2);

    assert.ok(
      analytics.body.bySource.some(
        (item: any) =>
          item.label === 'WEBSITE' &&
          Number(item.value) === 1
      )
    );

    const auditCount = await db.query<{ count: string }>(
      'SELECT COUNT(*) count FROM audit_logs WHERE action=$1',
      ['LEAD_IMPORTED']
    );

    assert.equal(Number(auditCount.rows[0].count), 1);
  }
);

test(
  'sales pipeline enforces the full flow, one reminder per stage, notifications and closure rules',
  async () => {
    const { agent } = await setup();

    await login(agent);

    const lead = (
      await agent.post('/api/leads').send(baseLead())
    ).body.lead;

    assert.equal(
      (
        await agent
          .post(`/api/leads/${lead.id}/pipeline-transition`)
          .send({
            toStage: 'CONTACTED',
            remark: 'Called customer'
          })
      ).status,
      400
    );

    assert.equal(
      (
        await agent
          .post(`/api/leads/${lead.id}/pipeline-transition`)
          .send({
            toStage: 'CONTACTED',
            remark: 'Customer is interested',
            contactOutcome: 'INTERESTED'
          })
      ).status,
      200
    );

    assert.equal(
      (
        await agent
          .post(`/api/leads/${lead.id}/pipeline-transition`)
          .send({
            toStage: 'WON',
            remark: 'Tried to skip stages'
          })
      ).status,
      400
    );

    assert.equal(
      (
        await agent
          .post(`/api/leads/${lead.id}/pipeline-transition`)
          .send({
            toStage: 'FOLLOW_UP',
            remark: 'Call after family discussion'
          })
      ).status,
      400
    );

    const followupAt = new Date(
      Date.now() + 5 * 60000
    ).toISOString();

    assert.equal(
      (
        await agent
          .post(`/api/leads/${lead.id}/pipeline-transition`)
          .send({
            toStage: 'FOLLOW_UP',
            remark: 'Call after family discussion',
            scheduledAt: followupAt
          })
      ).status,
      200
    );

    const rescheduledAt = new Date(
      Date.now() + 6 * 60000
    ).toISOString();

    assert.equal(
      (
        await agent
          .post(`/api/leads/${lead.id}/pipeline-transition`)
          .send({
            toStage: 'FOLLOW_UP',
            remark: 'Customer requested six o’clock',
            scheduledAt: rescheduledAt
          })
      ).status,
      200
    );

    let detail = await agent.get(`/api/leads/${lead.id}`);

    assert.equal(
      detail.body.followups.filter(
        (item: any) =>
          item.status === 'PENDING' &&
          item.kind === 'FOLLOW_UP'
      ).length,
      1
    );

    let notes = await agent.get('/api/notifications');

    assert.equal(notes.body.unread, 1);
    assert.equal(
      notes.body.notifications[0].title,
      'Follow-up Reminder'
    );

    assert.equal(
      (
        await agent
          .post(`/api/leads/${lead.id}/pipeline-transition`)
          .send({
            toStage: 'SITE_VISIT',
            remark: 'Visit agreed',
            scheduledAt: new Date(
              Date.now() + 7 * 60000
            ).toISOString()
          })
      ).status,
      400
    );

    const visitAt = new Date(
      Date.now() + 7 * 60000
    ).toISOString();

    assert.equal(
      (
        await agent
          .post(`/api/leads/${lead.id}/pipeline-transition`)
          .send({
            toStage: 'SITE_VISIT',
            remark: 'Visit Project A',
            scheduledAt: visitAt,
            projectName: 'Project A'
          })
      ).status,
      200
    );

    detail = await agent.get(`/api/leads/${lead.id}`);

    assert.equal(
      detail.body.lead.workflow_status,
      'SITE_VISIT'
    );

    assert.equal(
      detail.body.followups.filter(
        (item: any) => item.status === 'PENDING'
      ).length,
      1
    );

    assert.equal(
      detail.body.followups.find(
        (item: any) => item.status === 'PENDING'
      ).kind,
      'SITE_VISIT'
    );

    notes = await agent.get('/api/notifications');

    assert.equal(notes.body.unread, 1);
    assert.equal(
      notes.body.notifications[0].title,
      'Site Visit Reminder'
    );

    for(const [toStage,remark] of [['SITE_VISIT_COMPLETED','Visit completed'],['NEGOTIATION','Commercial terms discussed'],['BOOKING_PENDING','Token requested'],['WON','Token received and booking confirmed']]){
      assert.equal((await agent.post(`/api/leads/${lead.id}/pipeline-transition`).send({toStage,remark})).status,200);
    }

    detail = await agent.get(`/api/leads/${lead.id}`);

    assert.equal(detail.body.lead.workflow_status, 'WON');

    assert.ok(
      detail.body.activities.some(
        (item: any) =>
          item.content.includes(
            'Booking Pending → Closed Won'
          )
      )
    );

    const second = (
      await agent
        .post('/api/leads')
        .send({
          ...baseLead(),
          name: 'Lost Customer',
          contact: '9876543288',
          referenceName: 'Direct'
        })
    ).body.lead;

    await agent
      .post(`/api/leads/${second.id}/pipeline-transition`)
      .send({
        toStage: 'CONTACTED',
        remark: 'Customer declined',
        contactOutcome: 'NOT_INTERESTED'
      });

    assert.equal(
      (
        await agent
          .post(`/api/leads/${second.id}/pipeline-transition`)
          .send({
            toStage: 'LOST',
            remark: 'Customer not proceeding'
          })
      ).status,
      400
    );

    assert.equal(
      (
        await agent
          .post(`/api/leads/${second.id}/pipeline-transition`)
          .send({
            toStage: 'LOST',
            remark: 'Customer not proceeding',
            lostReason: 'NOT_INTERESTED'
          })
      ).status,
      200
    );
  }
);

test(
  'GRE module settings validate and persist operational preferences',
  async () => {
    const { agent } = await setup();

    await login(agent);

    const saved = await agent
      .patch('/api/settings')
      .send({
        company_name: 'Gomata Vision LLP',
        reminder_minutes: 30,
        default_lead_type: 'HOT',
        default_lead_source: 'WEBSITE',
        default_workflow_status: 'NEW',
        allow_backdated_entries: false,
        show_overdue_banner: false,
        dashboard_recent_limit: 10
      });

    assert.equal(saved.status, 200);

    const settings = (
      await agent.get('/api/settings')
    ).body.settings;

    assert.equal(settings.default_lead_type, 'HOT');
    assert.equal(
      settings.allow_backdated_entries,
      'false'
    );
    assert.equal(
      settings.dashboard_recent_limit,
      '10'
    );
  }
);

test(
  'public QR lead capture allows unauthenticated submission, records source and reference, and creates admin notifications',
  async () => {
    const { db, agent } = await setup();

    // Public QR submission
    const res = await agent.post('/api/public/leads').send({
      name: 'Pooja Kulkarni',
      contact: '9822334455',
      address: 'Kothrud, Pune',
      referenceName: 'Dr. Anand Joshi',
      leadSource: 'OTHER',
      remark: 'Interested in 3 BHK near Metro',
      enquiryDate: '2026-08-22',
      enquiryTime: '03:45'
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.lead.name, 'Pooja Kulkarni');

    // Prevent duplicate QR submissions
    const duplicate = await agent.post('/api/public/leads').send({
      name: 'Pooja Kulkarni',
      contact: '9822334455',
      address: 'Kothrud, Pune',
      referenceName: 'Dr. Anand Joshi',
      leadSource: 'OTHER',
      remark: 'Interested in 3 BHK near Metro',
      enquiryDate: '2026-08-22',
      enquiryTime: '03:45'
    });
    assert.equal(duplicate.status, 409);

    // Login as admin and inspect lead profile and journey
    await login(agent);

    const detail = await agent.get(`/api/leads/${res.body.lead.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.lead.name, 'Pooja Kulkarni');
    assert.equal(detail.body.lead.reference_name, 'Dr. Anand Joshi');
    assert.equal(detail.body.lead.lead_source, 'OTHER');
    assert.equal(detail.body.lead.lead_type, 'WARM');
    assert.equal(detail.body.lead.workflow_status, 'NEW');

    // Verify activities detail actor and action
    const activities = detail.body.activities;
    assert.ok(activities.some((a: any) => a.type === 'CREATED' && a.content.includes('QR Code scan')));
    assert.ok(activities.some((a: any) => a.type === 'REMARK' && a.content.includes('3 BHK')));

    // Verify in-app notifications
    const notes = await agent.get('/api/notifications');
    assert.equal(notes.status, 200);
    assert.ok(notes.body.notifications.some((n: any) => n.title.includes('QR Lead')));

    // Test full lead editing: edit contact, name, reference, project, and classification
    const edited = await agent.patch(`/api/leads/${res.body.lead.id}`).send({
      name: 'Pooja Kulkarni Sharma',
      contact: '9822334499',
      referenceName: 'Dr. Anand Joshi (Friend)',
      projectName: 'Gomata Meadows Phase 1',
      leadType: 'HOT'
    });

    assert.equal(edited.status, 200);
    assert.equal(edited.body.lead.name, 'Pooja Kulkarni Sharma');
    assert.equal(edited.body.lead.contact, '9822334499');
    assert.equal(edited.body.lead.reference_name, 'Dr. Anand Joshi (Friend)');
    assert.equal(edited.body.lead.project_name, 'Gomata Meadows Phase 1');
    assert.equal(edited.body.lead.lead_type, 'HOT');

    const updatedDetail = await agent.get(`/api/leads/${res.body.lead.id}`);
    assert.ok(updatedDetail.body.activities.some((a: any) => a.type === 'DETAILS_UPDATED' && a.content.includes('Lead details updated')));
  }
);

test(
  'sales pipeline transition to CONTACTED allows selecting lead classification (HOT/WARM/COLD)',
  async () => {
    const { agent } = await setup();
    await login(agent);

    // Create lead without specifying classification (should default to WARM)
    const created = await agent.post('/api/leads').send({
      name: 'Amit Verma',
      address: 'Hinjewadi, Pune',
      contact: '9123456780',
      referenceName: 'Direct Walkin',
      remark: 'Looking for investment plot',
      enquiryDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()),
      enquiryTime: '11:00'
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.lead.lead_type, 'WARM');

    // Move from NEW to CONTACTED with classification HOT chosen by executive
    const transition = await agent.post(`/api/leads/${created.body.lead.id}/pipeline-transition`).send({
      toStage: 'CONTACTED',
      contactOutcome: 'INTERESTED',
      leadType: 'HOT',
      remark: 'Spoke with customer, very keen on immediate booking'
    });

    assert.equal(transition.status, 200);
    assert.equal(transition.body.lead.workflow_status, 'CONTACTED');
    assert.equal(transition.body.lead.lead_type, 'HOT');

    const detail = await agent.get(`/api/leads/${created.body.lead.id}`);
    assert.equal(detail.body.lead.lead_type, 'HOT');
    assert.ok(detail.body.activities.some((a: any) => a.type === 'TYPE_CHANGED' && a.content.includes('HOT')));
  }
);

test('batch lead capture is atomic and stores every PostgreSQL lead', async () => {
  const { db, agent } = await setup();
  await login(agent);
  const response = await agent.post('/api/leads/batch').send({
    leads: [
      { ...baseLead(), name: 'Batch Customer One', contact: '9876500001' },
      { ...baseLead(), name: 'Batch Customer Two', contact: '9876500002' }
    ]
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.leads.length, 2);
  assert.equal(Number((await db.query<{count:string}>("SELECT COUNT(*) count FROM leads WHERE contact IN ('9876500001','9876500002')")).rows[0].count), 2);

  const rejected = await agent.post('/api/leads/batch').send({
    leads: [
      { ...baseLead(), name: 'Unique row', contact: '9876500003' },
      { ...baseLead(), name: 'Duplicate row', contact: '9876500001' }
    ]
  });
  assert.equal(rejected.status, 409);
  assert.equal(Number((await db.query<{count:string}>("SELECT COUNT(*) count FROM leads WHERE contact='9876500003'")).rows[0].count), 0);
});

test('follow-up outcome can transactionally schedule an office visit and close the lead', async () => {
  const { agent } = await setup();
  await login(agent);
  const lead=(await agent.post('/api/leads').send({...baseLead(),contact:'9876500010'})).body.lead;
  await agent.post(`/api/leads/${lead.id}/pipeline-transition`).send({toStage:'CONTACTED',remark:'Customer contacted',contactOutcome:'INTERESTED'});
  await agent.post(`/api/leads/${lead.id}/pipeline-transition`).send({toStage:'FOLLOW_UP',remark:'Discuss visit',scheduledAt:new Date(Date.now()+5*60000).toISOString()});
  let detail=await agent.get(`/api/leads/${lead.id}`);
  const followup=detail.body.followups.find((item:any)=>item.kind==='FOLLOW_UP'&&item.status==='PENDING');
  const officeAt=new Date(Date.now()+10*60000).toISOString();
  const action=await agent.post(`/api/followups/${followup.id}/action`).send({remark:'Customer agreed to visit the office',leadType:'HOT',nextStage:'OFFICE_VISIT',scheduledAt:officeAt});
  assert.equal(action.status,200);
  detail=await agent.get(`/api/leads/${lead.id}`);
  assert.equal(detail.body.lead.workflow_status,'OFFICE_VISIT');
  const office=detail.body.followups.find((item:any)=>item.kind==='OFFICE_VISIT'&&item.status==='PENDING');
  assert.ok(office);
  const close=await agent.post(`/api/followups/${office.id}/action`).send({remark:'Commercial discussion completed',nextStage:'NEGOTIATION'});
  assert.equal(close.status,200);
  assert.equal((await agent.post(`/api/leads/${lead.id}/pipeline-transition`).send({toStage:'BOOKING_PENDING',remark:'Token requested'})).status,200);
  assert.equal((await agent.post(`/api/leads/${lead.id}/pipeline-transition`).send({toStage:'WON',remark:'Booking confirmed at office'})).status,200);
  detail=await agent.get(`/api/leads/${lead.id}`);
  assert.equal(detail.body.lead.workflow_status,'WON');
});

test('calendar allocations and real-estate booking workflow persist end to end', async () => {
  const { db, agent } = await setup();
  const user = await login(agent);
  const lead = (await agent.post('/api/leads').send({ ...baseLead(), contact: '9876500099' })).body.lead;
  await db.query("UPDATE leads SET workflow_status='WON',status='CONVERTED' WHERE id=$1", [lead.id]);

  const startsAt = new Date(Date.now() + 30 * 60000).toISOString();
  const calendar = await agent.post('/api/calendar/events').send({
    title: 'Prepare plot booking file', eventType: 'TASK', startsAt,
    assignedTo: user.id, leadId: lead.id, priority: 'HIGH', reminderMinutes: 60
  });
  assert.equal(calendar.status, 201);
  const calendarView = await agent.get(`/api/calendar?from=${encodeURIComponent(new Date().toISOString())}&to=${encodeURIComponent(new Date(Date.now()+86400000).toISOString())}`);
  assert.equal(calendarView.status, 200);
  assert.ok(calendarView.body.events.some((event: any) => event.title === 'Prepare plot booking file'));
  assert.equal((await agent.patch(`/api/calendar/events/${calendar.body.event.id}`).send({title:'Prepare final plot booking file'})).status,200);
  assert.equal((await agent.delete(`/api/calendar/events/${calendar.body.event.id}`)).status,204);
  const afterDelete=await agent.get(`/api/calendar?from=${encodeURIComponent(new Date().toISOString())}&to=${encodeURIComponent(new Date(Date.now()+86400000).toISOString())}`);
  assert.ok(!afterDelete.body.events.some((event:any)=>event.id===calendar.body.event.id&&event.source==='EVENT'));

  const project = await agent.post('/api/inventory/projects').send({ name: 'Gomata Greens', location: 'Pune' });
  assert.equal(project.status, 201);
  const plot = await agent.post('/api/inventory/plots').send({ projectId: project.body.project.id, plotNumber: 'A-101', area: 1200, basePrice: 2400000, minimumToken: 100000, maxInvestors: 2 });
  assert.equal(plot.status, 201);
  const booking = await agent.post(`/api/inventory/plots/${plot.body.plot.id}/bookings`).send({
    leadId: lead.id, quotedPrice: 2300000, tokenAmount: 100000,
    bookingDate: new Date().toISOString().slice(0, 10),
    steps: [{ key: 'TOKEN', label: 'Token received' }, { key: 'FULL_PAYMENT', label: 'Full payment' }, { key: 'REGISTRATION', label: 'Registration' }]
  });
  assert.equal(booking.status, 201);
  const detail = await agent.get(`/api/inventory/bookings/${booking.body.booking.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.booking.customer_name, lead.name);
  assert.equal(Number(detail.body.booking.paid_amount), 100000);
  assert.equal(detail.body.steps[0].status, 'COMPLETED');

  const payment = await agent.post(`/api/inventory/bookings/${booking.body.booking.id}/payments`).send({ amount: 500000, paidAt: new Date().toISOString().slice(0, 10), mode: 'BANK_TRANSFER', reference: 'UTR-TEST' });
  assert.equal(payment.status, 201);
  const document = await agent.post(`/api/inventory/bookings/${booking.body.booking.id}/documents`).send({ documentType: 'KYC', fileName: 'kyc.txt', mimeType: 'text/plain', data: `data:text/plain;base64,${Buffer.from('verified').toString('base64')}` });
  assert.equal(document.status, 201);
});

test('digital lead capture normalizes Indian phones and merges repeat enquiries',async()=>{const{db,agent}=await setup();const first=await agent.post('/api/leads/capture').send({name:'Digital Buyer',phone:'+91 98765 43210',email:'buyer@example.com',platform:'META',campaignName:'Monsoon Plots',externalLeadId:'meta-101',message:'Needs an investment plot'});assert.equal(first.status,201);assert.equal(first.body.duplicate,false);assert.equal(first.body.lead.contact,'9876543210');const repeat=await agent.post('/api/leads/capture').send({name:'Digital Buyer',phone:'09876543210',email:'buyer@example.com',platform:'WHATSAPP',campaignName:'WhatsApp Retargeting',externalLeadId:'wa-202'});assert.equal(repeat.status,200);assert.equal(repeat.body.duplicate,true);assert.equal(repeat.body.lead.id,first.body.lead.id);const counts=(await db.query<{leads:string;enquiries:string}>('SELECT (SELECT COUNT(*) FROM leads)::text leads,(SELECT COUNT(*) FROM lead_enquiries)::text enquiries')).rows[0];assert.equal(Number(counts.leads),1);assert.equal(Number(counts.enquiries),2);});

test('campaign, site visit and channel partner modules persist operational records',async()=>{const{agent}=await setup();await login(agent);const campaign=await agent.post('/api/campaigns').send({name:'Festival Investment Drive',platform:'META',budget:250000,status:'ACTIVE',description:'Digital campaign'});assert.equal(campaign.status,201);const lead=(await agent.post('/api/leads').send({...baseLead(),contact:'9999912345',leadSource:'META'})).body.lead;const visitAt=new Date(Date.now()+86400000).toISOString();const visit=await agent.post('/api/site-visits').send({leadId:lead.id,scheduledAt:visitAt,notes:'Visit project entrance'});assert.equal(visit.status,201);assert.equal((await agent.get('/api/site-visits')).body.visits.length,1);assert.equal((await agent.patch(`/api/site-visits/${visit.body.visit.id}`).send({status:'COMPLETED',feedback:'Customer liked the corner plots',customerInterest:'HIGH'})).status,200);const partner=await agent.post('/api/channel-partners').send({name:'Sunrise Realty',company:'Sunrise Realty',phone:'+91 98888 77777',city:'Pune',commissionType:'PERCENT',commissionValue:2});assert.equal(partner.status,201);const partners=(await agent.get('/api/channel-partners')).body.partners;assert.equal(partners[0].phone,'9888877777');assert.equal(partners[0].name,'Sunrise Realty');const campaigns=(await agent.get('/api/campaigns')).body.campaigns;assert.equal(campaigns[0].name,'Festival Investment Drive');});

test('proposal completion features work together without changing the existing booking flow',async()=>{const{db,agent}=await setup();await login(agent);const executive=(await db.query<any>("INSERT INTO users(name,email,password_hash,role) VALUES ('Sales One','sales@example.com',$1,'SALES_EXECUTIVE') RETURNING id",[bcrypt.hashSync('Sales@123',4)])).rows[0];const captured=await agent.post('/api/leads/capture').send({name:'Auto Assigned Buyer',phone:'9000011111',platform:'WEBSITE'});assert.equal(captured.status,201);assert.equal(Number(captured.body.lead.assigned_to),Number(executive.id));assert.ok(captured.body.lead.response_sla_due_at);
  const contacted=await agent.post(`/api/leads/${captured.body.lead.id}/pipeline-transition`).send({toStage:'CONTACTED',remark:'Called within SLA',contactOutcome:'INTERESTED'});assert.equal(contacted.status,200);assert.ok(contacted.body.lead.first_contacted_at);
  await db.query("UPDATE leads SET workflow_status='WON',status='CONVERTED' WHERE id=$1",[captured.body.lead.id]);const project=(await agent.post('/api/inventory/projects').send({name:'Hierarchy Heights',location:'Pune',assignmentUserIds:[executive.id]})).body.project;const listedProject=(await agent.get('/api/inventory/projects')).body.projects[0];assert.deepEqual(listedProject.assigned_user_ids.map(Number),[Number(executive.id)]);const campaign=(await agent.post('/api/campaigns').send({name:'Hierarchy Campaign',platform:'META',projectId:project.id,budget:10000,status:'ACTIVE'})).body.campaign;const routed=await agent.post('/api/leads/capture').send({name:'Project Routed Buyer',phone:'9000011112',platform:'META',campaignId:campaign.id});assert.equal(Number(routed.body.lead.assigned_to),Number(executive.id));const plot=(await agent.post('/api/inventory/plots').send({projectId:project.id,plotNumber:'1203',phase:'Phase 1',tower:'Tower A',wing:'East',floor:'12',area:950,basePrice:5000000,minimumToken:100000})).body.plot;assert.equal(plot.tower,'Tower A');assert.equal((await agent.post(`/api/inventory/plots/${plot.id}/hold`).send({hours:48,leadId:captured.body.lead.id,reason:'Token processing'})).status,201);assert.equal((await agent.get('/api/inventory/plots')).body.plots[0].status,'BLOCKED');assert.equal((await agent.delete(`/api/inventory/plots/${plot.id}/hold`)).status,204);
  const plan=(await agent.post('/api/inventory/payment-plans').send({projectId:project.id,name:'Construction Plan',milestones:[{label:'Booking',percentage:10,dueDays:0},{label:'Development',percentage:70,dueDays:90},{label:'Registry',percentage:20,dueDays:180}]})).body.plan;const booking=(await agent.post(`/api/inventory/plots/${plot.id}/bookings`).send({leadId:captured.body.lead.id,quotedPrice:5000000,tokenAmount:100000,bookingDate:new Date().toISOString().slice(0,10),paymentPlanId:plan.id}));assert.equal(booking.status,201);const detail=await agent.get(`/api/inventory/bookings/${booking.body.booking.id}`);assert.equal(detail.body.steps.length,3);assert.equal(Number(detail.body.steps[0].target_amount),500000);assert.equal((await agent.get(`/api/inventory/bookings/${booking.body.booking.id}/demand-notice`)).headers['content-type'],'application/pdf');assert.equal((await agent.get(`/api/inventory/payments/${detail.body.payments[0].id}/receipt`)).headers['content-type'],'application/pdf');
  const analytics=await agent.get('/api/analytics');assert.ok(Array.isArray(analytics.body.teamPerformance));assert.equal(typeof analytics.body.summary.salesVelocityDays,'number');
});

test('customer documents and channel partner payout reporting work end to end',async()=>{
  const{db,agent}=await setup();await login(agent);
  const lead=(await agent.post('/api/leads').send({...baseLead(),contact:'9000022222'})).body.lead;
  const content='verified customer identity';
  const uploaded=await agent.post(`/api/leads/${lead.id}/documents`).send({documentType:'KYC',fileName:'customer-kyc.txt',mimeType:'text/plain',data:`data:text/plain;base64,${Buffer.from(content).toString('base64')}`});
  assert.equal(uploaded.status,201);
  const leadDetail=await agent.get(`/api/leads/${lead.id}`);
  assert.equal(leadDetail.body.documents[0].file_name,'customer-kyc.txt');
  const downloaded=await agent.get(`/api/leads/documents/${uploaded.body.document.id}/download`);
  assert.equal(downloaded.status,200);
  assert.match(downloaded.headers['content-type'],/^text\/plain/);
  assert.equal(downloaded.text,content);

  const project=(await agent.post('/api/inventory/projects').send({name:'Partner Project',location:'Pune'})).body.project;
  const partner=(await agent.post('/api/channel-partners').send({name:'Trusted Realty',company:'Trusted Realty',phone:'9000033333',city:'Pune',commissionType:'PERCENT',commissionValue:2})).body.partner;
  await db.query("UPDATE leads SET workflow_status='WON',status='CONVERTED',channel_partner_id=$1 WHERE id=$2",[partner.id,lead.id]);
  const plot=(await agent.post('/api/inventory/plots').send({projectId:project.id,plotNumber:'P-101',area:1000,basePrice:2500000,minimumToken:100000})).body.plot;
  const booking=await agent.post(`/api/inventory/plots/${plot.id}/bookings`).send({leadId:lead.id,quotedPrice:2500000,tokenAmount:100000,bookingDate:new Date().toISOString().slice(0,10),channelPartnerId:partner.id,steps:[{key:'TOKEN',label:'Token received'}]});
  assert.equal(booking.status,201);
  let report=await agent.get('/api/channel-partners/report');
  assert.equal(report.status,200);
  assert.equal(report.body.summary.total_partners,1);
  assert.equal(report.body.performance[0].bookings,1);
  assert.equal(Number(report.body.commissions[0].amount),50000);
  const commissionId=report.body.commissions[0].id;
  assert.equal((await agent.patch(`/api/commissions/${commissionId}`).send({status:'APPROVED'})).status,200);
  assert.equal((await agent.patch(`/api/commissions/${commissionId}`).send({status:'PAID',reference:'UTR-PAYOUT-001'})).status,200);
  report=await agent.get('/api/channel-partners/report');
  assert.equal(report.body.commissions[0].status,'PAID');
  assert.equal(report.body.commissions[0].reference,'UTR-PAYOUT-001');
  assert.equal(Number(report.body.summary.commission_paid),50000);
});
