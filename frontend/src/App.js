import React, { useState, useRef, useEffect } from 'react';
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react';
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Login from './Login';
import Home from './Home';
import CreateTicket from './CreateTicket';
import TicketDetails from './TicketDetails';
import Dashboard from './Dashboard';
import logo from './sandeza.jpg';
import gearIcon from './GearIcon.jpg';

const HELP_DESK_GROUP_ID = '15c0ecc6-c32a-4b38-9f21-6f394d01d70a';

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
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);
  const [fullProfileOpen, setFullProfileOpen] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [profilePhoto, setProfilePhoto] = useState(null);

  // admin states
  const [isAdmin, setIsAdmin] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Add user modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedSearchUser, setSelectedSearchUser] = useState(null);
  const [addLoading, setAddLoading] = useState(false);
  const [addMessage, setAddMessage] = useState(null);
  const [addError, setAddError] = useState(null);

  // Remove user modal
  const [removeModalOpen, setRemoveModalOpen] = useState(false);
  const [groupMembers, setGroupMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [removeMessage, setRemoveMessage] = useState(null);
  const [removeError, setRemoveError] = useState(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // fetch small profile photo silently
  useEffect(() => {
    const fetchPhotoSilently = async () => {
      if (!accounts || !accounts[0]) return;
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: ['User.Read'],
          account: accounts[0],
        });

        const photoRes = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` },
        });

        if (!photoRes.ok) return;

        const arrayBuffer = await photoRes.arrayBuffer();
        const u8 = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < u8.length; i += chunkSize) {
          const slice = u8.subarray(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, slice);
        }
        const b64 = btoa(binary);
        const contentType = photoRes.headers.get('content-type') || 'image/jpeg';
        setProfilePhoto(`data:${contentType};base64,${b64}`);
      } catch (err) {
        // silent fail
      }
    };

    fetchPhotoSilently();
  }, [accounts, instance]);

  // check whether current user belongs to Helpdesk_Admin
  useEffect(() => {
    let cancelled = false;

    const checkMembership = async () => {
      if (!accounts || !accounts[0]) {
        setIsAdmin(false);
        return;
      }
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: ['GroupMember.Read.All'],
          account: accounts[0],
        });
        const token = tokenResponse.accessToken;

        // Use checkMemberGroups to test membership
        const res = await fetch('https://graph.microsoft.com/v1.0/me/checkMemberGroups', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupIds: [HELP_DESK_GROUP_ID] }),
        });

        if (res.ok) {
          const json = await res.json();
          const member = Array.isArray(json.value) && json.value.includes(HELP_DESK_GROUP_ID);
          if (!cancelled) setIsAdmin(!!member);
          return;
        }

        // fallback: /me/memberOf
        const fallback = await fetch('https://graph.microsoft.com/v1.0/me/memberOf?$select=id,displayName', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (fallback.ok) {
          const j = await fallback.json();
          const found = Array.isArray(j.value) && j.value.some(g => g.id === HELP_DESK_GROUP_ID);
          if (!cancelled) setIsAdmin(!!found);
        } else {
          if (!cancelled) setIsAdmin(false);
        }
      } catch (err) {
        if (err instanceof InteractionRequiredAuthError) {
          instance.acquireTokenRedirect({
            scopes: ['GroupMember.Read.All'],
            account: accounts[0],
          });
        } else {
          console.error('membership check failed', err);
          if (!cancelled) setIsAdmin(false);
        }
      }
    };

    checkMembership();
    return () => { cancelled = true; };
  }, [accounts, instance]);

  // Helper: acquire token with required scopes for admin actions (interactive redirect if required)
  const acquireTokenForAdmin = async () => {
    if (!accounts || !accounts[0]) throw new Error('No signed-in account');
    try {
      const resp = await instance.acquireTokenSilent({
        scopes: ['Group.ReadWrite.All', 'User.Read.All'],
        account: accounts[0],
      });
      return resp.accessToken;
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        // request interactive consent for elevated scopes
        await instance.acquireTokenRedirect({
          scopes: ['Group.ReadWrite.All', 'User.Read.All'],
          account: accounts[0],
        });
        throw new Error('Redirecting for consent');
      }
      throw err;
    }
  };

  // --- ADD USER FLOW ---

  const openAddModal = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSelectedSearchUser(null);
    setAddMessage(null);
    setAddError(null);
    setAddModalOpen(true);
  };

  const closeAddModal = () => {
    setAddModalOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedSearchUser(null);
    setAddMessage(null);
    setAddError(null);
    setAddLoading(false);
    setSearchLoading(false);
  };

  const performSearch = async () => {
    setSearchResults([]);
    setSearchLoading(true);
    setAddError(null);
    try {
      const token = await acquireTokenForAdmin();

      const q = (searchQuery || '').trim();
      if (!q) {
        setAddError('Enter email, UPN or name to search');
        setSearchLoading(false);
        return;
      }

      // Try exact user by UPN or ID first
      const tryExact = async (identifier) => {
        const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(identifier)}?$select=id,displayName,mail,userPrincipalName`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.ok) {
          const j = await r.json();
          return [j];
        }
        return [];
      };

      let results = [];

      // If query contains '@', try exact lookup first
      if (q.includes('@')) {
        results = await tryExact(q);
      }

      // If none found or not an email, fallback to searching by startswith on mail/userPrincipalName/displayName
      if (results.length === 0) {
        // Use OData startswith for partial searches (encode the query)
        // const filterParts = [
        //   `startswith(tolower(mail),'${encodeURIComponent(q.toLowerCase())}')`,
        //   `startswith(tolower(userPrincipalName),'${encodeURIComponent(q.toLowerCase())}')`,
        //   `startswith(tolower(displayName),'${encodeURIComponent(q.toLowerCase())}')`,
        // ];
        //const filter = filterParts.join(' or ');
        // Graph may not like encodeURIComponent in the filter terms for single quotes; build carefully
        const safeQ = q.replace(/'/g, "''"); // escape single quotes by doubling
        const realFilter = `startswith(tolower(mail),'${safeQ.toLowerCase()}') or startswith(tolower(userPrincipalName),'${safeQ.toLowerCase()}') or startswith(tolower(displayName),'${safeQ.toLowerCase()}')`;

        const r = await fetch(`https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(realFilter)}&$select=id,displayName,mail,userPrincipalName&$top=10`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.ok) {
          const j = await r.json();
          if (Array.isArray(j.value)) results = j.value;
        } else {
          // As a last resort, try /users?$search (requires indexing and query param) - omitted for simplicity
        }
      }

      // normalize results to include id, displayName, mail, userPrincipalName
      const normalized = (results || []).map(u => ({
        id: u.id,
        displayName: u.displayName || u.userPrincipalName || u.mail || '(no name)',
        mail: u.mail || '',
        userPrincipalName: u.userPrincipalName || '',
      }));

      setSearchResults(normalized);
      if (normalized.length === 0) setAddError('No users found for that query.');
    } catch (err) {
      if (err.message && err.message.includes('Redirecting for consent')) {
        setAddError('Consent required. Redirecting to sign-in.');
      } else {
        console.error('search failed', err);
        setAddError(err.message || 'Search failed.');
      }
    } finally {
      setSearchLoading(false);
    }
  };

  const confirmAddUser = async () => {
    if (!selectedSearchUser) {
      setAddError('Select a user to add.');
      return;
    }
    setAddLoading(true);
    setAddMessage(null);
    setAddError(null);
    try {
      const token = await acquireTokenForAdmin();

      // POST /groups/{id}/members/$ref
      const body = {
        "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${selectedSearchUser.id}`,
      };

      const res = await fetch(`https://graph.microsoft.com/v1.0/groups/${HELP_DESK_GROUP_ID}/members/$ref`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok || res.status === 204) {
        setAddMessage(`${selectedSearchUser.displayName} has been added to Helpdesk_Admin`);
        // notify backend to send emails to actor and target
        notifyServerAboutAdd(selectedSearchUser).catch(e => console.error('notify failed', e));
        // optimistic: set current user as admin updated if they got added
        // keep modal open so admin can see message; clear selection
        setSelectedSearchUser(null);
        setSearchResults([]);
        // Optionally refresh membership checks in app
        // re-check membership for current user
        // (if the actor added themselves, the isAdmin state might already be true)
      } else {
        const text = await res.text();
        setAddError(`Add failed: ${res.status} ${text}`);
      }
    } catch (err) {
      console.error('add user failed', err);
      setAddError(err.message || 'Add failed');
    } finally {
      setAddLoading(false);
    }
  };

  // Sends a notification request to your server (server.js) to dispatch emails.
  // server endpoints to implement later by you:
  // POST /api/notify-admin-added  payload: { actor: {id,name,mail}, target: {id,name,mail} }
  // POST /api/notify-admin-removed payload: { actor: {...}, target: {...} }
  const notifyServerAboutAdd = async (targetUser) => {
    try {
      const actor = {
        id: accounts?.[0]?.homeAccountId || '',
        name: accounts?.[0]?.name || accounts?.[0]?.username || '',
        mail: accounts?.[0]?.username || accounts?.[0]?.username || '',
      };
      await fetch('/api/notify-admin-added', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor,
          target: {
            id: targetUser.id,
            name: targetUser.displayName,
            mail: targetUser.mail || targetUser.userPrincipalName,
          },
        }),
      });
    } catch (err) {
      // don't block UI if notify fails; just log
      console.error('notify server error', err);
    }
  };

  // --- REMOVE USER FLOW ---

  const openRemoveModal = async () => {
    setRemoveModalOpen(true);
    setMembersLoading(true);
    setGroupMembers([]);
    setSelectedMember(null);
    setRemoveMessage(null);
    setRemoveError(null);

    try {
      const token = await acquireTokenForAdmin();
      // list members
      const res = await fetch(`https://graph.microsoft.com/v1.0/groups/${HELP_DESK_GROUP_ID}/members?$select=id,displayName,mail,userPrincipalName&$top=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch members: ${res.status}`);
      }
      const j = await res.json();
      const members = (Array.isArray(j.value) ? j.value : []).map(m => ({
        id: m.id,
        displayName: m.displayName || m.userPrincipalName || m.mail || '(no name)',
        mail: m.mail || '',
        userPrincipalName: m.userPrincipalName || '',
      }));
      setGroupMembers(members);
    } catch (err) {
      console.error('fetch members failed', err);
      setRemoveError(err.message || 'Failed to load members');
    } finally {
      setMembersLoading(false);
    }
  };

  const closeRemoveModal = () => {
    setRemoveModalOpen(false);
    setGroupMembers([]);
    setSelectedMember(null);
    setRemoveMessage(null);
    setRemoveError(null);
    setMembersLoading(false);
    setRemoveLoading(false);
  };

  const confirmRemoveUser = async () => {
    if (!selectedMember) {
      setRemoveError('Select a user to remove.');
      return;
    }
    setRemoveLoading(true);
    setRemoveMessage(null);
    setRemoveError(null);
    try {
      const token = await acquireTokenForAdmin();

      const res = await fetch(`https://graph.microsoft.com/v1.0/groups/${HELP_DESK_GROUP_ID}/members/${selectedMember.id}/$ref`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok || res.status === 204) {
        setRemoveMessage(`${selectedMember.displayName} has been removed from Helpdesk_Admin`);
        notifyServerAboutRemove(selectedMember).catch(e => console.error('notify failed', e));
        // refresh members list
        setGroupMembers(prev => prev.filter(m => m.id !== selectedMember.id));
        setSelectedMember(null);
      } else {
        const text = await res.text();
        setRemoveError(`Remove failed: ${res.status} ${text}`);
      }
    } catch (err) {
      console.error('remove failed', err);
      setRemoveError(err.message || 'Remove failed');
    } finally {
      setRemoveLoading(false);
    }
  };

  const notifyServerAboutRemove = async (targetUser) => {
    try {
      const actor = {
        id: accounts?.[0]?.homeAccountId || '',
        name: accounts?.[0]?.name || accounts?.[0]?.username || '',
        mail: accounts?.[0]?.username || accounts?.[0]?.username || '',
      };
      await fetch('/api/notify-admin-removed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor,
          target: {
            id: targetUser.id,
            name: targetUser.displayName,
            mail: targetUser.mail || targetUser.userPrincipalName,
          },
        }),
      });
    } catch (err) {
      console.error('notify server error', err);
    }
  };

  const fetchFullProfile = async () => {
    if (!accounts || !accounts[0]) return;
    setLoadingProfile(true);
    setProfileError(null);

    try {
      const response = await instance.acquireTokenSilent({
        scopes: ['User.Read', 'User.ReadBasic.All'],
        account: accounts[0],
      });

      const token = response.accessToken;
      const graphRes = await fetch(
        'https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName,department,employeeId,mobilePhone,streetAddress,state,postalCode,jobTitle',
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!graphRes.ok) throw new Error(`Graph ${graphRes.status}`);

      const data = await graphRes.json();

      setProfileData({
        name: data.displayName || '',
        email: data.mail || data.userPrincipalName || '',
        department: data.department || '',
        employeeId: data.employeeId || '',
        mobilePhone: data.mobilePhone || '',
        streetAddress: data.streetAddress || '',
        state: data.state || '',
        postalCode: data.postalCode || '',
        jobTitle: data.jobTitle || '',
      });

      try {
        const photoRes = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (photoRes.ok) {
          const arrayBuffer = await photoRes.arrayBuffer();
          const u8 = new Uint8Array(arrayBuffer);
          let binary = '';
          const chunkSize = 0x8000;
          for (let i = 0; i < u8.length; i += chunkSize) {
            const slice = u8.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, slice);
          }
          const b64 = btoa(binary);
          const contentType = photoRes.headers.get('content-type') || 'image/jpeg';
          setProfilePhoto(`data:${contentType};base64,${b64}`);
        }
      } catch {}
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        instance.acquireTokenRedirect({
          scopes: ['User.Read', 'User.ReadBasic.All'],
          account: accounts[0],
        });
      } else {
        setProfileError(err.message);
      }
    } finally {
      setLoadingProfile(false);
    }
  };

  const openFullProfile = () => {
    setFullProfileOpen(true);
    setProfileData(null);
    fetchFullProfile();
  };

  const closeFullProfile = () => {
    setFullProfileOpen(false);
    setProfileError(null);
  };

  const initials = (accounts?.[0]?.name || accounts?.[0]?.username || 'U')
    .split(' ')
    .map(s => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      <header
        style={{
          background: 'white',
          padding: '14px 20px',
          borderBottom: '1px solid rgba(15,23,42,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        {/* LEFT LOGO BLOCK */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img
            src={logo}
            alt="Sandeza logo"
            style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1
                style={{
                  color: '#0f172a',
                  margin: 0,
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  letterSpacing: 0.2,
                }}
              >
                SANDEZA INC
              </h1>
            </div>
            <div style={{ color: '#6b7280', fontSize: 12 }}>IT Ticket Portal</div>
          </div>
        </div>

        {/* CENTER TITLE */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            textAlign: 'center',
            pointerEvents: 'none',
            animation: 'floatGlow 3s ease-in-out infinite',
          }}
        >
          <div
            style={{
              fontSize: '1.15rem',
              fontWeight: 900,
              letterSpacing: '0.5px',
              color: '#0f172a',
              textShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            SANDEZA HELPDESK
          </div>
          <div
            style={{
              fontSize: '0.75rem',
              marginTop: 2,
              fontWeight: 600,
              color: '#64748b',
              letterSpacing: '0.3px',
            }}
          >
            Empowering Support • Every Step
          </div>
        </div>

        {/* RIGHT PROFILE + ADMIN BUTTONS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Add / Remove buttons (only visible to admins) */}
            {isAdmin && (
              <>
                <button
                  onClick={openAddModal}
                  title="Add user to Helpdesk_Admin"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(15,23,42,0.06)',
                    background: 'linear-gradient(180deg,#ffffff,#f1f5f9)',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  <img src={gearIcon} alt="" style={{ width: 16, height: 16, opacity: 0.9 }} />
                  Add user
                </button>

                <button
                  onClick={openRemoveModal}
                  title="Remove user from Helpdesk_Admin"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(15,23,42,0.06)',
                    background: 'linear-gradient(180deg,#ffffff,#fff1f2)',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  <img src={gearIcon} alt="" style={{ width: 16, height: 16, opacity: 0.9, transform: 'rotate(20deg)' }} />
                  Remove user
                </button>
              </>
            )}

            {/* settings gear (small) */}
            {isAdmin && (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setSettingsOpen(s => !s)}
                  aria-label="Settings"
                  title="Admin quick"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    border: '1px solid rgba(15,23,42,0.06)',
                    background: settingsOpen ? '#eef2ff' : 'linear-gradient(180deg,#ffffff,#fbfdff)',
                    cursor: 'pointer',
                    boxShadow: '0 6px 18px rgba(2,6,23,0.04)',
                    color: '#374151',
                  }}
                >
                  <img src={gearIcon} alt="Settings" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                </button>

                {settingsOpen && (
                  <div
                    role="menu"
                    aria-label="Admin settings"
                    style={{
                      position: 'absolute',
                      right: 0,
                      marginTop: 8,
                      background: 'white',
                      border: '1px solid rgba(15,23,42,0.06)',
                      borderRadius: 8,
                      boxShadow: '0 12px 40px rgba(2,6,23,0.12)',
                      padding: 10,
                      width: 220,
                      zIndex: 60,
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>Admin Settings</div>

                    <button
                      onClick={() => { openAddModal(); setSettingsOpen(false); }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        padding: '8px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        color: '#0f172a',
                        fontWeight: 700,
                      }}
                    >
                      Add user
                    </button>

                    <button
                      onClick={() => { openRemoveModal(); setSettingsOpen(false); }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        padding: '8px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        color: '#0f172a',
                        fontWeight: 700,
                      }}
                    >
                      Remove user
                    </button>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                      <button
                        onClick={() => setSettingsOpen(false)}
                        style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer' }}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PROFILE BUTTON */}
            <div ref={profileRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setProfileOpen(prev => !prev)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: '1px solid rgba(15,23,42,0.06)',
                  background: 'linear-gradient(180deg,#ffffff,#fbfdff)',
                  cursor: 'pointer',
                  boxShadow: '0 6px 18px rgba(2,6,23,0.06)',
                }}
                aria-haspopup="true"
                aria-expanded={profileOpen}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: '#eef2ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    color: '#3730a3',
                    fontSize: 14,
                    flexShrink: 0,
                    overflow: 'hidden',
                  }}
                >
                  {profilePhoto ? (
                    <img
                      src={profilePhoto}
                      alt="profile"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                    {accounts?.[0]?.name || accounts?.[0]?.username}
                  </span>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>
                    {accounts?.[0]?.username}
                  </span>
                </div>

                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M6 8l4 4 4-4"
                    stroke="#374151"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              {profileOpen && (
                <div
                  role="menu"
                  aria-label="Profile menu"
                  style={{
                    position: 'absolute',
                    right: 0,
                    marginTop: 10,
                    background: 'white',
                    border: '1px solid rgba(15,23,42,0.06)',
                    borderRadius: 10,
                    boxShadow: '0 12px 40px rgba(2,6,23,0.12)',
                    padding: 12,
                    width: 300,
                    zIndex: 60,
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 12,
                        background: '#eef2ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        color: '#3730a3',
                        overflow: 'hidden',
                      }}
                    >
                      {profilePhoto ? (
                        <img
                          src={profilePhoto}
                          alt="profile"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      ) : (
                        <span style={{ fontSize: 18 }}>{initials}</span>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, color: '#0f172a' }}>
                        {accounts?.[0]?.name || 'Unknown'}
                      </div>
                      <div style={{ color: '#6b7280', fontSize: 13 }}>
                        {accounts?.[0]?.username}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                      onClick={() => {
                        openFullProfile();
                        setProfileOpen(false);
                      }}
                      style={{
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        padding: '10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontWeight: 700,
                        color: '#2563eb',
                      }}
                    >
                      View Full Profile
                    </button>

                    <button
                      onClick={logout}
                      style={{
                        textAlign: 'left',
                        background: '#d91515ff',
                        border: 'none',
                        padding: '10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        color: 'white',
                        fontWeight: 700,
                      }}
                    >
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ADD USER MODAL */}
      {addModalOpen && (
        <>
          <div
            onClick={closeAddModal}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 90,
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'white',
              borderRadius: '10px',
              padding: '18px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
              width: '560px',
              zIndex: 100,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Add user to Helpdesk_Admin</h3>
              <button onClick={closeAddModal} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                ✖
              </button>
            </div>

            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>
              Search users by email / UPN / name and select a person to grant admin rights.
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by email, UPN or name"
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(15,23,42,0.08)',
                  outline: 'none',
                  flex: 1,
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') performSearch(); }}
              />
              <button
                onClick={performSearch}
                disabled={searchLoading}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  background: '#0369a1',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                {searchLoading ? 'Searching…' : 'Search'}
              </button>
            </div>

            <div style={{ maxHeight: 240, overflow: 'auto', marginBottom: 8 }}>
              {searchResults.length === 0 && !searchLoading && <div style={{ color: '#6b7280' }}>No results</div>}
              {searchResults.map(u => (
                <div
                  key={u.id}
                  onClick={() => setSelectedSearchUser(u)}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    marginBottom: 8,
                    background: selectedSearchUser?.id === u.id ? '#eef2ff' : '#fff',
                    border: '1px solid rgba(15,23,42,0.04)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{u.displayName}</div>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>{u.mail || u.userPrincipalName}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{u.id}</div>
                </div>
              ))}
            </div>

            {addMessage && <div style={{ padding: 10, background: '#ecfdf5', color: '#065f46', borderRadius: 8 }}>{addMessage}</div>}
            {addError && <div style={{ padding: 10, background: '#fff1f2', color: '#9f1239', borderRadius: 8 }}>{addError}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button onClick={closeAddModal} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={confirmAddUser}
                disabled={addLoading || !selectedSearchUser}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: addLoading ? '#9ec7df' : '#0b79bf',
                  color: 'white',
                  border: 'none',
                  cursor: addLoading ? 'default' : 'pointer',
                  fontWeight: 700,
                }}
              >
                {addLoading ? 'Adding…' : 'Add as admin'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* REMOVE USER MODAL */}
      {removeModalOpen && (
        <>
          <div
            onClick={closeRemoveModal}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 90,
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'white',
              borderRadius: '10px',
              padding: '18px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
              width: '560px',
              zIndex: 100,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Remove user from Helpdesk_Admin</h3>
              <button onClick={closeRemoveModal} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                ✖
              </button>
            </div>

            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>
              Select an existing Helpdesk_Admin member to remove their admin rights.
            </div>

            <div style={{ maxHeight: 300, overflow: 'auto', marginBottom: 8 }}>
              {membersLoading && <div style={{ color: '#6b7280' }}>Loading members…</div>}
              {!membersLoading && groupMembers.length === 0 && <div style={{ color: '#6b7280' }}>No members found.</div>}
              {groupMembers.map(m => (
                <div
                  key={m.id}
                  onClick={() => setSelectedMember(m)}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    marginBottom: 8,
                    background: selectedMember?.id === m.id ? '#fff1f2' : '#fff',
                    border: '1px solid rgba(15,23,42,0.04)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{m.displayName}</div>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>{m.mail || m.userPrincipalName}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{m.id}</div>
                </div>
              ))}
            </div>

            {removeMessage && <div style={{ padding: 10, background: '#ecfdf5', color: '#065f46', borderRadius: 8 }}>{removeMessage}</div>}
            {removeError && <div style={{ padding: 10, background: '#fff1f2', color: '#9f1239', borderRadius: 8 }}>{removeError}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button onClick={closeRemoveModal} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={confirmRemoveUser}
                disabled={removeLoading || !selectedMember}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: removeLoading ? '#f7a6a6' : '#ef4444',
                  color: 'white',
                  border: 'none',
                  cursor: removeLoading ? 'default' : 'pointer',
                  fontWeight: 700,
                }}
              >
                {removeLoading ? 'Removing…' : 'Remove admin'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* FULL PROFILE MODAL */}
      {fullProfileOpen && (
        <>
          <div
            onClick={closeFullProfile}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 50,
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'white',
              borderRadius: '10px',
              padding: '20px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
              width: '420px',
              zIndex: 60,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <h3 style={{ margin: 0 }}>Full Profile</h3>
              <button
                onClick={closeFullProfile}
                aria-label="Close profile"
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.1rem',
                  cursor: 'pointer',
                }}
              >
                ✖
              </button>
            </div>

            {/* Photo */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 12,
                  background: '#eef2ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  color: '#3730a3',
                  overflow: 'hidden',
                }}
              >
                {profilePhoto ? (
                  <img
                    src={profilePhoto}
                    alt="profile"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <span style={{ fontSize: 20 }}>{initials}</span>
                )}
              </div>

              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>
                  {accounts?.[0]?.name || ''}
                </div>
                <div style={{ color: '#6b7280', fontSize: 13 }}>
                  {accounts?.[0]?.username || ''}
                </div>
              </div>
            </div>

            {loadingProfile && <p>Loading profile…</p>}

            {profileError && (
              <div style={{ color: 'crimson', marginBottom: '8px' }}>
                <p style={{ margin: 0 }}>Error loading profile:</p>
                <small>{profileError}</small>
              </div>
            )}

            {profileData && (
              <div style={{ display: 'grid', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Name</div>
                  <div style={{ fontWeight: 600 }}>{profileData.name || '—'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Email</div>
                  <div style={{ fontWeight: 600 }}>{profileData.email || '—'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Department</div>
                  <div style={{ fontWeight: 600 }}>{profileData.department || '—'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Job Title</div>
                  <div style={{ fontWeight: 600 }}>{profileData.jobTitle || '—'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Employee ID</div>
                  <div style={{ fontWeight: 600 }}>{profileData.employeeId || '—'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Mobile</div>
                  <div style={{ fontWeight: 600 }}>{profileData.mobilePhone || '—'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Street Address</div>
                  <div style={{ fontWeight: 600 }}>{profileData.streetAddress || '—'}</div>
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>State</div>
                    <div style={{ fontWeight: 600 }}>{profileData.state || '—'}</div>
                  </div>
                  <div style={{ width: '120px' }}>
                    <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Pincode</div>
                    <div style={{ fontWeight: 600 }}>{profileData.postalCode || '—'}</div>
                  </div>
                </div>
              </div>
            )}

            {!loadingProfile && !profileData && !profileError && (
              <div style={{ textAlign: 'center' }}>
                <small>No profile data available.</small>
              </div>
            )}
          </div>
        </>
      )}
    </>
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
        scopes: ['User.Read', 'User.ReadBasic.All', 'GroupMember.Read.All'],
        prompt: 'select_account',
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

/* ⭐⭐⭐ GLOBAL ANIMATION (ADDED) ⭐⭐⭐ */
<style>
{`
@keyframes floatGlow {
  0% { transform: translateX(-50%) translateY(0); opacity: 0.95; }
  50% { transform: translateX(-50%) translateY(-3px); opacity: 1; }
  100% { transform: translateX(-50%) translateY(0); opacity: 0.95; }
}
`}
</style>