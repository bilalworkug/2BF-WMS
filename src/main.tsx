import { StrictMode, Component, type ReactNode, type ErrorInfo } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Error boundary to catch crashes and show a useful message instead of a blank page
class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[2BFC WMS] Uncaught error:', error, info);
  }

  handleReset = () => {
    // Clear stale auth and reload
    localStorage.removeItem('crm_auth');
    window.location.hash = '';
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', backgroundColor: '#f8fafc', padding: '2rem', fontFamily: 'Inter, sans-serif'
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '1rem', padding: '2.5rem',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)', maxWidth: '520px', width: '100%', textAlign: 'center'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
              Application Error
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              Something crashed. This is often caused by a stale login session after a system update.
            </p>
            <div style={{
              backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem',
              padding: '0.75rem 1rem', marginBottom: '1.5rem', textAlign: 'left'
            }}>
              <p style={{ color: '#991b1b', fontSize: '0.75rem', fontFamily: 'monospace', wordBreak: 'break-word' }}>
                {err.message}
              </p>
            </div>
            <button
              onClick={this.handleReset}
              style={{
                backgroundColor: '#d97706', color: 'white', border: 'none', borderRadius: '0.5rem',
                padding: '0.75rem 1.5rem', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
                width: '100%'
              }}
            >
              Clear Session &amp; Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
