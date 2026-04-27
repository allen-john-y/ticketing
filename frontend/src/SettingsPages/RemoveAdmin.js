// RemoveAdmin.js - Redesigned to match Home.js styling
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';

const backendBase = process.env.REACT_APP_BACKEND_URL;
const HELP_DESK_GROUP_ID = process.env.REACT_APP_HELP_DESK_GROUP_ID;

export default function RemoveAdmin() {
  const { accounts, instance } = useMsal();
  const navigate = useNavigate();

  const [groupMembers, setGroupMembers]   = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [removeMessage, setRemoveMessage] = useState(null);
  const [removeError, setRemoveError]     = useState(null);

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
        const resp = await instance.acquireTokenPopup({ 
          scopes: ['Group.ReadWrite.All', 'User.Read.All'], 
          account: accounts[0] 
        });
        return resp.accessToken;
      }
      throw err;
    }
  };

  useEffect(() => {
    const fetchMembers = async () => {
      setMembersLoading(true);
      setRemoveError(null);
      
      try {
        const token = await acquireTokenForAdmin();
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/groups/${HELP_DESK_GROUP_ID}/members?$select=id,displayName,mail,userPrincipalName&$top=200`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (!res.ok) throw new Error(`Failed to fetch members: ${res.status}`);
        
        const j = await res.json();
        setGroupMembers((Array.isArray(j.value) ? j.value : []).map(m => ({
          id: m.id,
          displayName: m.displayName || m.userPrincipalName || m.mail || '(no name)',
          mail: m.mail || '',
          userPrincipalName: m.userPrincipalName || '',
        })));
      } catch (err) {
        console.error('Fetch members error:', err);
        setRemoveError(err.message || 'Failed to load members');
      } finally {
        setMembersLoading(false);
      }
    };
    
    fetchMembers();
  }, []);

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
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/groups/${HELP_DESK_GROUP_ID}/members/${selectedMember.id}/$ref`,
        { 
          method: 'DELETE', 
          headers: { Authorization: `Bearer ${token}` } 
        }
      );
      
      if (res.ok || res.status === 204) {
        setRemoveMessage(`${selectedMember.displayName} has been removed from Helpdesk_Admin`);
        
        fetch(`${backendBase}/api/notify-admin-removed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actor: { 
              id: accounts?.[0]?.homeAccountId || '', 
              name: accounts?.[0]?.name || '', 
              mail: accounts?.[0]?.username || '' 
            },
            target: { 
              id: selectedMember.id, 
              name: selectedMember.displayName, 
              mail: selectedMember.mail || selectedMember.userPrincipalName 
            },
          }),
        }).catch(() => {});
        
        setGroupMembers(prev => prev.filter(m => m.id !== selectedMember.id));
        setSelectedMember(null);
      } else {
        const text = await res.text();
        setRemoveError(`Remove failed: ${res.status} ${text}`);
      }
    } catch (err) {
      console.error('Remove user error:', err);
      setRemoveError(err.message || 'Remove failed');
    } finally {
      setRemoveLoading(false);
    }
  };

  const sharedCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --navy: #002060;
      --navy2: #003090;
      --orange: #e98404;
      --orange2: #f5a623;
      --white: #ffffff;
      --bg: #f5f7fa;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #64748b;
      --light: #f8fafc;
    }

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(18px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .ra-page {
      min-height: 100vh;
      width: 100%;
      background: var(--bg);
      font-family: 'Lato', sans-serif;
      color: var(--text);
    }

    /* Hero Section */
    .ra-hero {
      background: var(--navy);
      position: relative;
      overflow: hidden;
      padding: 48px 48px 44px;
    }
    .ra-hero::after {
      content: '';
      position: absolute;
      right: -60px; top: -60px;
      width: 420px; height: 420px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(233,132,4,0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .ra-hero-inner {
      position: relative; z-index: 2;
      max-width: 1320px; margin: 0 auto;
      animation: fadeUp 0.55s ease both;
    }
    .ra-hero-eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--orange);
      margin-bottom: 14px;
    }
    .ra-hero-eyebrow-line {
      width: 28px; height: 2px; background: var(--orange); border-radius: 2px;
    }
    .ra-hero h1 {
      font-family: 'Sora', sans-serif;
      font-size: clamp(28px, 3vw, 36px);
      font-weight: 800;
      color: #ffffff;
      line-height: 1.15;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .ra-hero h1 em {
      font-style: normal;
      color: #ef4444;
    }
    .ra-hero-sub {
      font-size: 15px; color: rgba(255,255,255,0.62);
      font-weight: 400; line-height: 1.6;
    }

    /* Content Area */
    .ra-content {
      max-width: 1320px;
      margin: 0 auto;
      padding: 32px 48px 56px;
    }

    .ra-back-btn {
      background: none; border: none;
      font-size: 14px; font-weight: 600;
      color: var(--navy); cursor: pointer;
      padding: 0; margin-bottom: 24px; display: inline-flex;
      align-items: center; gap: 6px;
      font-family: 'Sora', sans-serif;
    }
    .ra-back-btn:hover { color: var(--orange); }

    /* Stats Row */
    .ra-stats-row {
      display: flex; gap: 24px;
      margin-bottom: 28px;
      animation: fadeUp 0.45s 0.05s ease both;
    }

    .ra-stat-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      padding: 24px 32px;
      display: flex; align-items: center; gap: 20px;
      flex: 1;
    }

    .ra-stat-icon {
      width: 48px; height: 48px; border-radius: 14px;
      background: rgba(239,68,68,0.08);
      display: flex; align-items: center; justify-content: center;
      font-size: 24px;
    }

    .ra-stat-content {
      display: flex; flex-direction: column;
    }

    .ra-stat-value {
      font-family: 'Sora', sans-serif;
      font-size: 32px; font-weight: 800;
      color: var(--navy);
      line-height: 1;
      letter-spacing: -0.03em;
      margin-bottom: 4px;
    }

    .ra-stat-label {
      font-size: 12px; font-weight: 700;
      letter-spacing: 0.05em; text-transform: uppercase;
      color: var(--muted);
    }

    /* Users Card */
    .ra-users-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 20px;
      overflow: hidden;
      margin-bottom: 24px;
      animation: fadeUp 0.45s 0.1s ease both;
    }

    .ra-users-header {
      padding: 20px 28px;
      background: var(--light);
      border-bottom: 1.5px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
    }

    .ra-users-title {
      font-family: 'Sora', sans-serif;
      font-size: 15px; font-weight: 700;
      color: var(--navy);
      letter-spacing: 0.03em;
    }

    .ra-users-badge {
      padding: 4px 14px;
      background: #ef4444;
      border-radius: 20px;
      font-size: 12px; font-weight: 700;
      color: white;
    }

    .ra-user-grid {
      padding: 24px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px;
    }

    .ra-user-card {
      display: flex; align-items: center; gap: 14px;
      padding: 16px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .ra-user-card:hover {
      border-color: var(--navy);
      box-shadow: 0 4px 12px rgba(0,32,96,0.08);
    }
    .ra-user-card.selected {
      background: #fee2e2;
      border-color: #ef4444;
    }

    .ra-user-avatar {
      width: 48px; height: 48px; border-radius: 12px;
      background: var(--navy);
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; font-weight: 700;
      color: white;
      flex-shrink: 0;
    }
    .ra-user-card.selected .ra-user-avatar {
      background: #ef4444;
    }

    .ra-user-info {
      flex: 1; min-width: 0;
    }

    .ra-user-name {
      font-size: 15px; font-weight: 700;
      color: var(--text);
      margin-bottom: 3px;
      white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }

    .ra-user-email {
      font-size: 12px; color: var(--muted);
      white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }

    .ra-selected-indicator {
      color: #ef4444;
      flex-shrink: 0;
    }

    /* Loading */
    .ra-loading {
      text-align: center; padding: 60px;
    }
    .ra-spinner {
      width: 40px; height: 40px; border-radius: 50%;
      border: 3px solid var(--border);
      border-top-color: var(--navy);
      animation: spin 0.9s linear infinite;
      margin: 0 auto 20px;
    }

    /* Error */
    .ra-error {
      text-align: center; padding: 60px;
    }
    .ra-error-icon {
      font-size: 48px; margin-bottom: 16px;
    }
    .ra-error-text {
      color: #ef4444;
      font-size: 14px; font-weight: 500;
      margin-bottom: 16px;
    }
    .ra-retry-btn {
      padding: 10px 24px;
      background: #ef4444;
      border: none;
      border-radius: 12px;
      font-size: 14px; font-weight: 600;
      color: white;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
    }

    /* Empty */
    .ra-empty {
      text-align: center; padding: 60px;
    }
    .ra-empty-icon {
      font-size: 48px; margin-bottom: 16px;
    }
    .ra-empty-text {
      color: var(--muted);
      font-size: 14px;
    }

    /* Success Message */
    .ra-success-message {
      display: flex; align-items: center; gap: 12px;
      padding: 16px 24px;
      background: #d1fae5;
      border: 1.5px solid #10b981;
      border-radius: 16px;
      color: #065f46;
      font-size: 14px; font-weight: 600;
      margin-bottom: 24px;
      animation: fadeUp 0.3s ease;
    }

    /* Action Bar */
    .ra-action-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 100;
      padding: 0 48px 32px 48px;
      background: linear-gradient(to top, var(--bg) 0%, var(--bg) 60%, transparent 100%);
      animation: fadeUp 0.45s 0.2s ease both;
      pointer-events: none;
    }

    .ra-action-bar-inner {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 20px;
      padding: 20px 28px;
      box-shadow: 0 8px 32px rgba(0,32,96,0.12);
      display: flex; align-items: center; justify-content: space-between;
      gap: 24px;
      max-width: 1320px;
      margin: 0 auto;
      pointer-events: auto;
    }

    .ra-selected-info {
      display: flex; align-items: center; gap: 10px;
      flex: 1; flex-wrap: wrap;
      font-size: 14px;
    }

    .ra-selected-label {
      color: var(--muted);
      font-weight: 600;
      flex-shrink: 0;
    }

    .ra-selected-name {
      color: var(--text);
      font-weight: 700;
    }

    .ra-no-selection {
      color: var(--muted);
      font-style: italic;
    }

    .ra-action-buttons {
      display: flex; gap: 12px;
    }

    .ra-btn-cancel {
      padding: 14px 28px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      font-size: 15px; font-weight: 600;
      color: var(--muted);
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.2s;
    }
    .ra-btn-cancel:hover {
      border-color: var(--navy);
      color: var(--navy);
    }

    .ra-btn-remove {
      padding: 14px 32px;
      background: #ef4444;
      border: none;
      border-radius: 14px;
      font-size: 15px; font-weight: 700;
      color: white;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.3s;
      display: flex; align-items: center; gap: 10px;
      box-shadow: 0 4px 12px rgba(239,68,68,0.2);
    }
    .ra-btn-remove:hover:not(:disabled) {
      background: #dc2626;
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(239,68,68,0.25);
    }
    .ra-btn-remove:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .ra-btn-spinner {
      width: 16px; height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      display: inline-block;
    }

    @media (max-width: 768px) {
      .ra-hero { padding: 40px 24px; }
      .ra-content { padding: 24px 20px 140px; }
      .ra-stats-row { flex-direction: column; }
      .ra-user-grid { grid-template-columns: 1fr; }
      .ra-action-bar { padding: 0 20px 24px 20px; }
      .ra-action-bar-inner { flex-direction: column; }
      .ra-action-buttons { width: 100%; }
      .ra-btn-cancel, .ra-btn-remove { flex: 1; justify-content: center; }
    }
  `;

  return (
    <div className="ra-page">
      <style>{sharedCSS}</style>

      {/* Hero Section */}
      <div className="ra-hero">
        <div className="ra-hero-inner">
          <div className="ra-hero-eyebrow">
            <div className="ra-hero-eyebrow-line" />
            Admin Management
          </div>
          <h1>Remove <em>Admin User</em></h1>
          <p className="ra-hero-sub">Manage administrator access by removing users from the Helpdesk_Admin group</p>
        </div>
      </div>

      {/* Content */}
      <div className="ra-content">
        <button className="ra-back-btn" onClick={() => navigate('/settings')}>
          ← Back to Settings
        </button>

        {/* Stats */}
        <div className="ra-stats-row">
          <div className="ra-stat-card">
            <div className="ra-stat-icon">👥</div>
            <div className="ra-stat-content">
              <div className="ra-stat-value">{groupMembers.length}</div>
              <div className="ra-stat-label">Total Admins</div>
            </div>
          </div>
          <div className="ra-stat-card">
            <div className="ra-stat-icon" style={{ background: 'rgba(239,68,68,0.08)' }}>🎯</div>
            <div className="ra-stat-content">
              <div className="ra-stat-value">{selectedMember ? 1 : 0}</div>
              <div className="ra-stat-label">Selected</div>
            </div>
          </div>
        </div>

        {/* Users List */}
        <div className="ra-users-card">
          <div className="ra-users-header">
            <span className="ra-users-title">👤 Administrators</span>
            <span className="ra-users-badge">{groupMembers.length} users</span>
          </div>

          {membersLoading ? (
            <div className="ra-loading">
              <div className="ra-spinner" />
              <p style={{ color: '#64748b', fontSize: 14 }}>Loading administrators...</p>
            </div>
          ) : removeError ? (
            <div className="ra-error">
              <div className="ra-error-icon">⚠️</div>
              <p className="ra-error-text">{removeError}</p>
              <button className="ra-retry-btn" onClick={() => window.location.reload()}>
                Retry
              </button>
            </div>
          ) : groupMembers.length === 0 ? (
            <div className="ra-empty">
              <div className="ra-empty-icon">👤</div>
              <p className="ra-empty-text">No administrators found</p>
            </div>
          ) : (
            <div className="ra-user-grid">
              {groupMembers.map(m => (
                <div
                  key={m.id}
                  className={`ra-user-card ${selectedMember?.id === m.id ? 'selected' : ''}`}
                  onClick={() => setSelectedMember(m)}
                >
                  <div className="ra-user-avatar">
                    {m.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="ra-user-info">
                    <div className="ra-user-name">{m.displayName}</div>
                    <div className="ra-user-email">{m.mail || m.userPrincipalName}</div>
                  </div>
                  {selectedMember?.id === m.id && (
                    <div className="ra-selected-indicator">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <circle cx="10" cy="10" r="8" fill="#ef4444" stroke="white" strokeWidth="2"/>
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Success Message */}
        {removeMessage && (
          <div className="ra-success-message">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="9" fill="#10b981" opacity="0.3"/>
              <path d="M5 10l3 3 5-5" stroke="#065f46" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span>{removeMessage}</span>
          </div>
        )}
      </div>

      {/* Action Bar - Fixed to bottom */}
      <div className="ra-action-bar">
        <div className="ra-action-bar-inner">
          <div className="ra-selected-info">
            {selectedMember ? (
              <>
                <span className="ra-selected-label">Selected:</span>
                <span className="ra-selected-name">{selectedMember.displayName}</span>
              </>
            ) : (
              <span className="ra-no-selection">No user selected</span>
            )}
          </div>
          <div className="ra-action-buttons">
            <button className="ra-btn-cancel" onClick={() => navigate('/settings')}>
              Cancel
            </button>
            <button
              className="ra-btn-remove"
              onClick={confirmRemoveUser}
              disabled={removeLoading || !selectedMember}
            >
              {removeLoading ? (
                <>
                  <span className="ra-btn-spinner" />
                  Removing...
                </>
              ) : (
                'Remove Admin Access'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}