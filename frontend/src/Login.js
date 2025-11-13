import React from 'react';
import { useMsal } from '@azure/msal-react';

function Login() {
  const { instance } = useMsal();

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
      // Optional: clear cached accounts to force account picker
      // instance.getAllAccounts().forEach(acc => instance.logoutPopup({ account: acc }));

      // Use popup login so user can pick any account
      let loginResponse;
      try {
        loginResponse = await instance.loginPopup({
          scopes: ['User.Read'],
          prompt: 'select_account', // ✅ forces account picker
        });
      } catch (popupError) {
        console.warn('⚠️ Popup login failed, trying redirect fallback...');
        // loginResponse = await instance.loginRedirect({
        //   scopes: ['User.Read'],
        // });
      }

      console.log('✅ Login success. Accounts:', instance.getAllAccounts());
      alert('✅ Login successful!');
    } catch (error) {
      console.error('❌ LOGIN FAILED:', error);
      console.error('Error Code:', error.errorCode);
      console.error('Error Message:', error.message);
      alert(`❌ LOGIN ERROR: ${error.message}`);
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
    </div>
  );
}

export default Login;
