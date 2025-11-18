import React, { useState, useRef, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import logo from './sandeza.jpg';

function Toast({ open, type = 'info', message = '' }) {
  const bg = type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db';

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

  // toast state and timer ref
  const [toast, setToast] = useState({ open: false, type: 'info', message: '' });
  const hideTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const showToast = (type, message, duration = 2000) => {
    // clear any existing hide timer
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    setToast({ open: true, type, message });

    // hide after duration (fade out)
    hideTimerRef.current = setTimeout(() => {
      setToast(prev => ({ ...prev, open: false }));
      hideTimerRef.current = null;
    }, duration);
  };

  const login = async () => {
    console.log('🔍 === LOGIN DEBUG START ===');

    if (instance && instance.config && instance.config.auth) {
      console.log('Client ID:', instance.config.auth.clientId);
      console.log('Authority:', instance.config.auth.authority);
      console.log('Redirect URI:', instance.config.auth.redirectUri);
    } else {
      console.warn('⚠️ MSAL instance not ready yet.');
    }

    try {
      let loginResponse = null;
      let popupError = null;

      // Try popup
      try {
        loginResponse = await instance.loginPopup({
          scopes: ['User.Read'],
          prompt: 'select_account',
        });
        console.log('loginPopup returned:', loginResponse);
      } catch (err) {
        popupError = err;
        console.warn('⚠️ Popup login error/fallback:', err);
      }

      // Check sign-in state
      const accounts = instance.getAllAccounts() || [];
      const signedIn = Boolean(loginResponse || (accounts.length > 0));

      if (signedIn) {
        console.log('✅ Login success. Accounts:', accounts);
        // show small fading toast, do NOT navigate away
        showToast('success', 'Login successful', 2000);
        return;
      }

      // If popup had an error, check if user cancelled (silently ignore)
      if (popupError) {
        const msg = String(popupError.errorCode || popupError.error || popupError.message || '').toLowerCase();
        const userCancelled =
          msg.includes('cancel') ||
          msg.includes('popup') || // popup_window_closed_by_user, popup_closed_by_user
          msg.includes('user_cancelled') ||
          msg.includes('user_cancel');

        if (userCancelled) {
          console.log('ℹ️ User cancelled login popup — no toast shown.');
          return;
        }

        // Otherwise show error toast
        console.error('❌ Login error:', popupError);
        showToast('error', popupError.message || 'Login failed', 3000);
        return;
      }

      // No popup error and not signed in -> silent finish, no toast
      console.log('ℹ️ Login attempt finished without sign-in. No toast shown.');
    } catch (error) {
      console.error('❌ LOGIN FAILED (unexpected):', error);
      showToast('error', error?.message || 'An unexpected error occurred during login.', 3000);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 12 }}>
          <img
            src={logo}
            alt="Sandeza logo"
            style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }}
          />
          <h1 style={{ color: '#2c3e50', margin: 0 }}>SANDEZA INC</h1>
        </div>
        <h2 style={{ color: '#7f8c8d', marginBottom: '2rem' }}>IT Ticket Portal</h2>
        <button
          onClick={login}
          style={{
            background: '#3498db',
            color: 'white',
            border: 'none',
            padding: '15px 30px',
            borderRadius: '8px',
            fontSize: '1.1rem',
            fontWeight: '600',
            cursor: 'pointer',
            width: '100%',
          }}
        >
          🔐 Login with Company Account
        </button>
        <p style={{ marginTop: '1.5rem', color: '#7f8c8d', fontSize: '0.9rem' }}>
          Secure Azure AD Authentication
        </p>
      </div>

      <Toast open={toast.open} type={toast.type} message={toast.message} />
    </div>
  );
}

export default Login;