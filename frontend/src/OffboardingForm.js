// src/OffboardingForm.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import axios from 'axios';
import offboardingImg from './SettingsPages/offboarding.png';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

function OffboardingForm() {
  const navigate = useNavigate();
  const { instance, accounts } = useMsal();
  const currentUser = accounts[0] || {};
  const currentUserName = currentUser.name || currentUser.username || 'User';

  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', type: 'success' });

  // Disable/Delete + Immediate/Schedule modal
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState('disable'); // 'disable' | 'delete'
  const [scheduleType, setScheduleType] = useState('immediate'); // 'immediate' | 'scheduled'
  const [scheduledAt, setScheduledAt] = useState('');
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    fetchAllUsers();
  }, []);

  const fetchAllUsers = async () => {
    setLoading(true);
    try {
      const token = await instance.acquireTokenSilent({
        scopes: ['User.Read.All'],
        account: accounts[0],
      });

      // Fetch all users from Azure AD (assignedLicenses tells us who actually has a license)
      const res = await fetch(
        'https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,mobilePhone,officeLocation,manager,assignedLicenses&$top=999',
        {
          headers: { Authorization: `Bearer ${token.accessToken}` },
        }
      );

      const data = await res.json();
      let allUsers = data.value || [];

      // Fetch manager details for each user
      allUsers = await Promise.all(
        allUsers.map(async (user) => {
          let reportingManager = 'N/A';
          let reportingManagerEmail = '';
          try {
            const managerRes = await fetch(
              `https://graph.microsoft.com/v1.0/users/${user.id}/manager?$select=displayName,mail,userPrincipalName`,
              { headers: { Authorization: `Bearer ${token.accessToken}` } }
            );
            if (managerRes.ok) {
              const managerData = await managerRes.json();
              reportingManager = managerData.displayName || 'N/A';
              reportingManagerEmail = managerData.mail || managerData.userPrincipalName || '';
            }
          } catch (err) {
            console.error(`Failed to fetch manager for ${user.id}:`, err);
          }

          return {
            id: user.id,
            name: user.displayName || 'Unknown',
            email: user.mail || user.userPrincipalName || 'N/A',
            reportingManager,
            reportingManagerEmail,
            licenseAssigned: (user.assignedLicenses && user.assignedLicenses.length > 0) ? 'Yes' : 'No',
            phoneNumber: user.mobilePhone || 'N/A',
            officeLocation: user.officeLocation || 'Remote',
          };
        })
      );

      setUsers(allUsers);
      setFilteredUsers(allUsers);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      showToast('Failed to load users from Azure', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setFilteredUsers(users);
      return;
    }
    const lowerQuery = query.toLowerCase();
    const filtered = users.filter(
      (user) =>
        user.name.toLowerCase().includes(lowerQuery) ||
        user.email.toLowerCase().includes(lowerQuery) ||
        user.phoneNumber.toLowerCase().includes(lowerQuery) ||
        user.officeLocation.toLowerCase().includes(lowerQuery)
    );
    setFilteredUsers(filtered);
  };

  const toggleUserSelection = (userId) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedUsers.size === filteredUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredUsers.map((u) => u.id)));
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ open: true, message, type });
    setTimeout(() => setToast((p) => ({ ...p, open: false })), 3000);
  };

  // "Submit Offboarding" on the main page just opens the disable/delete +
  // immediate/schedule modal — the actual API call happens after that's
  // confirmed, in handleConfirmOffboarding below.
  const handleSubmitOffboarding = () => {
    if (selectedUsers.size === 0) {
      showToast('Please select at least one user', 'error');
      return;
    }
    setActionType('disable');
    setScheduleType('immediate');
    setScheduledAt('');
    setModalError('');
    setShowActionModal(true);
  };

  const handleConfirmOffboarding = async () => {
    setModalError('');

    if (scheduleType === 'scheduled') {
      if (!scheduledAt) {
        setModalError('Please choose a date and time.');
        return;
      }
      if (new Date(scheduledAt).getTime() <= Date.now()) {
        setModalError('Scheduled date/time must be in the future.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const selectedUsersList = Array.from(selectedUsers).map((userId) =>
        users.find((u) => u.id === userId)
      );

      const payload = {
        selectedUsers: selectedUsersList,
        actionType,        // 'disable' | 'delete'
        scheduleType,       // 'immediate' | 'scheduled'
        scheduledAt: scheduleType === 'scheduled' ? new Date(scheduledAt).toISOString() : null,
        createdBy: currentUser.localAccountId || '',
        createdByName: currentUser.name || '',
        createdByEmail: currentUser.username || '',
        timestamp: new Date().toISOString(),
      };

      await axios.post(`${BACKEND}/api/offboarding/submit`, payload);

      setShowActionModal(false);
      showToast(
        `Offboarding (${actionType}) request for ${selectedUsers.size} user(s) submitted for approval!`,
        'success'
      );

      setTimeout(() => {
        navigate('/hr-request');
      }, 1500);
    } catch (err) {
      const errorMsg =
        err?.response?.data?.message || 'Failed to submit offboarding request';
      setModalError(errorMsg);
      console.error('Submit error:', err?.response?.data || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const sharedCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --navy:   #002060;
      --navy2:  #003090;
      --orange: #e98404;
      --orange2:#f5a623;
      --white:  #ffffff;
      --bg:     #f5f7fa;
      --border: #e2e8f0;
      --text:   #0f172a;
      --muted:  #64748b;
      --light:  #f8fafc;
      --green:  #10b981;
      --red:    #ef4444;
    }

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(18px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideInUp {
      from { opacity: 0; transform: translateY(100%); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .off-page {
      min-height: 100vh;
      width: 100%;
      background: var(--bg);
      font-family: 'Lato', sans-serif;
      color: var(--text);
      padding: 32px 0 0 0;
    }

    .off-content {
      max-width: 1400px;
      margin: 0 auto;
      padding: 32px 20px;
      padding-bottom: 120px;
    }

    .off-container {
      animation: fadeUp 0.4s ease both;
    }

    .off-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 24px;
      overflow: hidden;
    }

    .off-header {
      padding: 32px 36px;
      border-bottom: 1.5px solid var(--border);
      background: var(--light);
    }

    .off-title {
      font-family: 'Sora', sans-serif;
      font-size: 28px;
      font-weight: 800;
      color: var(--navy);
      letter-spacing: -0.02em;
      margin-bottom: 8px;
    }

    .off-subtitle {
      font-size: 16px;
      font-weight: 500;
      color: var(--muted);
    }

    .off-badge {
      padding: 5px 14px;
      border-radius: 30px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      background: var(--orange);
      color: white;
      display: inline-block;
      margin-top: 12px;
    }

    .off-service-banner {
      padding: 20px 36px;
      background: rgba(0, 32, 96, 0.03);
      border-bottom: 1.5px solid var(--border);
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .off-service-icon {
      width: 52px;
      height: 52px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(233, 132, 4, 0.15);
      overflow: hidden;
      padding: 6px;
    }
    .off-service-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 10px;
    }

    .off-service-name {
      font-family: 'Sora', sans-serif;
      font-size: 18px;
      font-weight: 700;
      color: var(--navy);
    }

    .off-service-type {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      padding: 4px 12px;
      border-radius: 30px;
      margin-top: 6px;
      display: inline-block;
      background: rgba(233, 132, 4, 0.15);
      color: var(--orange);
    }

    .off-body {
      padding: 36px;
    }

    .off-search-section {
      margin-bottom: 28px;
    }

    .off-search-label {
      display: block;
      font-family: 'Sora', sans-serif;
      font-size: 13px;
      font-weight: 700;
      color: var(--navy);
      margin-bottom: 12px;
      letter-spacing: 0.02em;
    }

    .off-search-input {
      width: 100%;
      max-width: 400px;
      padding: 14px 18px;
      border: 1.5px solid var(--border);
      border-radius: 14px;
      font-size: 14px;
      background: var(--white);
      color: var(--text);
      font-family: 'Lato', sans-serif;
      transition: all 0.2s;
    }

    .off-search-input:focus {
      outline: none;
      border-color: var(--navy);
      box-shadow: 0 0 0 4px rgba(0, 32, 96, 0.08);
    }

    .off-table-wrapper {
      overflow-x: auto;
      border-radius: 14px;
      border: 1.5px solid var(--border);
    }

    .off-table {
      width: 100%;
      border-collapse: collapse;
      background: var(--white);
    }

    .off-table thead {
      background: var(--light);
      border-bottom: 1.5px solid var(--border);
    }

    .off-table th {
      padding: 16px 18px;
      text-align: left;
      font-family: 'Sora', sans-serif;
      font-size: 13px;
      font-weight: 700;
      color: var(--navy);
      letter-spacing: 0.02em;
    }

    .off-table td {
      padding: 16px 18px;
      border-bottom: 1.5px solid var(--border);
      font-size: 14px;
      color: var(--text);
    }

    .off-table tbody tr {
      transition: background 0.15s;
    }

    .off-table tbody tr:hover {
      background: rgba(0, 32, 96, 0.02);
    }

    .off-table tbody tr:last-child td {
      border-bottom: none;
    }

    .off-checkbox {
      accent-color: var(--navy);
      width: 20px;
      height: 20px;
      cursor: pointer;
    }

    .off-user-name {
      font-weight: 600;
      color: var(--navy);
    }

    .off-user-email {
      font-size: 13px;
      color: var(--muted);
      margin-top: 4px;
    }

    .off-select-all-label {
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      font-weight: 600;
      color: var(--navy);
    }

    .off-loading {
      text-align: center;
      padding: 60px 20px;
      color: var(--muted);
    }

    .off-loading-spinner {
      display: inline-block;
      width: 32px;
      height: 32px;
      border: 3px solid var(--border);
      border-top-color: var(--navy);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 16px;
    }

    .off-empty {
      text-align: center;
      padding: 60px 20px;
      color: var(--muted);
    }

    .off-selection-info {
      padding: 16px 36px;
      background: rgba(0, 32, 96, 0.03);
      border-bottom: 1.5px solid var(--border);
      font-size: 15px;
      color: var(--navy);
      font-weight: 600;
    }

    /* Fixed Footer Styles */
    .off-footer-wrapper {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: var(--white);
      border-top: 1.5px solid var(--border);
      box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.08);
      z-index: 999;
      animation: slideInUp 0.3s ease both;
    }

    .off-footer-wrapper.hidden {
      display: none;
    }

    .off-footer {
      max-width: 1400px;
      margin: 0 auto;
      display: flex;
      justify-content: flex-end;
      gap: 16px;
      padding: 20px 36px;
      padding-right: 56px;
    }

    .off-btn-cancel {
      padding: 16px 28px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      font-size: 15px;
      font-weight: 600;
      color: var(--muted);
      cursor: pointer;
      transition: all 0.2s;
      font-family: 'Sora', sans-serif;
    }

    .off-btn-cancel:hover {
      border-color: var(--navy);
      color: var(--navy);
    }

    .off-btn-submit {
      padding: 16px 36px;
      background: var(--navy);
      border: none;
      border-radius: 14px;
      font-size: 15px;
      font-weight: 700;
      color: white;
      cursor: pointer;
      transition: all 0.3s;
      font-family: 'Sora', sans-serif;
      box-shadow: 0 4px 12px rgba(0, 32, 96, 0.2);
      white-space: nowrap;
    }

    .off-btn-submit:hover:not(:disabled) {
      background: var(--navy2);
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0, 32, 96, 0.25);
    }

    .off-btn-submit:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .off-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10002;
      padding: 20px;
    }

    .off-modal {
      background: var(--white);
      border-radius: 20px;
      width: 100%;
      max-width: 480px;
      max-height: 90vh;
      overflow-y: auto;
      animation: fadeUp 0.25s ease both;
      box-shadow: 0 20px 60px rgba(0,0,0,0.25);
    }

    .off-modal-header {
      padding: 24px 28px;
      border-bottom: 1.5px solid var(--border);
    }

    .off-modal-title {
      font-family: 'Sora', sans-serif;
      font-size: 20px;
      font-weight: 800;
      color: var(--navy);
    }

    .off-modal-subtitle {
      font-size: 14px;
      color: var(--muted);
      margin-top: 4px;
    }

    .off-modal-body {
      padding: 24px 28px;
      display: flex;
      flex-direction: column;
      gap: 22px;
    }

    .off-modal-section-label {
      font-family: 'Sora', sans-serif;
      font-size: 13px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 10px;
      display: block;
    }

    .off-radio-group {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .off-radio-option {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 14px 16px;
      border: 1.5px solid var(--border);
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .off-radio-option.selected {
      border-color: var(--navy);
      background: #eef2ff;
    }

    .off-radio-option input {
      margin-top: 2px;
      accent-color: var(--navy);
    }

    .off-radio-text-title {
      font-weight: 700;
      font-size: 14px;
      color: var(--text);
    }

    .off-radio-text-desc {
      font-size: 12.5px;
      color: var(--muted);
      margin-top: 2px;
    }

    .off-radio-option.danger.selected {
      border-color: var(--red);
      background: #fef2f2;
    }

    .off-datetime-input {
      width: 100%;
      padding: 12px 14px;
      border: 1.5px solid var(--border);
      border-radius: 10px;
      font-size: 14px;
      font-family: 'Lato', sans-serif;
      color: var(--text);
    }

    .off-modal-error {
      background: #fef2f2;
      color: var(--red);
      border: 1px solid #fecaca;
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
    }

    .off-modal-footer {
      padding: 20px 28px;
      border-top: 1.5px solid var(--border);
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }

    .off-toast {
      position: fixed;
      bottom: 32px;
      right: 32px;
      z-index: 10001;
      padding: 16px 28px;
      border-radius: 14px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      font-size: 15px;
      font-weight: 600;
      animation: slideIn 0.3s ease;
      font-family: 'Sora', sans-serif;
    }

    .off-toast-success {
      background: var(--green);
      color: white;
    }

    .off-toast-error {
      background: var(--red);
      color: white;
    }

    @media (max-width: 768px) {
      .off-body {
        padding: 20px;
      }
      .off-header {
        padding: 24px 20px;
      }
      .off-content {
        padding: 20px;
        padding-bottom: 140px;
      }
      .off-footer {
        padding: 16px 20px;
        padding-right: 20px;
        flex-direction: column;
        gap: 12px;
      }
      .off-btn-cancel,
      .off-btn-submit {
        width: 100%;
      }
      .off-title {
        font-size: 22px;
      }
      .off-table {
        font-size: 12px;
      }
      .off-table th,
      .off-table td {
        padding: 12px 10px;
      }
      .off-search-input {
        max-width: 100%;
      }
    }
  `;

  return (
    <div className="off-page">
      <style>{sharedCSS}</style>

      <div className="off-content off-container">
        <div className="off-card">
          {/* Header */}
          <div className="off-header">
            <div className="off-title">Employee Offboarding</div>
            <div className="off-subtitle">Requested by {currentUserName}</div>
            <span className="off-badge">OFFBOARDING REQUEST</span>
          </div>

          {/* Service Banner */}
          <div className="off-service-banner">
            <div className="off-service-icon">
              <img src={offboardingImg} alt="Offboarding" className="off-service-img" />
            </div>
            <div>
              <div className="off-service-name">Employee Offboarding</div>
              <span className="off-service-type">OFFBOARDING</span>
            </div>
          </div>

          {/* Body */}
          <div className="off-body">
            {/* Search Section */}
            <div className="off-search-section">
              <label className="off-search-label">Search Employees</label>
              <input
                type="text"
                className="off-search-input"
                placeholder="Search by name, email, phone, or location..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>

            {/* Selection Info */}
            {selectedUsers.size > 0 && (
              <div className="off-selection-info">
                ✓ {selectedUsers.size} user(s) selected for offboarding
              </div>
            )}

            {/* Loading State */}
            {loading ? (
              <div className="off-loading">
                <div className="off-loading-spinner"></div>
                <p>Loading employees from Azure...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="off-empty">
                <p>
                  {searchQuery
                    ? 'No employees found matching your search'
                    : 'No employees available'}
                </p>
              </div>
            ) : (
              /* Table */
              <div className="off-table-wrapper">
                <table className="off-table">
                  <thead>
                    <tr>
                      <th style={{ width: '50px' }}>
                        <label className="off-select-all-label">
                          <input
                            type="checkbox"
                            className="off-checkbox"
                            checked={
                              selectedUsers.size === filteredUsers.length &&
                              filteredUsers.length > 0
                            }
                            onChange={toggleSelectAll}
                          />
                        </label>
                      </th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Reporting Manager</th>
                      <th>License Assigned</th>
                      <th>Phone Number</th>
                      <th>Office Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id}>
                        <td>
                          <input
                            type="checkbox"
                            className="off-checkbox"
                            checked={selectedUsers.has(user.id)}
                            onChange={() => toggleUserSelection(user.id)}
                          />
                        </td>
                        <td>
                          <div className="off-user-name">{user.name}</div>
                        </td>
                        <td>
                          <div className="off-user-email">{user.email}</div>
                        </td>
                        <td>{user.reportingManager}</td>
                        <td>{user.licenseAssigned}</td>
                        <td>{user.phoneNumber}</td>
                        <td>{user.officeLocation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fixed Footer - Only visible when checkboxes are selected */}
      <div className={`off-footer-wrapper ${selectedUsers.size === 0 ? 'hidden' : ''}`}>
        <div className="off-footer">
          <button className="off-btn-cancel" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button
            className="off-btn-submit"
            onClick={handleSubmitOffboarding}
            disabled={submitting || selectedUsers.size === 0}
          >
            {submitting
              ? 'Submitting...'
              : `Submit Offboarding (${selectedUsers.size} selected)`}
          </button>
        </div>
      </div>

      {/* Disable/Delete + Immediate/Schedule Modal */}
      {showActionModal && (
        <div
          className="off-modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget && !submitting) setShowActionModal(false); }}
        >
          <div className="off-modal">
            <div className="off-modal-header">
              <div className="off-modal-title">Offboarding Action</div>
              <div className="off-modal-subtitle">
                {selectedUsers.size} employee(s) selected
              </div>
            </div>

            <div className="off-modal-body">
              {/* Disable or Delete */}
              <div>
                <label className="off-modal-section-label">Action</label>
                <div className="off-radio-group">
                  <label className={`off-radio-option ${actionType === 'disable' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="actionType"
                      value="disable"
                      checked={actionType === 'disable'}
                      onChange={() => setActionType('disable')}
                    />
                    <div>
                      <div className="off-radio-text-title">Disable</div>
                      <div className="off-radio-text-desc">
                        Account is disabled in Azure AD after manager + IT approval.
                      </div>
                    </div>
                  </label>
                  <label className={`off-radio-option danger ${actionType === 'delete' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="actionType"
                      value="delete"
                      checked={actionType === 'delete'}
                      onChange={() => setActionType('delete')}
                    />
                    <div>
                      <div className="off-radio-text-title">Delete</div>
                      <div className="off-radio-text-desc">
                        Account is permanently deleted after manager + IT + HR approval.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Immediate or Schedule */}
              <div>
                <label className="off-modal-section-label">Timing</label>
                <div className="off-radio-group">
                  <label className={`off-radio-option ${scheduleType === 'immediate' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="scheduleType"
                      value="immediate"
                      checked={scheduleType === 'immediate'}
                      onChange={() => setScheduleType('immediate')}
                    />
                    <div>
                      <div className="off-radio-text-title">Immediate</div>
                      <div className="off-radio-text-desc">
                        Runs as soon as all required approvals are complete.
                      </div>
                    </div>
                  </label>
                  <label className={`off-radio-option ${scheduleType === 'scheduled' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="scheduleType"
                      value="scheduled"
                      checked={scheduleType === 'scheduled'}
                      onChange={() => setScheduleType('scheduled')}
                    />
                    <div>
                      <div className="off-radio-text-title">Schedule</div>
                      <div className="off-radio-text-desc">
                        Waits for approvals, then runs at the date/time you choose.
                      </div>
                    </div>
                  </label>
                </div>

                {scheduleType === 'scheduled' && (
                  <div style={{ marginTop: '12px' }}>
                    <input
                      type="datetime-local"
                      className="off-datetime-input"
                      value={scheduledAt}
                      min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                      onChange={(e) => setScheduledAt(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {modalError && <div className="off-modal-error">{modalError}</div>}
            </div>

            <div className="off-modal-footer">
              <button
                className="off-btn-cancel"
                onClick={() => setShowActionModal(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="off-btn-submit"
                onClick={handleConfirmOffboarding}
                disabled={submitting}
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast.open && (
        <div
          className={`off-toast ${
            toast.type === 'success' ? 'off-toast-success' : 'off-toast-error'
          }`}
        >
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}
    </div>
  );
}

export default OffboardingForm;