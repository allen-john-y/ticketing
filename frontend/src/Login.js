import React, { useState, useRef, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import logo from './sandeza.jpg';

/* ─────────────────────────────────────────
   Toast
───────────────────────────────────────── */
function Toast({ open, type = 'info', message = '' }) {
  const colors = {
    success: '#059669',
    error:   '#ef4444',
    info:    '#002060',
  };

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 24,
        left: '50%',
        transform: open ? 'translate(-50%, 0)' : 'translate(-50%, -10px)',
        background: colors[type] || colors.info,
        color: '#fff',
        padding: '10px 20px',
        borderRadius: 7,
        boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
        opacity: open ? 1 : 0,
        pointerEvents: 'none',
        transition: 'opacity 280ms ease, transform 280ms ease',
        zIndex: 9999,
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
      }}
    >
      {message}
    </div>
  );
}

/* ─────────────────────────────────────────
   Login
───────────────────────────────────────── */
function Login() {
  const { instance } = useMsal();

  const [toast,      setToast]      = useState({ open: false, type: 'info', message: '' });
  const [isLoading,  setIsLoading]  = useState(false);
  const hideTimerRef = useRef(null);

  useEffect(() => {
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, []);

  const showToast = (type, message, duration = 2200) => {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    setToast({ open: true, type, message });
    hideTimerRef.current = setTimeout(() => {
      setToast(prev => ({ ...prev, open: false }));
      hideTimerRef.current = null;
    }, duration);
  };

  const login = async () => {
    setIsLoading(true);
    try {
      let loginResponse = null;
      let popupError    = null;

      try {
        loginResponse = await instance.loginPopup({
          scopes: ['User.Read'],
          prompt: 'select_account',
        });
      } catch (err) {
        popupError = err;
        console.warn('Login popup error:', err);
      }

      const accounts = instance.getAllAccounts() || [];
      const signedIn = Boolean(loginResponse || accounts.length > 0);

      if (signedIn) {
        showToast('success', 'Login successful');
        return;
      }

      if (popupError) {
        const msg = String(
          popupError.errorCode || popupError.error || popupError.message || ''
        ).toLowerCase();

        const cancelled =
          msg.includes('cancel') ||
          msg.includes('popup')  ||
          msg.includes('user_cancel');

        if (cancelled) return;

        showToast('error', popupError.message || 'Login failed', 3000);
        return;
      }
    } catch (error) {
      showToast('error', error?.message || 'Unexpected error', 3000);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .ln-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #002060;
          font-family: 'DM Sans', sans-serif;
          position: relative;
          overflow: hidden;
        }

        /* subtle background texture */
        .ln-root::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 80% 60% at 20% 30%, rgba(233,132,4,0.07) 0%, transparent 65%),
            radial-gradient(ellipse 60% 50% at 80% 80%, rgba(255,255,255,0.04) 0%, transparent 60%);
          pointer-events: none;
        }

        /* grid dot pattern */
        .ln-root::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px);
          background-size: 28px 28px;
          pointer-events: none;
        }

        /* ── Card ── */
        .ln-card {
          position: relative;
          z-index: 1;
          background: #fff;
          border-radius: 12px;
          border: 1px solid #d9d5cc;
          padding: 2.75rem 2.5rem 2.5rem;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 24px 64px rgba(0,0,0,0.22);
        }

        /* ── Brand row ── */
        .ln-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 1.5rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid #d9d5cc;
        }

        .ln-brand-logo {
          width: 44px;
          height: 44px;
          border-radius: 8px;
          overflow: hidden;
          flex-shrink: 0;
          border: 1px solid #e5e7eb;
        }
        .ln-brand-logo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .ln-brand-name {
          font-size: 18px;
          font-weight: 600;
          color: #111827;
          letter-spacing: -0.01em;
          line-height: 1.1;
        }

        .ln-brand-sub {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #9ca3af;
          margin-top: 3px;
        }

        /* ── Body ── */
        .ln-body {
          margin-bottom: 1.75rem;
        }

        .ln-heading {
          font-size: 22px;
          font-weight: 600;
          color: #111827;
          letter-spacing: -0.02em;
          margin-bottom: 6px;
          line-height: 1.2;
        }

        .ln-subheading {
          font-size: 13px;
          color: #6b7280;
          line-height: 1.5;
        }

        /* ── Login button ── */
        .ln-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 13px 20px;
          border-radius: 7px;
          border: none;
          background: #111827;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
          letter-spacing: 0.01em;
          margin-bottom: 1rem;
        }
        .ln-btn:hover:not(:disabled) {
          background: #1f2937;
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(0,0,0,0.14);
        }
        .ln-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
        }

        /* Microsoft icon inside button */
        .ln-btn-icon {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
        }

        /* ── Footer note ── */
        .ln-footer-note {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: 12px;
          color: #9ca3af;
        }

        .ln-footer-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #e98404;
          flex-shrink: 0;
        }

        /* ── Accent bar at top of card ── */
        .ln-accent-bar {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, #002060, #e98404);
          border-radius: 12px 12px 0 0;
        }

        /* loading spinner */
        @keyframes ln-spin {
          to { transform: rotate(360deg); }
        }
        .ln-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: ln-spin 0.7s linear infinite;
          flex-shrink: 0;
        }

        @media (max-width: 480px) {
          .ln-card {
            margin: 1rem;
            padding: 2rem 1.5rem;
          }
        }
      `}</style>

      <div className="ln-root">
        <div className="ln-card">

          {/* accent bar */}
          <div className="ln-accent-bar" />

          {/* Brand */}
          <div className="ln-brand">
            <div className="ln-brand-logo">
              <img src={logo} alt="Sandeza" />
            </div>
            <div>
              <div className="ln-brand-name">Sandeza Inc</div>
              <div className="ln-brand-sub">IT Ticket Portal</div>
            </div>
          </div>

          {/* Heading */}
          <div className="ln-body">
            <div className="ln-heading">Sign in to your account</div>
            <div className="ln-subheading">
              Use your company Microsoft account to access the helpdesk portal.
            </div>
          </div>

          {/* Login button */}
          <button className="ln-btn" onClick={login} disabled={isLoading}>
            {isLoading ? (
              <>
                <span className="ln-spinner" />
                Signing in…
              </>
            ) : (
              <>
                {/* Microsoft logo */}
                <svg className="ln-btn-icon" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="1"  y="1"  width="9" height="9" fill="#F25022"/>
                  <rect x="11" y="1"  width="9" height="9" fill="#7FBA00"/>
                  <rect x="1"  y="11" width="9" height="9" fill="#00A4EF"/>
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                </svg>
                Sign in with Microsoft
              </>
            )}
          </button>

          {/* Footer note */}
          <div className="ln-footer-note">
            <div className="ln-footer-dot" />
            Secured by Azure Active Directory
          </div>

        </div>

        <Toast open={toast.open} type={toast.type} message={toast.message} />
      </div>
    </>
  );
}

export default Login;