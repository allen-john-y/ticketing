// src/SettingsPages/AssetSettings.js
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import axios from 'axios';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

export default function AssetSettings() {
  const navigate = useNavigate();
  const { instance, accounts } = useMsal();
  const currentUser = accounts[0] || {};

  // ─── State ───
  const [assetAccessUsers, setAssetAccessUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  // Toast state
  const [toast, setToast] = useState({ open: false, message: '', type: 'success' });

  // ─── Fetch Data ───
  useEffect(() => {
    fetchAssetAccessUsers();
  }, []);

  // Click outside handler for dropdown
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ open: true, message, type });
    setTimeout(() => setToast(p => ({ ...p, open: false })), 3000);
  };

  // ─── Fetch Asset Access Users ───
  const fetchAssetAccessUsers = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${BACKEND}/api/asset-access`);
      setAssetAccessUsers(res.data || []);
    } catch (err) {
      console.error('Error fetching asset access users:', err);
      showToast('Failed to load asset access users', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ─── LIVE SEARCH: Search Azure AD users ───
  const searchAzureAD = async (query) => {
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      setSearching(false);
      return;
    }

    setSearching(true);
    setShowDropdown(true);
    try {
      const token = await instance.acquireTokenSilent({
        scopes: ['User.Read.All'],
        account: accounts[0],
      });

      const q = query.trim().replace(/'/g, "''");
      const filter = `startswith(displayName,'${q}') or startswith(mail,'${q}') or startswith(userPrincipalName,'${q}')`;
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(filter)}&$select=id,displayName,mail,userPrincipalName&$top=10`,
        { headers: { Authorization: `Bearer ${token.accessToken}` } }
      );
      const data = await res.json();

      // Get emails of already selected users
      const selectedEmails = new Set(selectedUsers.map(u => u.mail.toLowerCase()));
      // Get emails of already granted users
      const existingEmails = new Set(assetAccessUsers.map(u => u.email.toLowerCase()));

      const results = (data.value || [])
        .filter(u => {
          const email = (u.mail || u.userPrincipalName || '').toLowerCase();
          return !existingEmails.has(email) && !selectedEmails.has(email);
        })
        .map(u => ({
          id: u.id,
          displayName: u.displayName || u.mail || '(no name)',
          mail: u.mail || u.userPrincipalName || '',
        }));

      setSearchResults(results);
    } catch (err) {
      console.error('Error searching users:', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSearchChange = (value) => {
    setSearchQuery(value);
    searchAzureAD(value);
  };

  // ─── Click on dropdown row → add user to selection ───
  const selectUser = (user) => {
    if (selectedUsers.some(u => u.mail.toLowerCase() === user.mail.toLowerCase())) {
      showToast(`"${user.displayName}" is already in the selection list`, 'error');
      return;
    }
    if (assetAccessUsers.some(u => u.email.toLowerCase() === user.mail.toLowerCase())) {
      showToast(`"${user.displayName}" already has asset registry access`, 'error');
      return;
    }
    setSelectedUsers(prev => [...prev, user]);
    setSearchQuery('');
    setSearchResults([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  // ─── Remove user from selection list ───
  const removeUserFromSelection = (userMail) => {
    setSelectedUsers(prev => prev.filter(u => u.mail.toLowerCase() !== userMail.toLowerCase()));
  };

  // ─── Grant access to ALL selected users ───
  const handleGrantAccess = async () => {
    if (selectedUsers.length === 0) {
      showToast('No users selected to grant access', 'error');
      return;
    }

    setSubmitting(true);
    let successCount = 0;
    let failedCount = 0;
    const failedUsers = [];

    try {
      for (const user of selectedUsers) {
        try {
          const payload = {
            email: user.mail,
            name: user.displayName,
            addedBy: {
              id: currentUser.localAccountId || '',
              name: currentUser.name || '',
              email: currentUser.username || '',
            },
          };
          await axios.post(`${BACKEND}/api/asset-access`, payload);
          successCount++;
        } catch (err) {
          failedCount++;
          failedUsers.push(user.mail);
          console.error(`Failed to add ${user.mail}:`, err.message);
        }
      }

      if (successCount > 0 && failedCount === 0) {
        showToast(`✅ Asset registry access granted to ${successCount} user${successCount > 1 ? 's' : ''}!`, 'success');
      } else if (successCount > 0 && failedCount > 0) {
        showToast(`⚠️ Granted to ${successCount}, failed for ${failedCount}: ${failedUsers.join(', ')}`, 'error');
      } else {
        showToast(`❌ Failed to grant access to all ${failedCount} users`, 'error');
      }

      setSelectedUsers([]);
      fetchAssetAccessUsers();
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to grant access';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Remove access for a user ───
  const handleRemoveAccess = async (id, email) => {
    if (!window.confirm(`Remove asset registry access for "${email}"?`)) return;
    try {
      await axios.delete(`${BACKEND}/api/asset-access/${id}`);
      showToast(`Asset registry access removed for "${email}"`, 'success');
      fetchAssetAccessUsers();
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to remove user';
      showToast(msg, 'error');
    }
  };

  const sharedCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; }

    :root {
      --navy: #002060;
      --navy2: #003090;
      --orange: #e98404;
      --white: #ffffff;
      --bg: #f5f7fa;
      --border: #e6e9ef;
      --text: #0f172a;
      --muted: #64748b;
      --light: #f8fafc;
      --green: #10b981;
      --red: #ef4444;
    }

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(14px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes slideIn {
      from { transform: translateX(110%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes scaleUp {
      from { transform: scale(0.92); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .asset-settings-page {
      min-height: 70vh;
      width: 100%;
      max-width: 1080px;
      margin: 0 auto;
      padding: 40px 24px 64px;
      font-family: 'Lato', sans-serif;
      color: var(--text);
    }

    .asset-settings-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      flex-wrap: wrap;
      margin-bottom: 28px;
      animation: fadeUp 0.4s ease both;
    }
    .asset-settings-header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .asset-settings-header-icon {
      width: 52px;
      height: 52px;
      flex-shrink: 0;
      border-radius: 14px;
      background: rgba(0,32,96,0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 6px 16px rgba(0,32,96,0.12);
      overflow: hidden;
      padding: 6px;
    }
    .asset-settings-header-icon-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 10px;
    }
    .asset-settings-eyebrow {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--orange);
      margin-bottom: 4px;
    }
    .asset-settings-header h1 {
      font-family: 'Sora', sans-serif;
      font-size: 22px;
      font-weight: 800;
      color: var(--navy);
      margin: 0;
      letter-spacing: -0.01em;
    }
    .asset-settings-header-sub {
      font-size: 13.5px;
      color: var(--muted);
      margin-top: 3px;
    }
    .asset-settings-header-right {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .asset-settings-count-badge {
      background: rgba(0,32,96,0.06);
      color: var(--navy);
      padding: 8px 16px;
      border-radius: 30px;
      font-size: 13px;
      font-weight: 700;
      font-family: 'Sora', sans-serif;
      white-space: nowrap;
    }
    .asset-settings-back-btn {
      padding: 10px 18px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 10px;
      cursor: pointer;
      font-size: 13.5px;
      font-weight: 700;
      color: var(--navy);
      font-family: 'Sora', sans-serif;
      transition: all 0.15s;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .asset-settings-back-btn:hover {
      border-color: var(--navy);
      background: rgba(0,32,96,0.03);
    }

    .asset-settings-card {
      background: var(--white);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 26px 28px;
      margin-bottom: 20px;
      box-shadow: 0 1px 2px rgba(15,23,42,0.03);
      animation: fadeUp 0.45s ease both;
    }
    .asset-settings-card-title {
      font-family: 'Sora', sans-serif;
      font-size: 15px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .asset-settings-card-title-count {
      font-size: 12.5px;
      color: var(--muted);
      font-weight: 500;
      font-family: 'Lato', sans-serif;
    }

    .asset-settings-form-group {
      display: flex;
      flex-direction: column;
      position: relative;
    }
    .asset-settings-form-label {
      font-size: 12.5px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 7px;
      font-family: 'Sora', sans-serif;
    }
    .asset-settings-form-input {
      padding: 12px 15px;
      border: 1.5px solid var(--border);
      border-radius: 12px;
      font-size: 14px;
      font-family: 'Lato', sans-serif;
      transition: all 0.15s;
      width: 100%;
      background: var(--white);
      color: var(--text);
      height: 46px;
    }
    .asset-settings-form-input:focus {
      outline: none;
      border-color: var(--navy);
      box-shadow: 0 0 0 4px rgba(0,32,96,0.07);
    }

    .asset-settings-btn {
      padding: 12px 24px;
      border: none;
      border-radius: 12px;
      font-size: 13.5px;
      font-weight: 700;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.15s;
      white-space: nowrap;
      min-height: 44px;
    }
    .asset-settings-btn-primary {
      background: var(--navy);
      color: white;
    }
    .asset-settings-btn-primary:hover:not(:disabled) {
      background: var(--navy2);
      box-shadow: 0 4px 14px rgba(0,32,96,0.22);
    }
    .asset-settings-btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .asset-settings-btn-success {
      background: var(--green);
      color: white;
    }
    .asset-settings-btn-success:hover:not(:disabled) {
      background: #059669;
    }
    .asset-settings-btn-danger {
      background: var(--red);
      color: white;
    }
    .asset-settings-btn-danger:hover:not(:disabled) {
      background: #dc2626;
    }
    .asset-settings-btn-sm {
      padding: 6px 14px;
      min-height: 32px;
      font-size: 12px;
    }
    .asset-settings-btn-secondary {
      background: var(--white);
      color: var(--text);
      border: 1.5px solid var(--border);
    }
    .asset-settings-btn-secondary:hover {
      border-color: var(--navy);
      color: var(--navy);
    }

    /* User Search Dropdown */
    .asset-settings-user-search-wrapper {
      position: relative;
    }
    .asset-settings-user-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      margin-top: 8px;
      max-height: 280px;
      overflow-y: auto;
      z-index: 1000;
      box-shadow: 0 8px 24px rgba(0,32,96,0.12);
    }
    .asset-settings-user-dropdown::-webkit-scrollbar {
      width: 4px;
    }
    .asset-settings-user-dropdown::-webkit-scrollbar-track {
      background: var(--bg);
      border-radius: 4px;
    }
    .asset-settings-user-dropdown::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: 4px;
    }
    .asset-settings-dd-item {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 16px;
      cursor: pointer;
      border-bottom: 1.5px solid var(--border);
      transition: background 0.15s;
    }
    .asset-settings-dd-item:last-child {
      border-bottom: none;
    }
    .asset-settings-dd-item:hover {
      background: var(--bg);
    }
    .asset-settings-dd-avatar {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: var(--navy);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .asset-settings-dd-name {
      font-size: 15px;
      font-weight: 600;
      color: var(--text);
    }
    .asset-settings-dd-email {
      font-size: 12px;
      color: var(--muted);
      margin-top: 2px;
    }
    .asset-settings-dd-empty {
      padding: 20px;
      text-align: center;
      color: var(--muted);
      font-size: 13px;
    }

    /* Selected Users List */
    .asset-settings-selected-users {
      margin-top: 16px;
      border: 1px solid var(--border);
      border-radius: 14px;
      overflow: hidden;
    }
    .asset-settings-selected-header {
      padding: 12px 16px;
      background: var(--light);
      border-bottom: 1px solid var(--border);
      font-size: 13px;
      font-weight: 700;
      color: var(--navy);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .asset-settings-selected-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      border-bottom: 1px solid var(--border);
      transition: background 0.15s;
    }
    .asset-settings-selected-item:last-child {
      border-bottom: none;
    }
    .asset-settings-selected-item:hover {
      background: var(--bg);
    }
    .asset-settings-selected-item-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .asset-settings-selected-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(16,185,129,0.12);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #059669;
      font-weight: 700;
      font-size: 13px;
    }
    .asset-settings-selected-name {
      font-weight: 600;
      color: var(--text);
      font-size: 14px;
    }
    .asset-settings-selected-email {
      font-size: 12px;
      color: var(--muted);
    }
    .asset-settings-selected-remove {
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      font-size: 16px;
      padding: 4px 8px;
      border-radius: 6px;
      transition: all 0.15s;
    }
    .asset-settings-selected-remove:hover {
      background: rgba(239,68,68,0.1);
      color: var(--red);
    }

    .asset-settings-grant-section {
      margin-top: 16px;
      display: flex;
      justify-content: flex-end;
    }

    /* Access List */
    .asset-settings-access-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 16px;
    }
    .asset-settings-access-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: var(--light);
      border-radius: 12px;
      border: 1px solid var(--border);
      transition: all 0.15s;
    }
    .asset-settings-access-item:hover {
      border-color: rgba(0,32,96,0.15);
    }
    .asset-settings-access-item-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .asset-settings-access-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: rgba(0,32,96,0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      color: var(--navy);
      flex-shrink: 0;
    }
    .asset-settings-access-email {
      font-weight: 600;
      color: var(--text);
      font-size: 14px;
    }
    .asset-settings-access-name {
      font-size: 13px;
      color: var(--muted);
    }
    .asset-settings-access-meta {
      font-size: 11px;
      color: var(--muted);
    }

    .asset-settings-empty {
      text-align: center;
      padding: 56px 20px;
      color: var(--muted);
    }
    .asset-settings-empty-icon {
      font-size: 40px;
      margin-bottom: 14px;
      opacity: 0.7;
    }
    .asset-settings-empty h4 {
      font-size: 16px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 6px;
      font-family: 'Sora', sans-serif;
    }
    .asset-settings-empty p {
      font-size: 13.5px;
    }
    .asset-settings-loading {
      text-align: center;
      padding: 56px 20px;
    }
    .asset-settings-spinner {
      width: 34px;
      height: 34px;
      border: 3px solid var(--border);
      border-top-color: var(--navy);
      border-radius: 50%;
      margin: 0 auto 14px;
      animation: spin 0.8s linear infinite;
    }

    .asset-settings-search-hint {
      font-size: 12px;
      color: var(--muted);
      margin-top: 8px;
    }

    /* Toast */
    .asset-settings-toast {
      position: fixed;
      bottom: 28px;
      right: 28px;
      z-index: 99999;
      padding: 14px 24px;
      border-radius: 13px;
      box-shadow: 0 10px 32px rgba(0,0,0,0.18);
      font-size: 14px;
      font-weight: 700;
      animation: slideIn 0.3s ease;
      font-family: 'Sora', sans-serif;
    }
    .asset-settings-toast.success { background: var(--green); color: white; }
    .asset-settings-toast.error { background: var(--red); color: white; }

    @media (max-width: 720px) {
      .asset-settings-page { padding: 24px 16px 48px; }
      .asset-settings-header { flex-direction: column; align-items: stretch; }
      .asset-settings-header-right { justify-content: space-between; }
      .asset-settings-selected-item { flex-wrap: wrap; gap: 8px; }
      .asset-settings-grant-section { justify-content: stretch; }
      .asset-settings-grant-section .asset-settings-btn { width: 100%; }
    }
  `;

  return (
    <div className="asset-settings-page">
      <style>{sharedCSS}</style>

      {/* Header */}
      <div className="asset-settings-header">
        <div className="asset-settings-header-left">
          
          <div>
            <div className="asset-settings-eyebrow">Settings</div>
            <h1>📦 Asset Registry Access</h1>
            <div className="asset-settings-header-sub">
              Grant and manage users who can view the Asset Registry
            </div>
          </div>
        </div>
        <div className="asset-settings-header-right">
          <span className="asset-settings-count-badge">
            {assetAccessUsers.length} user{assetAccessUsers.length === 1 ? '' : 's'}
          </span>
          <button className="asset-settings-back-btn" onClick={() => navigate('/settings')}>
            ← Back
          </button>
        </div>
      </div>

      {/* Main Card */}
      <div className="asset-settings-card">
        <div className="asset-settings-card-title">
          👥 Users with Asset Registry Access
          <span className="asset-settings-card-title-count">
            {assetAccessUsers.length} total
          </span>
        </div>

        {/* ─── Live Search for Users ─── */}
        <div className="asset-settings-form-group">
          <label className="asset-settings-form-label">Search users to add</label>
          <div className="asset-settings-user-search-wrapper">
            <input
              ref={inputRef}
              className="asset-settings-form-input"
              placeholder="Search by name or email (min 2 characters)..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => searchQuery.length >= 2 && searchResults.length > 0 && setShowDropdown(true)}
              autoComplete="off"
            />
            {searching && (
              <div className="asset-settings-search-hint">⏳ Searching Azure AD...</div>
            )}
            {showDropdown && searchResults.length > 0 && (
              <div ref={dropdownRef} className="asset-settings-user-dropdown">
                {searchResults.map(user => (
                  <div
                    key={user.id}
                    className="asset-settings-dd-item"
                    onClick={() => selectUser(user)}
                  >
                    <div className="asset-settings-dd-avatar">
                      {user.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="asset-settings-dd-name">{user.displayName}</div>
                      <div className="asset-settings-dd-email">{user.mail}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─── Selected Users List ─── */}
        {selectedUsers.length > 0 && (
          <>
            <div className="asset-settings-selected-users">
              <div className="asset-settings-selected-header">
                <span>📌 Selected Users ({selectedUsers.length})</span>
                <button
                  className="asset-settings-btn asset-settings-btn-sm asset-settings-btn-secondary"
                  onClick={() => setSelectedUsers([])}
                  style={{ padding: '4px 12px', minHeight: '28px', fontSize: '11px' }}
                >
                  Clear All
                </button>
              </div>
              {selectedUsers.map((user, index) => (
                <div key={index} className="asset-settings-selected-item">
                  <div className="asset-settings-selected-item-left">
                    <div className="asset-settings-selected-avatar">
                      {user.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="asset-settings-selected-name">{user.displayName}</div>
                      <div className="asset-settings-selected-email">{user.mail}</div>
                    </div>
                  </div>
                  <button
                    className="asset-settings-selected-remove"
                    onClick={() => removeUserFromSelection(user.mail)}
                    title="Remove from selection"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* ─── Grant Access Button ─── */}
            <div className="asset-settings-grant-section">
              <button
                className="asset-settings-btn asset-settings-btn-success"
                onClick={handleGrantAccess}
                disabled={submitting || selectedUsers.length === 0}
                style={{ minWidth: '220px' }}
              >
                {submitting ? (
                  '⏳ Granting...'
                ) : (
                  `✅ Grant Access to All Selected (${selectedUsers.length})`
                )}
              </button>
            </div>
          </>
        )}

        {/* ─── Already Have Access List ─── */}
        <div style={{ marginTop: selectedUsers.length > 0 ? '28px' : '16px' }}>
          <div style={{
            fontSize: '13px',
            fontWeight: '700',
            color: 'var(--muted)',
            marginBottom: '12px',
            borderBottom: '1px solid var(--border)',
            paddingBottom: '8px'
          }}>
            Users with Asset Registry Access
          </div>

          {loading ? (
            <div className="asset-settings-loading" style={{ padding: '20px' }}>
              <div className="asset-settings-spinner" style={{ width: '24px', height: '24px' }} />
            </div>
          ) : assetAccessUsers.length === 0 ? (
            <div className="asset-settings-empty" style={{ padding: '32px 20px' }}>
              <div className="asset-settings-empty-icon">📦</div>
              <h4>No users have Asset Registry access</h4>
              <p>Search and add users above to grant them access to the Asset Registry.</p>
            </div>
          ) : (
            <div className="asset-settings-access-list">
              {assetAccessUsers.map(user => (
                <div key={user._id} className="asset-settings-access-item">
                  <div className="asset-settings-access-item-left">
                    <div className="asset-settings-access-avatar">
                      {user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="asset-settings-access-email">{user.email}</div>
                      <div className="asset-settings-access-name">{user.name || '—'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className="asset-settings-access-meta">
                      Added {user.addedAt ? new Date(user.addedAt).toLocaleDateString() : '—'}
                    </span>
                    <button
                      className="asset-settings-btn asset-settings-btn-danger asset-settings-btn-sm"
                      onClick={() => handleRemoveAccess(user._id, user.email)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast.open && (
        <div className={`asset-settings-toast ${toast.type}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}
    </div>
  );
}