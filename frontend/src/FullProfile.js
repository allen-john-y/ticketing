import React, { useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import axios from 'axios';

function FullProfile({ onClose }) {
  const { instance, accounts } = useMsal();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: ['User.Read.All']
        });

        const response = await axios.get(
          `https://graph.microsoft.com/v1.0/users/${accounts[0].username}?$select=id,displayName,jobTitle,department,employeeId,streetAddress,state,postalCode,mobilePhone,businessPhones,mail`,
          {
            headers: {
              Authorization: `Bearer ${tokenResponse.accessToken}`
            }
          }
        );

        setProfile(response.data);
      } catch (err) {
        console.error('Error fetching full profile:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [instance, accounts]);

  if (loading) return <div style={overlayStyle}>Loading...</div>;

  if (!profile) return <div style={overlayStyle}>No profile data</div>;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <button onClick={onClose} style={closeButtonStyle}>✖</button>
        <h2>User Profile</h2>
        <p><strong>Full Name:</strong> {profile.displayName}</p>
        <p><strong>Email:</strong> {profile.mail}</p>
        <p><strong>Mobile Phone:</strong> {profile.mobilePhone || 'N/A'}</p>
        <p><strong>Job Title:</strong> {profile.jobTitle || 'N/A'}</p>
        <p><strong>Department:</strong> {profile.department || 'N/A'}</p>
        <p><strong>Employee ID:</strong> {profile.employeeId || 'N/A'}</p>
        <h3>Address</h3>
        <p><strong>Street:</strong> {profile.streetAddress || 'N/A'}</p>
        <p><strong>State:</strong> {profile.state || 'N/A'}</p>
        <p><strong>Pincode:</strong> {profile.postalCode || 'N/A'}</p>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 9999
};

const modalStyle = {
  background: 'white',
  borderRadius: '8px',
  padding: '24px',
  width: '400px',
  maxHeight: '80vh',
  overflowY: 'auto',
  position: 'relative'
};

const closeButtonStyle = {
  position: 'absolute',
  top: '8px',
  right: '8px',
  background: 'transparent',
  border: 'none',
  fontSize: '20px',
  cursor: 'pointer'
};

export default FullProfile;
