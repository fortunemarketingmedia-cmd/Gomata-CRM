import { Link2, MapPin, MessageSquareText, Phone, UserRound } from '../icons';
import type { ReactNode } from 'react';
import type { LeadSource, LeadType, WorkflowStatus } from '../types';

export const LEAD_SOURCE_OPTIONS: ReadonlyArray<{ value: LeadSource; label: string }> = [
  { value: 'META', label: 'Meta Lead Ads' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'WALK_IN', label: 'Walk-in' },
  { value: 'WEBSITE', label: 'Website' },
  { value: 'GOOGLE', label: 'Google Ads' },
  { value: 'CHANNEL_PARTNER', label: 'Channel Partner' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'CALLING', label: 'Calling' },
  { value: 'MANUAL', label: 'Manual entry' },
  { value: 'OTHER', label: 'Others' }
];

export type LeadFormData = {
  name: string;
  address: string;
  contact: string;
  referenceName: string;
  leadType: LeadType;
  leadSource: LeadSource;
  workflowStatus: WorkflowStatus;
  remark: string;
  enquiryDate: string;
  enquiryTime: string;
  followupDate: string;
  followupTime: string;
};

export function currentLeadForm(defaultSource: LeadSource = 'WALK_IN'): LeadFormData {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString();
  return {
    name: '',
    address: '',
    contact: '',
    referenceName: '',
    leadType: 'WARM',
    leadSource: defaultSource,
    workflowStatus: 'NEW',
    remark: '',
    enquiryDate: local.slice(0, 10),
    enquiryTime: local.slice(11, 16),
    followupDate: '',
    followupTime: ''
  };
}

export function LeadFormFields({
  form,
  set,
  allowBackdated = true,
  contactStatus,
  afterContact,
  afterAddress
}: {
  form: LeadFormData;
  set: (key: keyof LeadFormData, value: string) => void;
  allowBackdated?: boolean;
  contactStatus?: string;
  afterContact?: ReactNode;
  afterAddress?: ReactNode;
}) {
  const day = form.enquiryDate
    ? new Intl.DateTimeFormat('en-IN', { weekday: 'long' }).format(
        new Date(`${form.enquiryDate}T00:00:00`)
      )
    : '—';

  return (
    <>
      <div className="form-grid three">
        <label>
          Date
          <input
            type="date"
            value={form.enquiryDate}
            disabled={!allowBackdated}
            onChange={event => set('enquiryDate', event.target.value)}
            required
          />
        </label>
        <label>
          Day
          <input value={day} disabled />
        </label>
        <label>
          Time
          <input
            type="time"
            value={form.enquiryTime}
            onChange={event => set('enquiryTime', event.target.value)}
            required
          />
        </label>
      </div>

      <div className="form-grid two">
        <label>
          Customer name *
          <div className="input-icon">
            <UserRound />
            <input
              value={form.name}
              onChange={event => set('name', event.target.value)}
              placeholder="Full name"
              minLength={2}
              maxLength={100}
              autoComplete="name"
              required
            />
          </div>
        </label>
        <label>
          Contact number *
          <div className="input-icon">
            <Phone />
            <input
              value={form.contact}
              onChange={event => set('contact', event.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="10–15 digit number"
              maxLength={20}
              required
            />
          </div>
          {contactStatus && <small>{contactStatus}</small>}
        </label>
      </div>

      {afterContact}

      <label>
        Customer address
        <div className="input-icon textarea">
          <MapPin />
          <textarea
            value={form.address}
            onChange={event => set('address', event.target.value)}
            placeholder="House, street, area, city"
            maxLength={500}
            rows={2}
          />
        </div>
      </label>

      {afterAddress}

      <div className="form-grid two">
        <label>
          Lead source
          <select
            value={form.leadSource}
            onChange={event => set('leadSource', event.target.value)}
          >
            {LEAD_SOURCE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          Reference / Referred by *
          <div className="input-icon">
            <Link2 />
            <input
              value={form.referenceName}
              onChange={event => set('referenceName', event.target.value)}
              placeholder="From whose reference the lead had come"
              minLength={2}
              maxLength={150}
              required
            />
          </div>
        </label>
      </div>

      <label>
        Initial remark / enquiry details *
        <div className="input-icon textarea">
          <MessageSquareText />
          <textarea
            value={form.remark}
            onChange={event => set('remark', event.target.value)}
            placeholder="What did the customer enquire about?"
            maxLength={1000}
            rows={3}
            required
          />
        </div>
      </label>
    </>
  );
}
