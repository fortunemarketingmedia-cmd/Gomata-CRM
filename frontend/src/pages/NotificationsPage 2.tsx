import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Clock3, Phone, ArrowRight, Sparkles } from '../icons';
import { api, fmtDateTime } from '../lib/api';

type Note = {
  id: number;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  scheduled_at?: string;
  lead_id?: number;
  name?: string;
  contact?: string;
  action_url?: string;
};

export function NotificationsPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);
  const nav = useNavigate();

  const load = () =>
    api<{ notifications: Note[]; unread: number }>('/notifications').then(r => {
      setNotes(r.notifications);
      setUnread(r.unread);
    });

  useEffect(() => {
    void load();
  }, []);

  const read = async (n: Note) => {
    if (!n.is_read) {
      await api(`/notifications/${n.id}/read`, { method: 'PATCH' });
    }
    if (n.action_url) {
      nav(n.action_url);
    } else if (n.lead_id) {
      nav(`/gre/${n.lead_id}`);
    } else {
      void load();
    }
  };

  const markAllRead = async () => {
    await api('/notifications/read-all', { method: 'POST' });
    void load();
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">REMINDER & ALERTS CENTRE</span>
          <h1>Notifications</h1>
          <p>
            {unread} unread alert{unread === 1 ? '' : 's'} · Real-time pipeline follow-up and QR
            enquiry notifications
          </p>
        </div>
        {unread > 0 && (
          <button className="secondary" onClick={markAllRead}>
            <CheckCheck /> Mark all as read
          </button>
        )}
      </div>

      <section className="card notification-list">
        {notes.map(n => (
          <button
            key={n.id}
            className={`notification-item ${n.is_read ? 'read' : 'unread'}`}
            onClick={() => void read(n)}
          >
            <span className="note-icon">
              {n.title.includes('QR') ? <Sparkles /> : <Bell />}
            </span>
            <div className="note-body">
              <div className="note-header">
                <strong>{n.title}</strong>
                <time>{fmtDateTime(n.created_at)}</time>
              </div>
              {n.name && <h3>{n.name}</h3>}
              <p className="note-message">
                {n.contact && (
                  <span className="contact-tag">
                    <Phone size={14} /> {n.contact}
                  </span>
                )}
                {n.scheduled_at && (
                  <span className="due-tag">
                    <Clock3 size={14} /> Due: {fmtDateTime(n.scheduled_at)}
                  </span>
                )}
                {!n.contact && !n.scheduled_at && n.message}
              </p>
            </div>
            <ArrowRight className="note-arrow" />
          </button>
        ))}

        {notes.length === 0 && (
          <div className="empty-state">
            <Bell />
            <h2>No notifications yet</h2>
            <p>
              Follow-up reminders, site visit alerts, and QR lead enquiries will appear here when
              they become due.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
