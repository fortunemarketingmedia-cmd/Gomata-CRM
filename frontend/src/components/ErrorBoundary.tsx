import React from 'react';
import { CircleAlert, RotateCcw } from '../icons';

export class ErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error('CRM page render failed', error); }
  render() {
    if (this.state.failed) return <main className="fatal-page"><div className="card module-error"><CircleAlert/><h1>This page could not be displayed</h1><p>The data may have changed while the development server was reloading. Refresh to reconnect safely.</p><button className="primary" onClick={()=>window.location.reload()}><RotateCcw/>Refresh page</button></div></main>;
    return this.props.children;
  }
}
