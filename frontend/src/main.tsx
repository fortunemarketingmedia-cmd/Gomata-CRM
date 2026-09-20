import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/Toast';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { LeadsPage } from './pages/LeadsPage';
import { LeadDetailPage } from './pages/LeadDetailPage';
import { FollowupsPage } from './pages/FollowupsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SalesPipelinePage } from './pages/SalesPipelinePage';
import { PublicLeadFormPage } from './pages/PublicLeadFormPage';
import { CalendarPage } from './pages/CalendarPage';
import { InventoryPage } from './pages/InventoryPage';
import { PlotDetailPage } from './pages/PlotDetailPage';
import { BookingDetailPage } from './pages/BookingDetailPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CampaignsPage } from './pages/CampaignsPage';
import { SiteVisitsPage } from './pages/SiteVisitsPage';
import { ChannelPartnersPage } from './pages/ChannelPartnersPage';
import './styles.css';

function Protected() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="splash">
        <div className="spinner" />
        <strong>GOMATA VISION</strong>
      </div>
    );
  return user ? <AppShell /> : <Navigate to="/login" replace />;
}

function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="splash">
        <div className="spinner" />
      </div>
    );
  return user ? <Navigate to="/" replace /> : <LoginPage />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <ErrorBoundary><Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/qr-lead" element={<PublicLeadFormPage />} />
            <Route path="/lead-capture" element={<PublicLeadFormPage />} />
            <Route path="/lead-form" element={<PublicLeadFormPage />} />

            {/* Protected CRM routes */}
            <Route element={<Protected />}>
              <Route index element={<DashboardPage />} />
              <Route path="gre" element={<LeadsPage />} />
              <Route path="gre/:id" element={<LeadDetailPage />} />
              <Route path="sales-pipeline" element={<SalesPipelinePage />} />
              <Route path="follow-ups" element={<FollowupsPage />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="inventory/plots/:id" element={<PlotDetailPage />} />
              <Route path="inventory/bookings/:id" element={<BookingDetailPage />} />
              <Route path="campaigns" element={<CampaignsPage />} />
              <Route path="site-visits" element={<SiteVisitsPage />} />
              <Route path="channel-partners" element={<ChannelPartnersPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes></ErrorBoundary>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
