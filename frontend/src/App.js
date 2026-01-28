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

const pca = new PublicClientApplication({
  auth: {
    clientId: '6541d73a-dbbd-4f74-9465-38a0eb03ec6b',
    authority: 'https://login.microsoftonline.com/11909ab3-5ecc-48e0-b898-acf7203a1ad7',
    redirectUri: 'https://ticketing-psi-tawny.vercel.app/',
  },
  cache: { cacheLocation: 'localStorage' },
});

// Hard-coded objectId of Helpdesk_Admin (as requested)
const HELP_DESK_GROUP_ID = '15c0ecc6-c32a-4b38-9f21-6f394d01d70a';

function Header({ logout }) {
  const { accounts, instance } = useMsal();

  // profile UI
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [fullProfileOpen, setFullProfileOpen] = useState(false);

  // admin state
  const [isAdmin, setIsAdmin] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // modals
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [removeModalOpen, setRemoveModalOpen] = useState(false);

  // Add modal (search)
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedSearchUser, setSelectedSearchUser] = useState(null);

  // Remove modal (members)
  const [groupMembers, setGroupMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);

  // feedback
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Dismiss profile click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // fetch profile photo as before
  useEffect(() => {
    const fetchPhotoSilently = async () => {
      if (!accounts || !accounts[0]) return;
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: ['User.Read'],
          account: accounts[0]
        });

        const photoRes = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
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
        // ignore
      }
    };

    fetchPhotoSilently();
  }, [accounts, instance]);

  // check if current user is member of Helpdesk_Admin
  useEffect(() => {
    let cancelled = false;
    const checkAdmin = async () => {
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

        // Use checkMemberGroups with the known group id
        const res = await fetch('https://graph.microsoft.com/v1.0/me/checkMemberGroups', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupIds: [HELP_DESK_GROUP_ID] }),
        });

        if (res.ok) {
          const json = await res.json();
          const member = Array.isArray(json.value) && json.value.includes(HELP_DESK_GROUP_ID);
          if (!cancelled) setIsAdmin(!!member);
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
          console.error('Check admin error', err);
          if (!cancelled) setIsAdmin(false);
        }
      }
    };
    checkAdmin();
    return () => { cancelled = true; };
  }, [accounts, instance]);

  // helper: obtain token for Group.ReadWrite.All and User.Read.All (used by client-side Graph calls)
  const acquireTokenForAdminActions = async () => {
    if (!accounts || !accounts[0]) throw new Error('No signed-in account');
    try {
      const tokenResponse = await instance.acquireTokenSilent({
        scopes: ['Group.ReadWrite.All', 'User.Read.All'],
        account: accounts[0],
      });
      return tokenResponse.accessToken;
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        // will redirect and stop current flow
        instance.acquireTokenRedirect({
          scopes: ['Group.ReadWrite.All', 'User.Read.All'],
          account: accounts[0],
        });
        throw new Error('Redirecting for consent');
      }
      throw err;
    }
  };

  // SEARCH users (Add modal) - simple contains on displayName or userPrincipalName
  useEffect(() => {
    const controller = new AbortController();
    if (!searchTerm || searchTerm.trim().length < 2) {
      setSearchResults([]);
      return () => controller.abort();
    }

    const doSearch = async () => {
      setSearchLoading(true);
      setActionError(null);
      try {
        const token = await acquireTokenForAdminActions();
        // Use contains on displayName and userPrincipalName OR mail
        const filter = encodeURIComponent(`contains(displayName,'${searchTerm.trim()}') or contains(userPrincipalName,'${searchTerm.trim()}') or contains(mail,'${searchTerm.trim()}')`);
        const url = `https://graph.microsoft.com/v1.0/users?$filter=${filter}&$select=id,displayName,mail,userPrincipalName&$top=25`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`Search failed ${res.status}`);
        }
        const json = await res.json();
        const items = Array.isArray(json.value) ? json.value : [];
        // sort by displayName relevance and alphabetically
        items.sort((a, b) => {
          const aName = (a.displayName || '').toLowerCase();
          const bName = (b.displayName || '').toLowerCase();
          const at = aName.indexOf(searchTerm.toLowerCase());
          const bt = bName.indexOf(searchTerm.toLowerCase());
          if (at === -1 && bt === -1) return aName.localeCompare(bName);
          if (at === -1) return 1;
          if (bt === -1) return -1;
          return at - bt || aName.localeCompare(bName);
        });
        setSearchResults(items);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error(err);
          setActionError(err.message || 'Search error');
        }
      } finally {
        setSearchLoading(false);
      }
    };

    const t = setTimeout(doSearch, 300); // debounce
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [searchTerm]); // eslint-disable-line

  // LIST members for Remove modal
  const loadGroupMembers = async () => {
    setMembersLoading(true);
    setActionError(null);
    try {
      const token = await acquireTokenForAdminActions();
      const url = `https://graph.microsoft.com/v1.0/groups/${HELP_DESK_GROUP_ID}/members?$select=id,displayName,mail,userPrincipalName&$top=100`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }});
      if (!res.ok) throw new Error(`Failed to list members (${res.status})`);
      const json = await res.json();
      const items = Array.isArray(json.value) ? json.value : [];
      // sort by displayName
      items.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
      setGroupMembers(items);
    } catch (err) {
      console.error(err);
      setActionError(err.message || 'Failed to load members');
    } finally {
      setMembersLoading(false);
    }
  };

  // client-side add selected user to group
  const addSelectedUserToGroup = async () => {
    if (!selectedSearchUser) {
      setActionError('Select a user first');
      return;
    }
    setActionLoading(true);
    setActionMessage(null);
    setActionError(null);
    try {
      // Option A: client-side Graph call
      const token = await acquireTokenForAdminActions();
      const userId = selectedSearchUser.id;
      const addRes = await fetch(`https://graph.microsoft.com/v1.0/groups/${HELP_DESK_GROUP_ID}/members/$ref`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${userId}` }),
      });

      if (!addRes.ok && addRes.status !== 204) {
        const txt = await addRes.text();
        throw new Error(`Add failed: ${addRes.status} ${txt}`);
      }

      setActionMessage(`${selectedSearchUser.displayName || selectedSearchUser.userPrincipalName} added to Helpdesk_Admin`);

      // Notify backend to send emails (recommended)
      // Replace /api/admin/notify with your server endpoint
      try {
        await fetch('/api/admin/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'add',
            actor: { id: accounts?.[0]?.homeAccountId, displayName: accounts?.[0]?.name, upn: accounts?.[0]?.username },
            target: { id: selectedSearchUser.id, displayName: selectedSearchUser.displayName, upn: selectedSearchUser.userPrincipalName || selectedSearchUser.mail }
          })
        });
      } catch (e) {
        // non-fatal - notify backend missing
        console.warn('Backend notify failed (optional)', e);
      }

      // update UI
      setSelectedSearchUser(null);
      setSearchTerm('');
      setSearchResults([]);
    } catch (err) {
      console.error(err);
      setActionError(err.message || 'Failed to add user');
    } finally {
      setActionLoading(false);
    }
  };

  // client-side remove selected member from group
  const removeSelectedMemberFromGroup = async () => {
    if (!selectedMember) {
      setActionError('Select a member first');
      return;
    }
    setActionLoading(true);
    setActionMessage(null);
    setActionError(null);
    try {
      // client-side Graph call
      const token = await acquireTokenForAdminActions();
      const userId = selectedMember.id;
      const delRes = await fetch(`https://graph.microsoft.com/v1.0/groups/${HELP_DESK_GROUP_ID}/members/${userId}/$ref`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!delRes.ok && delRes.status !== 204) {
        const txt = await delRes.text();
        throw new Error(`Remove failed: ${delRes.status} ${txt}`);
      }

      setActionMessage(`${selectedMember.displayName || selectedMember.userPrincipalName} removed from Helpdesk_Admin`);

      // notify backend to send emails
      try {
        await fetch('/api/admin/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'remove',
            actor: { id: accounts?.[0]?.homeAccountId, displayName: accounts?.[0]?.name, upn: accounts?.[0]?.username },
            target: { id: selectedMember.id, displayName: selectedMember.displayName, upn: selectedMember.userPrincipalName || selectedMember.mail }
          })
        });
      } catch (e) {
        console.warn('Backend notify failed (optional)', e);
      }

      // refresh members list
      await loadGroupMembers();
    } catch (err) {
      console.error(err);
      setActionError(err.message || 'Failed to remove user');
    } finally {
      setActionLoading(false);
    }
  };

  // UI helpers
  const openAddModal = () => {
    setAddModalOpen(true);
    setSearchTerm('');
    setSearchResults([]);
    setSelectedSearchUser(null);
    setActionMessage(null);
    setActionError(null);
  };

  const openRemoveModal = async () => {
    setRemoveModalOpen(true);
    setSelectedMember(null);
    setActionMessage(null);
    setActionError(null);
    await loadGroupMembers();
  };

  const initials = (accounts?.[0]?.name || accounts?.[0]?.username || 'U')
    .split(' ')
    .map(s => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      <header style={{
        background: 'white', padding: '14px 20px', borderBottom: '1px solid rgba(15,23,42,0.06)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        position: 'sticky', top: 0, zIndex: 40
      }}>
        {/* left logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src={logo} alt="Sandeza logo" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8 }} />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
            <h1 style={{ color: '#0f172a', margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>SANDEZA INC</h1>
            <div style={{ color: '#6b7280', fontSize: 12 }}>IT Ticket Portal</div>
          </div>
        </div>

        {/* center title */}
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0f172a' }}>SANDEZA HELPDESK</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Empowering Support • Every Step</div>
        </div>

        {/* right area */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isAdmin && (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setSettingsOpen(s => !s)}
                  aria-label="Settings"
                  title="Settings"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 40, height: 40, borderRadius: 10, border: '1px solid rgba(15,23,42,0.06)',
                    background: settingsOpen ? '#eef2ff' : 'linear-gradient(180deg,#ffffff,#fbfdff)',
                    cursor: 'pointer', boxShadow: '0 6px 18px rgba(2,6,23,0.04)',
                  }}
                >
                  <img src={gearIcon} alt="Settings" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                </button>

                {settingsOpen && (
                  <div role="menu" aria-label="Admin settings" style={{
                    position: 'absolute', right: 0, marginTop: 8, background: 'white',
                    border: '1px solid rgba(15,23,42,0.06)', borderRadius: 8, boxShadow: '0 12px 40px rgba(2,6,23,0.12)',
                    padding: 12, width: 260, zIndex: 60
                  }}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>Admin Settings</div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { openAddModal(); setSettingsOpen(false); }} style={{
                        flex: 1, background: '#0369a1', color: 'white', border: 'none', padding: '8px',
                        borderRadius: 8, cursor: 'pointer', fontWeight: 700
                      }}>
                        Add user
                      </button>

                      <button onClick={() => { openRemoveModal(); setSettingsOpen(false); }} style={{
                        flex: 1, background: '#ef4444', color: 'white', border: 'none', padding: '8px',
                        borderRadius: 8, cursor: 'pointer', fontWeight: 700
                      }}>
                        Remove user
                      </button>
                    </div>

                    <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
                      Membership changes affect Helpdesk_Admin group.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* profile button */}
            <div ref={profileRef} style={{ position: 'relative' }}>
              <button onClick={() => setProfileOpen(p => !p)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 999,
                border: '1px solid rgba(15,23,42,0.06)', background: 'linear-gradient(180deg,#ffffff,#fbfdff)',
                cursor: 'pointer', boxShadow: '0 6px 18px rgba(2,6,23,0.06)'
              }} aria-haspopup="true">
                <div style={{
                  width: 36, height: 36, borderRadius: 10, background: '#eef2ff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800,
                  color: '#3730a3', fontSize: 14, overflow: 'hidden'
                }}>
                  {profilePhoto ? <img src={profilePhoto} alt="profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>{initials}</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{accounts?.[0]?.name || accounts?.[0]?.username}</span>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{accounts?.[0]?.username}</span>
                </div>
              </button>

              {profileOpen && (
                <div style={{
                  position: 'absolute', right: 0, marginTop: 10, background: 'white',
                  border: '1px solid rgba(15,23,42,0.06)', borderRadius: 10, boxShadow: '0 12px 40px rgba(2,6,23,0.12)',
                  padding: 12, width: 300, zIndex: 60
                }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 12, background: '#eef2ff', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#3730a3', overflow: 'hidden'
                    }}>
                      {profilePhoto ? <img src={profilePhoto} alt="profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 18 }}>{initials}</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800 }}>{accounts?.[0]?.name || 'Unknown'}</div>
                      <div style={{ color: '#6b7280', fontSize: 13 }}>{accounts?.[0]?.username}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button onClick={() => { setFullProfileOpen(true); setProfileOpen(false); }} style={{
                      textAlign: 'left', background: 'transparent', border: 'none', padding: '10px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, color: '#2563eb'
                    }}>View Full Profile</button>

                    <button onClick={logout} style={{
                      textAlign: 'left', background: '#d91515ff', border: 'none', padding: '10px', borderRadius: 8, cursor: 'pointer', color: 'white', fontWeight: 700
                    }}>Logout</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Add User Modal */}
      {addModalOpen && (
        <>
          <div onClick={() => setAddModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50 }} />
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'white', borderRadius: 10,
            padding: 16, boxShadow: '0 8px 30px rgba(0,0,0,0.3)', width: 540, zIndex: 60
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Add Admin — Select user</h3>
              <button onClick={() => setAddModalOpen(false)} style={{ background: 'transparent', border: 'none', fontSize: '1.1rem', cursor: 'pointer' }}>✖</button>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search by name, email or UPN (min 2 chars)" style={{ padding: '10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)' }} />

              <div style={{ maxHeight: 260, overflow: 'auto', borderRadius: 8, border: '1px solid rgba(0,0,0,0.04)', padding: 8 }}>
                {searchLoading && <div style={{ color: '#6b7280' }}>Searching…</div>}
                {!searchLoading && searchResults.length === 0 && <div style={{ color: '#6b7280' }}>No results</div>}
                {!searchLoading && searchResults.map(u => (
                  <div key={u.id} onClick={() => setSelectedSearchUser(u)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 8, borderRadius: 6,
                    background: selectedSearchUser?.id === u.id ? '#eef2ff' : 'transparent', cursor: 'pointer'
                  }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{u.displayName || u.userPrincipalName}</div>
                      <div style={{ color: '#6b7280', fontSize: 12 }}>{u.userPrincipalName || u.mail}</div>
                    </div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>{selectedSearchUser?.id === u.id ? 'Selected' : 'Select'}</div>
                  </div>
                ))}
              </div>

              {actionMessage && <div style={{ padding: 8, background: '#ecfdf5', color: '#065f46', borderRadius: 8 }}>{actionMessage}</div>}
              {actionError && <div style={{ padding: 8, background: '#fff1f2', color: '#9f1239', borderRadius: 8 }}>{actionError}</div>}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setAddModalOpen(false); setActionMessage(null); setActionError(null); }} style={{ background: 'transparent', border: 'none', color: '#6b7280', padding: '8px 12px', cursor: 'pointer' }}>Cancel</button>
                <button disabled={actionLoading || !selectedSearchUser} onClick={addSelectedUserToGroup} style={{ background: '#0369a1', color: 'white', border: 'none', padding: '8px 14px', borderRadius: 8, cursor: actionLoading ? 'default' : 'pointer', fontWeight: 700 }}>
                  {actionLoading ? 'Working…' : 'Add user'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Remove User Modal */}
      {removeModalOpen && (
        <>
          <div onClick={() => setRemoveModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50 }} />
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'white', borderRadius: 10,
            padding: 16, boxShadow: '0 8px 30px rgba(0,0,0,0.3)', width: 540, zIndex: 60
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Remove Admin — Select member</h3>
              <button onClick={() => setRemoveModalOpen(false)} style={{ background: 'transparent', border: 'none', fontSize: '1.1rem', cursor: 'pointer' }}>✖</button>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ maxHeight: 300, overflow: 'auto', borderRadius: 8, border: '1px solid rgba(0,0,0,0.04)', padding: 8 }}>
                {membersLoading && <div style={{ color: '#6b7280' }}>Loading members…</div>}
                {!membersLoading && groupMembers.length === 0 && <div style={{ color: '#6b7280' }}>No members</div>}
                {!membersLoading && groupMembers.map(m => (
                  <div key={m.id} onClick={() => setSelectedMember(m)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 8, borderRadius: 6,
                    background: selectedMember?.id === m.id ? '#fee2e2' : 'transparent', cursor: 'pointer'
                  }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{m.displayName || m.userPrincipalName}</div>
                      <div style={{ color: '#6b7280', fontSize: 12 }}>{m.userPrincipalName || m.mail}</div>
                    </div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>{selectedMember?.id === m.id ? 'Selected' : 'Select'}</div>
                  </div>
                ))}
              </div>

              {actionMessage && <div style={{ padding: 8, background: '#ecfdf5', color: '#065f46', borderRadius: 8 }}>{actionMessage}</div>}
              {actionError && <div style={{ padding: 8, background: '#fff1f2', color: '#9f1239', borderRadius: 8 }}>{actionError}</div>}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setRemoveModalOpen(false); setActionMessage(null); setActionError(null); }} style={{ background: 'transparent', border: 'none', color: '#6b7280', padding: '8px 12px', cursor: 'pointer' }}>Cancel</button>
                <button disabled={actionLoading || !selectedMember} onClick={removeSelectedMemberFromGroup} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '8px 14px', borderRadius: 8, cursor: actionLoading ? 'default' : 'pointer', fontWeight: 700 }}>
                  {actionLoading ? 'Working…' : 'Remove user'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Full profile modal placeholder */}
      {fullProfileOpen && (
        <>
          <div onClick={() => setFullProfileOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50 }} />
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'white', borderRadius: 10,
            padding: 20, boxShadow: '0 8px 30px rgba(0,0,0,0.3)', width: 420, zIndex: 60
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Full Profile</h3>
              <button onClick={() => setFullProfileOpen(false)} style={{ background: 'transparent', border: 'none', fontSize: '1.1rem', cursor: 'pointer' }}>✖</button>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700 }}>{accounts?.[0]?.name}</div>
              <div style={{ color: '#6b7280' }}>{accounts?.[0]?.username}</div>
            </div>
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
        // ensure Group.ReadWrite.All and User.Read.All delegated are requested if using client-side operations
        scopes: ['User.Read', 'User.ReadBasic.All', 'GroupMember.Read.All', 'Group.ReadWrite.All', 'User.Read.All'],
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

/* GLOBAL ANIMATION */
<style>{`
@keyframes floatGlow {
  0% { transform: translateX(-50%) translateY(0); opacity: 0.95; }
  50% { transform: translateX(-50%) translateY(-3px); opacity: 1; }
  100% { transform: translateX(-50%) translateY(0); opacity: 0.95; }
}
`}</style>