import React, { useState, useEffect } from 'react';
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Login from './Login';
import Home from './Home';
import CreateTicket from './CreateTicket';
import TicketDetails from './TicketDetails';
import Dashboard from './Dashboard';
import axios from 'axios';

const pca = new PublicClientApplication({
  auth: {
    clientId: '6541d73a-dbbd-4f74-9465-38a0eb03ec6b',
    authority: 'https://login.microsoftonline.com/11909ab3-5ecc-48e0-b898-acf7203a1ad7',
    redirectUri: 'https://ticketing-psi-tawny.vercel.app/',
  },
  cache: { cacheLocation: 'localStorage' },
});

// ------------------------------------------------------
// SMALL POPUP MENU (NAME + EMAIL + VIEW FULL PROFILE)
// ------------------------------------------------------
function SmallProfileMenu({ user, onClose, onFullProfile }) {
  return (
    <div style={{
      position: 'absolute',
      top: '70px',
      right: '20px',
      background: 'white',
      padding: '1rem',
      borderRadius: '10px',
      boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
      width: '250px',
      zIndex: 1000
    }}>
      <h3 style={{ margin: '0 0 10px 0' }}>{user?.displayName}</h3>
      <p style={{ margin: '0 0 15px 0', color: '#555' }}>{user?.mail || user?.userPrincipalName}</p>

      <button
        onClick={onFullProfile}
        style={{
          background: '#3498db',
          color: 'white',
          padding: '8px 12px',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          width: '100%',
          marginBottom: '8px'
        }}
      >
        View Full Profile
      </button>

      <button
        onClick={onClose}
        style={{
          background: '#e74c3c',
          color: 'white',
          padding: '8px 12px',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          width: '100%'
        }}
      >
        Close
      </button>
    </div>
  );
}

// ------------------------------------------------------
// FULL PROFILE POPUP (ALL FIELDS)
// ------------------------------------------------------
function FullProfilePopup({ profile, onClose }) {
  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2000,
    }}>
      <div style={{
        background: 'white',
        width: '450px',
        padding: '2rem',
        borderRadius: '12px',
        position: 'relative',
        maxHeight: '90%',
        overflowY: 'auto'
      }}>

        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            fontSize: '1.2rem',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          ✖
        </button>

        <h2 style={{ marginBottom: '1rem', textAlign: 'center' }}>User Profile</h2>

        <p><strong>Full Name:</strong> {profile.displayName}</p>
        <p><strong>Email:</strong> {profile.mail || profile.userPrincipalName}</p>
        <p><strong>Mobile Phone:</strong> {profile.mobilePhone || 'N/A'}</p>
        <p><strong>Job Title:</strong> {profile.jobTitle || 'N/A'}</p>
        <p><strong>Department:</strong> {profile.department || 'N/A'}</p>
        <p><strong>Employee ID:</strong> {profile.employeeId || 'N/A'}</p>

        <h3 style={{ marginTop: '1rem' }}>Address</h3>
        <p><strong>Street:</strong> {profile.streetAddress || 'N/A'}</p>
        <p><strong>State:</strong> {profile.state || 'N/A'}</p>
        <p><strong>Pincode:</strong> {profile.postalCode || 'N/A'}</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------
// HEADER WITH PROFILE BUTTON
// ------------------------------------------------------
function Header({ logout }) {
  const { accounts, instance } = useMsal();
  const [me, setMe] = useState(null);
  const [smallMenu, setSmallMenu] = useState(false);
  const [fullPopup, setFullPopup] = useState(false);

  // Fetch user profile from Graph
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const token = await instance.acquireTokenSilent({
          scopes: ['User.Read', 'Directory.Read.All'],
          account: accounts[0]
        });

        const res = await axios.get('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${token.accessToken}` }
        });

        setMe(res.data);

      } catch (err) {
        console.error('Failed to load profile:', err);
      }
    };

    loadProfile();
  }, [accounts, instance]);

  return (
    <header style={{
      background: 'white',
      padding: '1rem 2rem',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      position: 'relative'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <h1 style={{ color: '#2c3e50', margin: 0, fontSize: '1.5rem' }}>🏢 SANDEZA INC</h1>
        <h2 style={{ color: '#7f8c8d', margin: 0, fontSize: '1rem' }}>IT Ticket Portal</h2>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>

        {/* PROFILE BUTTON */}
        <button
          onClick={() => setSmallMenu(true)}
          style={{
            background: '#2ecc71',
            color: 'white',
            padding: '8px 12px',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          View Profile
        </button>

        {/* LOGOUT BUTTON */}
        <button
          onClick={logout}
          style={{
            background: '#e74c3c',
            color: 'white',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '5px',
            cursor: 'pointer',
            fontWeight: '500'
          }}
        >
          🚪 Logout
        </button>
      </div>

      {/* SMALL PROFILE MENU */}
      {smallMenu && me && (
        <SmallProfileMenu
          user={me}
          onClose={() => setSmallMenu(false)}
          onFullProfile={() => { setSmallMenu(false); setFullPopup(true); }}
        />
      )}

      {/* FULL PROFILE POPUP */}
      {fullPopup && me && (
        <FullProfilePopup
          profile={me}
          onClose={() => setFullPopup(false)}
        />
      )}
    </header>
  );
}

// ------------------------------------------------------
function AppContent() {
  const { instance } = useMsal();

  const handleLogout = () => {
    instance.logoutRedirect({ postLogoutRedirectUri: '/' });
  };

  const handleLogin = async () => {
    try {
      await instance.loginRedirect({
        scopes: ['User.Read', 'Directory.Read.All', 'GroupMember.Read.All'],
        prompt: 'select_account'
      });
    } catch (err) {
      console.error('Login failed:', err);
    }
  };

  return (
    <Router>
      <AuthenticatedTemplate>
        <Header logout={handleLogout} />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<CreateTicket />} />
          <Route path="/ticket/:id" element={<TicketDetails />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </AuthenticatedTemplate>

      <UnauthenticatedTemplate>
        <Login login={handleLogin} />
      </UnauthenticatedTemplate>
    </Router>
  );
}

function App() {
  return (
    <MsalProvider instance={pca}>
      <AppContent />
    </MsalProvider>
  );
}

export default App;
