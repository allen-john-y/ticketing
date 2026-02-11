import React, { useState, useRef, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import logo from './sandeza.jpg';

function Toast({ open, type = 'info', message = '' }) {
  const bg =
    type === 'success'
      ? '#27ae60'
      : type === 'error'
      ? '#e74c3c'
      : '#002060'; // company blue for info

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
        fontFamily: 'Open Sans, sans-serif'
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
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setToast({ open: true, type, message });
    hideTimerRef.current = setTimeout(() => {
      setToast(prev => ({ ...prev, open: false }));
      hideTimerRef.current = null;
    }, duration);
  };

  const login = async () => {
    try {
      let loginResponse = null;
      let popupError = null;

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
        showToast('success', 'Login successful', 2000);
        return;
      }

      if (popupError) {
        const msg = String(
          popupError.errorCode ||
            popupError.error ||
            popupError.message ||
            ''
        ).toLowerCase();

        const cancelled =
          msg.includes('cancel') ||
          msg.includes('popup') ||
          msg.includes('user_cancel');

        if (cancelled) return;

        showToast('error', popupError.message || 'Login failed', 3000);
        return;
      }
    } catch (error) {
      showToast('error', error?.message || 'Unexpected error', 3000);
    }
  };

  return (
    <>
      {/* ✅ Importing brand fonts (patched, non-logic change) */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="stylesheet"
        href="sandbox:/fonts.googleapis.com/css2?family=Red+Hat+Display:wght@700;900&family=Open+Sans:wght@400;600;800&display=swap"
      />

      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#002060',
          fontFamily: 'Open Sans, sans-serif',
        }}
      >
        <div
          style={{
            background: 'white',
            padding: '3rem',
            borderRadius: '15px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
            textAlign: 'center',
            maxWidth: '400px',
            width: '100%',
            fontFamily: 'Open Sans, sans-serif',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              marginBottom: 12,
            }}
          >
            <img
              src={logo}
              alt="Sandeza logo"
              style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }}
            />
            {/* ✅ Fixed heading font */}
            <h1
              style={{
                margin: 0,
                fontFamily: 'Red Hat Display, sans-serif',
                fontWeight: 900,
                color: '#002060',
              }}
            >
              SANDEZA INC
            </h1>
          </div>

          <h2
            style={{
              marginBottom: '2rem',
              fontFamily: 'Red Hat Display, sans-serif',
              fontWeight: 900,
              color: '#e98404',
            }}
          >
            IT Ticket Portal
          </h2>

          <button
            onClick={login}
            style={{
              background: '#e98404',
              color: 'white',
              border: 'none',
              padding: '15px 30px',
              borderRadius: '8px',
              fontSize: '1.1rem',
              fontWeight: 600,
              cursor: 'pointer',
              width: '100%',
              fontFamily: 'Open Sans, sans-serif',
            }}
          >
            🔐 Login with Company Account
          </button>

          <p style={{ marginTop: 20, color: '#7f8c8d', fontSize: 14 }}>
            Secure Azure AD Authentication
          </p>
        </div>

        <Toast open={toast.open} type={toast.type} message={toast.message} />
      </div>
    </>
  );
}

export default Login;