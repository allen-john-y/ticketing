import React, { useState, useEffect } from 'react';
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import Login from './Login';
import Home from './Home';
import CreateTicket from './CreateTicket';
import TicketDetails from './TicketDetails';
import Dashboard from './Dashboard';

const pca = new PublicClientApplication({
  auth: {
    clientId: '6541d73a-dbbd-4f74-9465-38a0eb03ec6b',
    authority: 'https://login.microsoftonline.com/11909ab3-5ecc-48e0-b898-acf7203a1ad7',
    redirectUri: 'https://ticketing-psi-tawny.vercel.app/',
  },
  cache: { cacheLocation: 'localStorage' },
});

function Header({ logout }) {
  const { accounts, instance } = useMsal();
  const [showProfile, setShowProfile] = useState(false);
  const [userProfile, setUserProfile] = useState(null);

  // Fetch full profile details from Microsoft Graph
  const fetchProfile = async () => {
    try {
      const tokenResponse = await instance.acquireTokenSilent({
        scopes: ['User.Read.All'],
        account: accounts[0]
      });

      const res = await axios.get(
        `https://graph.microsoft.com/v1.0/me?$select=displayName,mail,mobilePhone,jobTitle,department,employeeId,streetAddress,city,state,postalCode`,
        {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        }
      );

      setUserProfile(res.data);
      setShowProfile(true);
    } catch (err) {
      console.error('Error fetching profile:', err);
    }
  };

  return (
    <header style={{
      background: 'white', padding: '1rem 2rem', boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <h1 style={{ color: '#2c3e50', margin: 0, fontSize: '1.5rem' }}>🏢 SANDEZA INC</h1>
        <h2 style={{ color: '#7f8c8d', margin: 0, fontSize: '1rem' }}>IT Ticket Portal</h2>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          onClick={fetchProfile}
          style={{
            background: '#3498db', color: 'white', border: 'none', padding: '0.5rem 1rem',
            borderRadius: '5px', cursor: 'pointer', fontWeight: '500'
          }}
        >
          View Full Profile
        </button>

        <button
          onClick={logout}
          style={{
            background: '#e74c3c', color: 'white', border: 'none', padding: '0.5rem 1rem',
            borderRadius: '5px', cursor: 'pointer', fontWeight: '500'
          }}
        >
          🚪 Logout
        </button>
      </div>

      {/* Profile Modal */}
      {showProfile && userProfile && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: 'white', padding: '2rem', borderRadius: '10px', width: '400px',
            maxHeight: '80%', overflowY: 'auto', position: 'relative'
          }}>
            <button
              onClick={() => setShowProfile(false)}
              style={{
                position: 'absolute', top: '10px', right: '10px', background: 'transparent',
                border: 'none', fontSize: '1.2rem', cursor: 'pointer'
              }}
            >
              ✕
            </button>

            <h2>User Profile</h2>
            <p><strong>Full Name:</strong> {userProfile.displayName || 'N/A'}</p>
            <p><strong>Email:</strong> {userProfile.mail || 'N/A'}</p>
            <p><strong>Mobile Phone:</strong> {userProfile.mobilePhone || 'N/A'}</p>
            <p><strong>Job Title:</strong> {userProfile.jobTitle || 'N/A'}</p>
            <p><strong>Department:</strong> {userProfile.department || 'N/A'}</p>
            <p><strong>Employee ID:</strong> {userProfile.employeeId || 'N/A'}</p>
            <h3>Address</h3>
            <p><strong>Street:</strong> {userProfile.streetAddress || 'N/A'}</p>
            <p><strong>City:</strong> {userProfile.city || 'N/A'}</p>
            <p><strong>State:</strong> {userProfile.state || 'N/A'}</p>
            <p><strong>Pincode:</strong> {userProfile.postalCode || 'N/A'}</p>
          </div>
        </div>
      )}
    </header>
  );
}

function AppContent() {
  const { instance } = useMsal();

  const handleLogout = () => {
    instance.logoutRedirect({ postLogoutRedirectUri: '/' });
  };

  const handleLogin = async () => {
    try {
      await instance.loginRedirect({
        scopes: ['User.Read', 'GroupMember.Read.All'],
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
