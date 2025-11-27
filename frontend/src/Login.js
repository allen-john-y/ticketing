import React, { useState, useRef, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import logo from './sandeza.jpg';

function Toast({ open, type = 'info', message = '' }) {
  const bg =
    type === 'success'
      ? '#27ae60'
      : type === 'error'
      ? '#e74c3c'
      : '#3498db';

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 20,
        left: '50%',
        transform: open ? 'translate(-50%, 0)' : 'translate(-50%, -12px)',
        background: bg,
        color: 'white',
        padding: '10px 18px',
        borderRadius: 8,
        boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
        opacity: open ? 1 : 0,
        pointerEvents: 'none',
        transition: 'opacity 300ms ease, transform 300ms ease',
        zIndex: 10001,
      }}
    >
      <div style={{ fontWeight: 600 }}>{message}</div>
    </div>
  );
}

function Login() {
  const { instance } = useMsal();
  const [toast, setToast] = useState({ open: false, type: 'info', message: '' });
  const hideTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const showToast = (type, message, duration = 2000) => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setToast({ open: true, type, message });
    hideTimerRef.current = setTimeout(() => setToast(prev => ({ ...prev, open: false })), duration);
  };

  const login = async () => {
    console.log('🔍 === LOGIN DEBUG START ===');
    try {
      await instance.loginPopup({ scopes: ['User.Read'], prompt: 'select_account' });
      showToast('success', 'Login successful', 2000);
    } catch (err) {
      console.error('❌ Login failed:', err);
      showToast('error', err.message || 'Login failed', 3000);
    }
  };

  return (
    <>
      {/* ✅ APPLY FONTS GLOBALLY IN LOGIN */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Red+Hat+Display:wght@700;900&family=Open+Sans:wght@400;600;800&display=swap" />

      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          fontFamily: 'Open Sans, sans-serif', /* Default for text */
        }}
      >
        <div
          style={{
            background: 'white',
            padding: '3rem',
            borderRadius: 14,
            boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
            textAlign: 'center',
            maxWidth: '380px',
            width: '100%',
            borderTop: '6px solid #002060', /* strong Sandeza blue accent */
            animation: 'fadeIn 0.4s ease-in-out'
          }}
        >
          {/* LOGO + TITLE */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <img
              src={logo}
              alt="Sandeza logo"
              style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 10 }}
            />

            <div style={{ textAlign: 'left', lineHeight: 1 }}>
              {/* ✅ Heading font applied */}
              <h1
                style={{
                  margin: 0,
                  color: '#002060',
                  fontSize: '1.6rem',
                  fontWeight: 900,
                  fontFamily: 'Red Hat Display, sans-serif',
                }}
              >
                SANDEZA INC
              </h1>
              <p style={{ marginTop: 4, color: '#64748b', fontSize: '0.8rem' }}>IT Ticket Portal</p>
            </div>
          </div>

          {/* LOGIN BUTTON */}
          <button
            onClick={login}
            style={{
              background: '#e98404', /* Sandeza Orange */
              color: 'white',
              border: 'none',
              padding: '14px 22px',
              borderRadius: 10,
              fontSize: '1.05rem',
              fontWeight: 700,
              fontFamily: 'Red Hat Display, sans-serif', /* bold button label */
              cursor: 'pointer',
              width: '100%',
              boxShadow: '0 4px 14px rgba(233,132,4,0.22)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 8,
            }}
          >
            🔐 Login with Company Account
          </button>

          <p style={{ marginTop: 16, color: '#64748b', fontSize: '0.85rem' }}>
            Secure Azure AD Authentication
          </p>
        </div>

        {/* Toast */}
        <Toast open={toast.open} type={toast.type} message={toast.message} />
      </div>

      {/* Animation keyframes preserved */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeInZoom { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </>
  );
}

export default Login;
