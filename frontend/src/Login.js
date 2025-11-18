import React, { useState } from 'react';
import { useMsal } from '@azure/msal-react';

function Login() {
  const { instance } = useMsal();

  // Modal state used instead of alert()
  const [modal, setModal] = useState({ open: false, title: '', message: '', type: 'info' });

  const closeModal = () => setModal({ open: false, title: '', message: '', type: 'info' });

  const login = async () => {
    console.log('🔍 === LOGIN DEBUG START ===');

    // ✅ Safe config check
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

      // Try popup first (user picks account)
      try {
        loginResponse = await instance.loginPopup({
          scopes: ['User.Read'],
          prompt: 'select_account',
        });
      } catch (err) {
        // popup failed or was closed by user — don't treat this as an automatic "success"
        popupError = err;
        console.warn('⚠️ Popup login error/fallback:', err);
      }

      // Determine if user is now signed in
      const accounts = instance.getAllAccounts() || [];
      const signedIn = Boolean(loginResponse || (accounts.length > 0));

      if (signedIn) {
        console.log('✅ Login success. Accounts:', accounts);
        // Show modal success (instead of alert)
        setModal({
          open: true,
          title: 'Login Successful',
          message: 'You are now signed in.',
          type: 'success'
        });
        return;
      }

      // If not signed in and there was a popupError, decide whether to notify:
      if (popupError) {
        // Treat common popup/cancel cases as user-cancelled and DO NOT show an error modal.
        const msg = String(popupError.errorCode || popupError.error || popupError.message || '').toLowerCase();
        const userCancelled =
          msg.includes('cancel') ||
          msg.includes('popup') || // popup_window_closed_by_user, popup_closed_by_user
          msg.includes('user_cancelled') ||
          msg.includes('user_cancel');

        if (userCancelled) {
          // User closed/cancelled the popup — silently ignore (no modal)
          console.log('ℹ️ User cancelled login popup — no modal shown.');
          return;
        }

        // Otherwise show an error modal
        setModal({
          open: true,
          title: 'Login Failed',
          message: popupError.message || 'An error occurred during login.',
          type: 'error'
        });
        return;
      }

      // If no popupError and still no signedIn, do nothing (silent)
      console.log('ℹ️ Login attempt finished without sign-in. No message shown.');
    } catch (error) {
      // Unexpected error — show error modal
      console.error('❌ LOGIN FAILED (unexpected):', error);
      setModal({
        open: true,
        title: 'Login Error',
        message: error?.message || 'An unexpected error occurred during login.',
        type: 'error'
      });
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
        <h1 style={{ color: '#2c3e50', marginBottom: '1rem' }}>🏢 SANDEZA INC</h1>
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

      {/* Modal used instead of window.alert */}
      {modal.open && (
        <div style={{
          position: "fixed",
          top: 0, left: 0,
          width: "100vw", height: "100vh",
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 10000
        }}>
          <div style={{
            background: "white",
            padding: "24px",
            borderRadius: "10px",
            width: "360px",
            textAlign: "center",
            boxShadow: "0 4px 20px rgba(0,0,0,0.2)"
          }}>
            <h3 style={{ marginBottom: "12px" }}>{modal.title}</h3>
            <p style={{ marginBottom: "20px" }}>{modal.message}</p>
            <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
              <button
                onClick={closeModal}
                style={{
                  padding: "10px 20px",
                  background: modal.type === "success" ? "#27ae60" : "#e74c3c",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer"
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Login;