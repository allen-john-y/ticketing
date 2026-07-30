// src/SettingsPages/OffboardingSettings.js
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import axios from 'axios';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

export default function OffboardingSettings() {
  const navigate = useNavigate();
  const { instance, accounts } = useMsal();
  const currentUser = accounts[0] || {};

  // ✅ Mode toggle
  const [isEditing, setIsEditing] = useState(false);
  const [activeStep, setActiveStep] = useState(1);

  // ✅ State for IT Team
  const [itTeam, setItTeam] = useState([]);
  const [itSearchQuery, setItSearchQuery] = useState('');
  const [itResults, setItResults] = useState([]);
  const [searchingIt, setSearchingIt] = useState(false);
  const [showItDropdown, setShowItDropdown] = useState(false);
  const itInputRef = useRef(null);
  const itDropdownRef = useRef(null);

  // ✅ State for HR Team
  const [hrTeam, setHrTeam] = useState([]);
  const [hrSearchQuery, setHrSearchQuery] = useState('');
  const [hrResults, setHrResults] = useState([]);
  const [searchingHr, setSearchingHr] = useState(false);
  const [showHrDropdown, setShowHrDropdown] = useState(false);
  const hrInputRef = useRef(null);
  const hrDropdownRef = useRef(null);

  // ✅ State for Settings (no email template anymore)
  const [settings, setSettings] = useState({
    itTeam: [],
    hrTeam: [],
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', type: 'success' });

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      // IT dropdown
      if (itDropdownRef.current && !itDropdownRef.current.contains(e.target) &&
          itInputRef.current && !itInputRef.current.contains(e.target)) {
        setShowItDropdown(false);
      }
      // HR dropdown
      if (hrDropdownRef.current && !hrDropdownRef.current.contains(e.target) &&
          hrInputRef.current && !hrInputRef.current.contains(e.target)) {
        setShowHrDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ open: true, message, type });
    setTimeout(() => setToast(p => ({ ...p, open: false })), 3000);
  };

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${BACKEND}/api/offboarding/settings`);
      if (res.data) {
        setSettings(res.data);
        setItTeam(res.data.itTeam || []);
        setHrTeam(res.data.hrTeam || []);
        const hasData = res.data.itTeam?.length > 0 || res.data.hrTeam?.length > 0;
        setIsEditing(!hasData);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
      setIsEditing(true);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Search users AND distribution groups from Azure AD
  const searchUsersAndGroups = async (query) => {
    if (!query || query.trim().length < 2) {
      return { users: [], groups: [] };
    }

    try {
      const token = await instance.acquireTokenSilent({
        scopes: ['User.Read.All', 'Group.Read.All'],
        account: accounts[0],
      });

      const q = query.trim().replace(/'/g, "''");

      // Search Users
      const userFilter = `startswith(mail,'${q}') or startswith(displayName,'${q}') or startswith(userPrincipalName,'${q}')`;
      const userRes = await fetch(
        `https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(userFilter)}&$select=id,displayName,mail,userPrincipalName&$top=10`,
        { headers: { Authorization: `Bearer ${token.accessToken}` } }
      );
      const userData = await userRes.json();
      const users = (userData.value || []).map(u => ({
        id: u.id,
        displayName: u.displayName || u.mail || '(no name)',
        mail: u.mail || u.userPrincipalName || '',
        type: 'user',
      }));

      // Search Groups (Distribution Groups)
      const groupFilter = `startswith(displayName,'${q}') or startswith(mail,'${q}')`;
      const groupRes = await fetch(
        `https://graph.microsoft.com/v1.0/groups?$filter=${encodeURIComponent(groupFilter)}&$select=id,displayName,mail&$top=10`,
        { headers: { Authorization: `Bearer ${token.accessToken}` } }
      );
      const groupData = await groupRes.json();
      const groups = (groupData.value || [])
        .filter(g => g.mail) // Only groups with email (distribution groups)
        .map(g => ({
          id: g.id,
          displayName: g.displayName || '(no name)',
          mail: g.mail || '',
          type: 'group',
        }));

      return { users, groups };
    } catch (err) {
      console.error('Error searching users/groups:', err);
      return { users: [], groups: [] };
    }
  };

  // ✅ IT Team Search (Users + Groups)
  const handleItSearch = async (value) => {
    setItSearchQuery(value);
    if (!value || value.trim().length < 2) {
      setItResults([]);
      setShowItDropdown(false);
      setSearchingIt(false);
      return;
    }

    setSearchingIt(true);
    setShowItDropdown(true);

    const { users, groups } = await searchUsersAndGroups(value);
    const existingEmails = new Set(itTeam.map(m => m.mail.toLowerCase()));

    const filteredUsers = users.filter(u => !existingEmails.has(u.mail.toLowerCase()));
    const filteredGroups = groups.filter(g => !existingEmails.has(g.mail.toLowerCase()));

    // Combine users and groups, with groups labeled
    const combined = [
      ...filteredUsers.map(u => ({ ...u, type: 'user' })),
      ...filteredGroups.map(g => ({ ...g, type: 'group' })),
    ];
    setItResults(combined);
    setSearchingIt(false);
  };

  const addItMember = (member) => {
    setItTeam(prev => [...prev, member]);
    setItSearchQuery('');
    setItResults([]);
    setShowItDropdown(false);
  };

  const removeItMember = (memberId) => {
    setItTeam(prev => prev.filter(m => m.id !== memberId));
  };

  // ✅ HR Team Search (Users + Groups)
  const handleHrSearch = async (value) => {
    setHrSearchQuery(value);
    if (!value || value.trim().length < 2) {
      setHrResults([]);
      setShowHrDropdown(false);
      setSearchingHr(false);
      return;
    }

    setSearchingHr(true);
    setShowHrDropdown(true);

    const { users, groups } = await searchUsersAndGroups(value);
    const existingEmails = new Set(hrTeam.map(m => m.mail.toLowerCase()));

    const filteredUsers = users.filter(u => !existingEmails.has(u.mail.toLowerCase()));
    const filteredGroups = groups.filter(g => !existingEmails.has(g.mail.toLowerCase()));

    // Combine users and groups, with groups labeled
    const combined = [
      ...filteredUsers.map(u => ({ ...u, type: 'user' })),
      ...filteredGroups.map(g => ({ ...g, type: 'group' })),
    ];
    setHrResults(combined);
    setSearchingHr(false);
  };

  const addHrMember = (member) => {
    setHrTeam(prev => [...prev, member]);
    setHrSearchQuery('');
    setHrResults([]);
    setShowHrDropdown(false);
  };

  const removeHrMember = (memberId) => {
    setHrTeam(prev => prev.filter(m => m.id !== memberId));
  };

  // ✅ Navigation (only 3 steps now)
  const goToStep = (step) => {
    if (step >= 1 && step <= 3) {
      setActiveStep(step);
    }
  };

  const nextStep = () => {
    if (activeStep < 3) {
      setActiveStep(activeStep + 1);
    }
  };

  const prevStep = () => {
    if (activeStep > 1) {
      setActiveStep(activeStep - 1);
    }
  };

  // ✅ Save Settings
  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setItTeam(settings.itTeam || []);
    setHrTeam(settings.hrTeam || []);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (itTeam.length === 0 && hrTeam.length === 0) {
      showToast('Please add at least one IT or HR team member', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        itTeam: itTeam,
        hrTeam: hrTeam,
        updatedBy: {
          id: currentUser.localAccountId || '',
          name: currentUser.name || '',
          email: currentUser.username || '',
        },
      };

      await axios.post(`${BACKEND}/api/offboarding/settings`, payload);
      
      setSettings(prev => ({
        ...prev,
        itTeam: itTeam,
        hrTeam: hrTeam,
      }));
      
      showToast('Offboarding settings saved successfully!', 'success');
      setIsEditing(false);
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to save settings';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ✅ Render Step Content (only 3 steps now)
  const renderStep = () => {
    switch (activeStep) {
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      default:
        return null;
    }
  };

  // ✅ Step 1: Reporting Manager (Simplified - just a label)
  const renderStep1 = () => (
    <div className="os-step-content">
      <div className="os-step-description">
        This is the employee's reporting manager. This information is auto-populated from employee data and cannot be edited here.
      </div>
      
      <div className="os-readonly-card">
        <div className="os-readonly-row">
          <span className="os-readonly-label">Reporting Manager:</span>
          <span className="os-readonly-value">Auto-populated from employee data</span>
        </div>
        <div className="os-readonly-info">
          ℹ️ The reporting manager will be assigned when the offboarding process is initiated for a specific employee.
        </div>
      </div>
    </div>
  );

  // ✅ Step 2: IT Team (Search Users + Distribution Groups)
  const renderStep2 = () => (
    <div className="os-step-content">
      <div className="os-step-description">
        Search and select IT team members or distribution groups who will handle offboarding tasks (asset collection, access removal, etc.).
      </div>

      <div style={{ position: 'relative', marginBottom: '14px' }}>
        <input
          ref={itInputRef}
          className="os-input"
          placeholder="Search by name or email (users & distribution groups)..."
          value={itSearchQuery}
          onChange={e => handleItSearch(e.target.value)}
          onFocus={() => itSearchQuery.length >= 2 && setShowItDropdown(true)}
          autoComplete="off"
          disabled={!isEditing}
        />
        {searchingIt && (
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '6px' }}>Searching...</div>
        )}
        {showItDropdown && itResults.length > 0 && (
          <div ref={itDropdownRef} className="os-user-dropdown">
            {itResults.map(member => (
              <div key={member.id} className="os-dd-item" onClick={() => addItMember(member)}>
                <div className="os-dd-avatar" style={{ background: member.type === 'group' ? '#7c3aed' : 'var(--navy)' }}>
                  {member.type === 'group' ? '👥' : member.displayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="os-dd-name">
                    {member.displayName}
                    {member.type === 'group' && (
                      <span style={{ 
                        fontSize: '10px', 
                        background: '#7c3aed', 
                        color: 'white', 
                        padding: '2px 8px', 
                        borderRadius: '12px', 
                        marginLeft: '8px' 
                      }}>
                        Group
                      </span>
                    )}
                  </div>
                  <div className="os-dd-email">{member.mail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="os-selected-tags">
        {itTeam.length > 0 ? (
          itTeam.map(member => (
            <span key={member.id} className={`os-tag ${member.type === 'group' ? 'os-tag-group' : ''}`}>
              {member.displayName} ({member.mail})
              {member.type === 'group' && (
                <span style={{ 
                  fontSize: '9px', 
                  background: '#7c3aed', 
                  color: 'white', 
                  padding: '1px 8px', 
                  borderRadius: '10px', 
                  marginLeft: '6px' 
                }}>
                  Group
                </span>
              )}
              {isEditing && (
                <button className="os-tag-remove" onClick={() => removeItMember(member.id)}>✕</button>
              )}
            </span>
          ))
        ) : (
          <div className="os-placeholder" style={{ padding: '10px' }}>
            No IT team members or groups added yet. Search and add users/groups above.
          </div>
        )}
      </div>
    </div>
  );

  // ✅ Step 3: HR Team (Search Users + Distribution Groups)
  const renderStep3 = () => (
    <div className="os-step-content">
      <div className="os-step-description">
        Search and select HR team members or distribution groups who will handle offboarding tasks (exit interviews, final settlement, etc.).
      </div>

      <div style={{ position: 'relative', marginBottom: '14px' }}>
        <input
          ref={hrInputRef}
          className="os-input"
          placeholder="Search by name or email (users & distribution groups)..."
          value={hrSearchQuery}
          onChange={e => handleHrSearch(e.target.value)}
          onFocus={() => hrSearchQuery.length >= 2 && setShowHrDropdown(true)}
          autoComplete="off"
          disabled={!isEditing}
        />
        {searchingHr && (
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '6px' }}>Searching...</div>
        )}
        {showHrDropdown && hrResults.length > 0 && (
          <div ref={hrDropdownRef} className="os-user-dropdown">
            {hrResults.map(member => (
              <div key={member.id} className="os-dd-item" onClick={() => addHrMember(member)}>
                <div className="os-dd-avatar" style={{ background: member.type === 'group' ? '#7c3aed' : '#7c3aed' }}>
                  {member.type === 'group' ? '👥' : member.displayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="os-dd-name">
                    {member.displayName}
                    {member.type === 'group' && (
                      <span style={{ 
                        fontSize: '10px', 
                        background: '#7c3aed', 
                        color: 'white', 
                        padding: '2px 8px', 
                        borderRadius: '12px', 
                        marginLeft: '8px' 
                      }}>
                        Group
                      </span>
                    )}
                  </div>
                  <div className="os-dd-email">{member.mail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="os-selected-tags">
        {hrTeam.length > 0 ? (
          hrTeam.map(member => (
            <span key={member.id} className={`os-tag os-tag-hr ${member.type === 'group' ? 'os-tag-group' : ''}`}>
              {member.displayName} ({member.mail})
              {member.type === 'group' && (
                <span style={{ 
                  fontSize: '9px', 
                  background: '#7c3aed', 
                  color: 'white', 
                  padding: '1px 8px', 
                  borderRadius: '10px', 
                  marginLeft: '6px' 
                }}>
                  Group
                </span>
              )}
              {isEditing && (
                <button className="os-tag-remove" onClick={() => removeHrMember(member.id)}>✕</button>
              )}
            </span>
          ))
        ) : (
          <div className="os-placeholder" style={{ padding: '10px' }}>
            No HR team members or groups added yet. Search and add users/groups above.
          </div>
        )}
      </div>
    </div>
  );

  // ✅ Render Step Indicator (only 3 steps now)
  const renderStepIndicator = () => (
    <div className="os-step-indicator">
      <div className={`os-step-dot ${activeStep >= 1 ? 'active' : ''}`} onClick={() => goToStep(1)}>
        <span className="os-step-num">1</span>
        <span className="os-step-label">Reporting Manager</span>
      </div>
      <div className={`os-step-line ${activeStep >= 2 ? 'active' : ''}`} />
      <div className={`os-step-dot ${activeStep >= 2 ? 'active' : ''}`} onClick={() => goToStep(2)}>
        <span className="os-step-num">2</span>
        <span className="os-step-label">IT Team</span>
      </div>
      <div className={`os-step-line ${activeStep >= 3 ? 'active' : ''}`} />
      <div className={`os-step-dot ${activeStep >= 3 ? 'active' : ''}`} onClick={() => goToStep(3)}>
        <span className="os-step-num">3</span>
        <span className="os-step-label">HR Team</span>
      </div>
    </div>
  );

  const sharedCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --navy: #002060;
      --navy2: #003090;
      --orange: #e98404;
      --white: #ffffff;
      --bg: #f5f7fa;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #64748b;
      --light: #f8fafc;
      --green: #10b981;
      --red: #ef4444;
      --purple: #7c3aed;
    }

    .os-page {
      min-height: 70vh;
      width: 100%;
      max-width: 1100px;
      margin: 0 auto;
      padding: 32px 24px;
      font-family: 'Lato', sans-serif;
      color: var(--text);
      background: var(--bg);
    }

    .os-sticky-header {
      position: sticky;
      top: 0;
      z-index: 100;
      background: var(--bg);
      padding: 12px 0 16px 0;
      margin-bottom: 24px;
      border-bottom: 2px solid var(--border);
    }
    .os-sticky-inner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .os-sticky-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .os-sticky-left h1 {
      font-family: 'Sora', sans-serif;
      font-size: 22px;
      font-weight: 800;
      color: var(--navy);
      margin: 0;
    }
    .os-sticky-right {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .os-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 14px;
      border-radius: 30px;
      font-size: 12px;
      font-weight: 700;
      font-family: 'Sora', sans-serif;
    }
    .os-status-badge.preview {
      background: rgba(16,185,129,0.1);
      color: #065f46;
      border: 1px solid #10b981;
    }
    .os-status-badge.edit {
      background: rgba(233,132,4,0.1);
      color: #92400e;
      border: 1px solid #e98404;
    }

    .os-count-badge {
      background: var(--navy);
      color: white;
      padding: 2px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
    }

    .os-back-btn {
      padding: 8px 16px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 10px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      color: var(--navy);
      font-family: 'Sora', sans-serif;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .os-back-btn:hover {
      border-color: var(--navy);
      background: rgba(0,32,96,0.04);
    }

    .os-btn {
      padding: 10px 24px;
      border: none;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .os-btn.primary {
      background: var(--navy);
      color: white;
    }
    .os-btn.primary:hover:not(:disabled) {
      background: var(--navy2);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,32,96,0.2);
    }
    .os-btn.primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .os-btn.secondary {
      background: var(--white);
      color: var(--text);
      border: 1.5px solid var(--border);
    }
    .os-btn.secondary:hover {
      border-color: var(--navy);
      color: var(--navy);
    }
    .os-btn.edit {
      background: var(--orange);
      color: white;
    }
    .os-btn.edit:hover {
      background: #d97706;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(233,132,4,0.3);
    }
    .os-btn.next {
      background: var(--purple);
      color: white;
    }
    .os-btn.next:hover:not(:disabled) {
      background: #6d28d9;
      transform: translateY(-2px);
    }
    .os-btn.prev {
      background: var(--white);
      color: var(--text);
      border: 1.5px solid var(--border);
    }
    .os-btn.prev:hover {
      border-color: var(--navy);
      color: var(--navy);
    }
    .os-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* ─── Step Indicator ─── */
    .os-step-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      margin-bottom: 28px;
      padding: 16px 20px;
      background: var(--white);
      border-radius: 16px;
      border: 1.5px solid var(--border);
    }
    .os-step-dot {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      padding: 6px 12px;
      border-radius: 30px;
      transition: all 0.3s;
      opacity: 0.5;
    }
    .os-step-dot.active {
      opacity: 1;
    }
    .os-step-dot.active .os-step-num {
      background: var(--navy);
      color: white;
    }
    .os-step-num {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--bg);
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      font-family: 'Sora', sans-serif;
      transition: all 0.3s;
    }
    .os-step-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text);
      font-family: 'Sora', sans-serif;
      white-space: nowrap;
    }
    .os-step-line {
      width: 30px;
      height: 2px;
      background: var(--border);
      transition: all 0.3s;
    }
    .os-step-line.active {
      background: var(--navy);
    }

    /* ─── Step Content ─── */
    .os-step-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      padding: 28px 32px;
      margin-bottom: 20px;
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .os-step-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .os-step-icon {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: rgba(0,32,96,0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      flex-shrink: 0;
    }
    .os-step-title {
      font-family: 'Sora', sans-serif;
      font-size: 18px;
      font-weight: 700;
      color: var(--navy);
    }
    .os-step-subtitle {
      font-size: 13px;
      color: var(--muted);
    }
    .os-step-description {
      font-size: 14px;
      color: var(--muted);
      margin-bottom: 18px;
      line-height: 1.6;
    }
    .os-step-content {
      min-height: 120px;
    }

    /* ─── Read-only Card ─── */
    .os-readonly-card {
      background: var(--bg);
      border: 1.5px solid var(--border);
      border-radius: 12px;
      padding: 18px 20px;
    }
    .os-readonly-row {
      display: flex;
      gap: 12px;
      padding: 6px 0;
    }
    .os-readonly-label {
      font-weight: 600;
      color: var(--text);
      min-width: 80px;
    }
    .os-readonly-value {
      color: var(--muted);
    }
    .os-readonly-info {
      margin-top: 10px;
      padding: 10px 14px;
      background: rgba(59,130,246,0.06);
      border-radius: 8px;
      font-size: 13px;
      color: var(--muted);
    }

    /* ─── User Dropdown ─── */
    .os-user-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 12px;
      margin-top: 6px;
      max-height: 260px;
      overflow-y: auto;
      z-index: 1000;
      box-shadow: 0 8px 24px rgba(0,32,96,0.12);
    }
    .os-dd-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      cursor: pointer;
      border-bottom: 1.5px solid var(--border);
      transition: background 0.15s;
    }
    .os-dd-item:hover {
      background: var(--bg);
    }
    .os-dd-avatar {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: var(--navy);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .os-dd-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--text);
    }
    .os-dd-email {
      font-size: 12px;
      color: var(--muted);
      margin-top: 2px;
    }

    /* ─── Tags ─── */
    .os-selected-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-height: 40px;
      padding: 8px 12px;
      background: var(--bg);
      border-radius: 10px;
      border: 1.5px solid var(--border);
    }
    .os-tag {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: rgba(0,32,96,0.06);
      border: 1.5px solid rgba(0,32,96,0.12);
      border-radius: 30px;
      font-size: 13px;
    }
    .os-tag-hr {
      background: rgba(124,58,237,0.08);
      border-color: rgba(124,58,237,0.2);
    }
    .os-tag-group {
      background: rgba(124,58,237,0.12);
      border-color: rgba(124,58,237,0.3);
    }
    .os-tag-remove {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--muted);
      font-size: 14px;
      padding: 0 4px;
      transition: color 0.15s;
    }
    .os-tag-remove:hover {
      color: var(--red);
    }

    /* ─── Step Navigation ─── */
    .os-step-nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 20px;
      padding-top: 18px;
      border-top: 1.5px solid var(--border);
    }
    .os-step-nav-left {
      display: flex;
      gap: 10px;
    }
    .os-step-nav-right {
      display: flex;
      gap: 10px;
    }
    .os-step-counter {
      font-size: 13px;
      color: var(--muted);
    }

    .os-label {
      display: block;
      font-family: 'Sora', sans-serif;
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 6px;
    }

    .os-input {
      width: 100%;
      padding: 10px 14px;
      border: 1.5px solid var(--border);
      border-radius: 10px;
      font-size: 14px;
      font-family: 'Lato', sans-serif;
      transition: all 0.2s;
      background: var(--white);
      color: var(--text);
    }
    .os-input:focus {
      outline: none;
      border-color: var(--navy);
      box-shadow: 0 0 0 4px rgba(0,32,96,0.08);
    }
    .os-input:disabled {
      background: var(--bg);
      color: var(--muted);
      cursor: not-allowed;
    }

    .os-placeholder {
      color: var(--muted);
      font-size: 14px;
      text-align: center;
    }

    .os-loading {
      text-align: center;
      padding: 40px;
    }
    .os-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--border);
      border-top-color: var(--navy);
      border-radius: 50%;
      margin: 0 auto 16px;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .os-toast {
      position: fixed;
      bottom: 32px;
      right: 32px;
      z-index: 99999;
      padding: 14px 24px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      font-size: 14px;
      font-weight: 600;
      animation: slideIn 0.3s ease;
      font-family: 'Sora', sans-serif;
    }
    .os-toast.success {
      background: var(--green);
      color: white;
    }
    .os-toast.error {
      background: var(--red);
      color: white;
    }
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    @media (max-width: 768px) {
      .os-page { padding: 16px; }
      .os-sticky-inner { flex-direction: column; align-items: stretch; gap: 8px; }
      .os-sticky-left { flex-wrap: wrap; }
      .os-sticky-right { flex-wrap: wrap; }
      .os-sticky-right .os-btn { flex: 1; justify-content: center; }
      .os-step-card { padding: 20px; }
      .os-step-indicator { flex-wrap: wrap; gap: 4px; padding: 12px; }
      .os-step-dot { padding: 4px 8px; }
      .os-step-label { font-size: 10px; }
      .os-step-line { width: 15px; }
      .os-step-nav { flex-direction: column; gap: 12px; }
      .os-step-nav-left, .os-step-nav-right { width: 100%; }
      .os-step-nav-left .os-btn, .os-step-nav-right .os-btn { flex: 1; justify-content: center; }
    }
  `;

  if (loading) {
    return (
      <div className="os-page">
        <style>{sharedCSS}</style>
        <div className="os-loading">
          <div className="os-spinner" />
          <p style={{ color: 'var(--muted)' }}>Loading offboarding settings...</p>
        </div>
      </div>
    );
  }

  const hasSettingsData = itTeam.length > 0 || hrTeam.length > 0;

  return (
    <div className="os-page">
      <style>{sharedCSS}</style>

      {/* Sticky Header */}
      <div className="os-sticky-header">
        <div className="os-sticky-inner">
          <div className="os-sticky-left">
            <h1>🚪 Offboarding Settings</h1>
            <span className={`os-status-badge ${isEditing ? 'edit' : 'preview'}`}>
              {isEditing ? '✏️ Editing' : '👁️ Preview'}
            </span>
            {hasSettingsData && !isEditing && (
              <>
                <span className="os-count-badge">{itTeam.length} IT</span>
                <span className="os-count-badge">{hrTeam.length} HR</span>
              </>
            )}
          </div>
          <div className="os-sticky-right">
            <button className="os-back-btn" onClick={() => navigate('/settings')}>
              ← Back
            </button>
            {isEditing ? (
              <>
                <button className="os-btn secondary" onClick={handleCancel} disabled={saving}>
                  Cancel
                </button>
                <button className="os-btn primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : '💾 Save'}
                </button>
              </>
            ) : (
              <button className="os-btn edit" onClick={handleEdit}>
                ✏️ Edit Settings
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Step Indicator */}
      {renderStepIndicator()}

      {/* Step Content Card */}
      <div className="os-step-card">
        <div className="os-step-header">
          <div className="os-step-icon">
            {activeStep === 1 && '👤'}
            {activeStep === 2 && '💻'}
            {activeStep === 3 && '👔'}
          </div>
          <div>
            <div className="os-step-title">
              Step {activeStep} of 3: 
              {activeStep === 1 && ' Reporting Manager'}
              {activeStep === 2 && ' IT Team'}
              {activeStep === 3 && ' HR Team'}
            </div>
            <div className="os-step-subtitle">
              {activeStep === 1 && 'Auto-populated from employee data'}
              {activeStep === 2 && 'Search and select IT team members or distribution groups from Azure AD'}
              {activeStep === 3 && 'Search and select HR team members or distribution groups from Azure AD'}
            </div>
          </div>
        </div>

        {renderStep()}

        {/* Step Navigation */}
        <div className="os-step-nav">
          <div className="os-step-nav-left">
            {activeStep > 1 && (
              <button className="os-btn prev" onClick={prevStep} disabled={saving}>
                ← Previous
              </button>
            )}
          </div>
          <div className="os-step-nav-right">
            <span className="os-step-counter">
              Step {activeStep} of 3
            </span>
            {activeStep < 3 ? (
              <button className="os-btn next" onClick={nextStep} disabled={saving}>
                Next →
              </button>
            ) : (
              !isEditing && (
                <button className="os-btn edit" onClick={handleEdit}>
                  ✏️ Edit Settings
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast.open && (
        <div className={`os-toast ${toast.type}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}
    </div>
  );
}