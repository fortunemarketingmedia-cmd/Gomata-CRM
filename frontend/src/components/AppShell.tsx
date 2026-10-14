import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ContactRound,
  CalendarClock,
  Bell,
  Settings,
  Menu,
  CircleUserRound,
  PanelLeftClose,
  PanelLeftOpen,
  BarChart3,
  Columns3
  ,CalendarDays
  ,Building2
  ,UsersRound
  ,MapPin
  ,Search
} from '../icons';
import { Brand } from './Brand';
import { useAuth } from '../contexts/AuthContext';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from './Toast';

const navGroups = [
  { label: 'Overview', items: [['Dashboard', '/', LayoutDashboard]] },
  { label: 'Sales', items: [
    ['Leads', '/gre', ContactRound],
    ['Pipeline', '/sales-pipeline', Columns3],
    ['Follow-ups', '/follow-ups', CalendarClock],
    ['Calendar', '/calendar', CalendarDays]
  ] },
  { label: 'Growth', items: [
    ['Channel Partners', '/channel-partners', UsersRound]
  ] },
  { label: 'Operations', items: [
    ['Site Visits', '/site-visits', MapPin],
    ['Inventory', '/inventory', Building2]
  ] },
  { label: 'Insights', items: [['Analytics', '/analytics', BarChart3]] }
] as const;

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/gre': 'GRE Lead Register',
  '/sales-pipeline': 'Sales Pipeline',
  '/follow-ups': 'Follow-ups & Visits',
  '/calendar': 'Operations Calendar',
  '/site-visits': 'Site Visits',
  '/channel-partners': 'Channel Partners',
  '/inventory': 'Real Estate Inventory',
  '/analytics': 'Analytics',
  '/notifications': 'Notifications',
  '/settings': 'Settings'
};

export function AppShell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('gomata_sidebar_collapsed') === 'true'
  );
  const [unread, setUnread] = useState(0);
  const [globalSearch, setGlobalSearch] = useState('');
  const globalSearchRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const shownNotificationIds = useRef(new Set<number>());

  useEffect(() => {
    const fetchNotes = () =>
      api<{ unread: number; notifications: any[] }>('/notifications')
        .then(r => {
          r.notifications.filter(note=>!note.is_read&&(note.followup_id||note.event_id)).slice(0,5).forEach(note=>{
            if(shownNotificationIds.current.has(Number(note.id)))return;
            shownNotificationIds.current.add(Number(note.id));
            toast.show(`${note.title}: ${note.message || note.name}`,'reminder',{persistent:true,key:`reminder-${note.id}`,onDismiss:()=>{void api(`/notifications/${note.id}/read`,{method:'PATCH'}).then(()=>setUnread(current=>Math.max(0,current-1)))}});
          });
          setUnread(r.unread);
        })
        .catch(() => {});

    void fetchNotes();
    const id = setInterval(fetchNotes, 30_000);
    return () => clearInterval(id);
  }, [location.pathname]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        globalSearchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const toggleCollapsed = () =>
    setCollapsed(current => {
      localStorage.setItem('gomata_sidebar_collapsed', String(!current));
      return !current;
    });

  const role =
    ({
      ADMIN: 'Administrator',
      MANAGER: 'Manager',
      GRE_EXECUTIVE: 'GRE Executive',
      SALES_EXECUTIVE: 'Sales Executive'
    } as Record<string, string>)[user?.role || ''] || 'CRM User';

  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`${open ? 'sidebar open' : 'sidebar'} ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-head">
          <button
            className="desktop-collapse"
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            onClick={toggleCollapsed}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>
        </div>

        <div className="sidebar-scroll">
          {navGroups.map(group => (
            <div className="nav-group" key={group.label}>
              <div className="module-label">{group.label}</div>
              <nav>
                {group.items.map(([label, to, Icon]) => (
                  <NavLink title={collapsed ? label : undefined} key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}>
                    <Icon />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}
        </div>

        <div className="sidebar-bottom">
          <NavLink title={collapsed ? 'Notifications' : undefined} to="/notifications" onClick={() => setOpen(false)}>
            <Bell />
            <span>Notifications</span>
            {unread > 0 && <b>{unread}</b>}
          </NavLink>
          <NavLink
            title={collapsed ? 'Settings' : undefined}
            to="/settings"
            onClick={() => setOpen(false)}
          >
            <Settings />
            <span>Settings</span>
          </NavLink>
          <div className="user-chip">
            <CircleUserRound />
            <span>
              <strong>{user?.name}</strong>
              <small>{role}</small>
            </span>
          </div>
        </div>
      </aside>

      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}

      <div className="content-wrap">
        <header className="topbar">
          <button
            className="menu-button"
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
          >
            <Menu />
          </button>
          <div className="topbar-title">
            <small>Gomata Vision CRM</small>
            <h2>
              {titles[location.pathname] ||
                (location.pathname.startsWith('/gre/') ? 'Lead Profile' : 'GRE Suite')}
            </h2>
          </div>
          <div className="top-actions">
            <form className="global-search" onSubmit={event=>{event.preventDefault();const value=globalSearch.trim();if(value)navigate(`/gre?search=${encodeURIComponent(value)}`)}}>
              <Search />
              <input ref={globalSearchRef} aria-label="Search leads" placeholder="Search leads…" value={globalSearch} onChange={event=>setGlobalSearch(event.target.value)}/>
              <kbd>⌘ K</kbd>
            </form>
            <button
              className="bell"
              aria-label="Notifications"
              onClick={() => navigate('/notifications')}
            >
              <Bell />
              {unread > 0 && <i>{unread}</i>}
            </button>
            <button className="profile-button" onClick={()=>navigate('/settings')} aria-label="Open profile and settings">
              <CircleUserRound />
              <span>{user?.name?.split(' ')[0] || 'Admin'}</span>
            </button>
            <Brand />
          </div>
        </header>

        <main className="page">
          <Outlet />
        </main>
        <div className="powered-by">
          Powered by <strong>Fortech</strong>
        </div>
      </div>

    </div>
  );
}
