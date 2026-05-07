// AddRequest.js - DEBUG-CONSOLES ONLY
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { useNavigate } from "react-router-dom";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const SERVICE_TYPES = [
  { value: "GENERAL", label: "General", icon: "📋", color: "#e98404" },
  { value: "HARDWARE", label: "Hardware", icon: "💻", color: "#f59e0b" },
  { value: "SOFTWARE", label: "Software", icon: "🖥️", color: "#002060" },
  { value: "ACCESS", label: "Access", icon: "🔐", color: "#8b5cf6" },
  { value: "SERVICES", label: "Services", icon: "🛠️", color: "#10b981" },
];

const getServiceTypeInfo = (type) => SERVICE_TYPES.find(t => t.value === type) || SERVICE_TYPES[0];

const getCategoryType = (categoryName = "") => {
  const name = (categoryName || "").toUpperCase();
  if (name.includes("HARDWARE") || name.includes("LAPTOP") || name.includes("DEVICE")) return "HARDWARE";
  if (name.includes("SOFTWARE") || name.includes("LICENSE") || name.includes("APP")) return "SOFTWARE";
  if (name.includes("ACCESS") || name.includes("VPN") || name.includes("PERMISSION")) return "ACCESS";
  if (name.includes("SERVICE") || name.includes("SETUP") || name.includes("SUPPORT")) return "SERVICES";
  return "GENERAL";
};

const UserSearchDropdown = ({ hook, selected, onSelect, placeholder = "Search users..." }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <input
        className="ar-search-input"
        placeholder={placeholder}
        value={hook.query}
        onChange={e => hook.setQuery(e.target.value)}
        onFocus={() => setIsOpen(true)}
      />
      <span className="ar-select-arrow">▼</span>
      {hook.loading && (
        <div className="ar-dropdown-loading">Searching...</div>
      )}
      {isOpen && hook.results.length > 0 && (
        <div className="ar-dropdown">
          {hook.results.map(user => (
            <div
              key={user.id}
              className="ar-dropdown-item"
              onClick={() => { onSelect(user); hook.setQuery(''); setIsOpen(false); }}
              style={{ opacity: selected.find(s => s.id === user.id) ? 0.5 : 1 }}
            >
              <div className="ar-dropdown-name">{user.displayName}</div>
              <div className="ar-dropdown-email">{user.mail}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const useUserSearch = (acquireToken) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const token = await acquireToken();
        const q = query.trim().replace(/'/g, "''");
        const filter = `startswith(mail,'${q}') or startswith(displayName,'${q}') or startswith(userPrincipalName,'${q}')`;
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(filter)}&$select=id,displayName,mail,userPrincipalName&$top=5`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        setResults((data.value || []).map(u => ({
          id: u.id, displayName: u.displayName, mail: u.mail || u.userPrincipalName
        })));
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, acquireToken]);

  return { query, setQuery, results, loading };
};

export default function AddRequest() {
  const { accounts, instance } = useMsal();
  const navigate = useNavigate();
  const user = accounts[0] || {};
  const userEmail = user.username || "";
  const userName = user.name || "";

  const acquireToken = useCallback(async () => {
    const res = await instance.acquireTokenSilent({
      scopes: ['User.Read.All', 'Group.Read.All'],
      account: accounts[0],
    });
    return res.accessToken;
  }, [instance, accounts]);

  const approverSearch = useUserSearch(acquireToken);
  const memberSearch = useUserSearch(acquireToken);

  const [viewMode, setViewMode] = useState('tiles');
  const [editingId, setEditingId] = useState(null);

  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);

  const [assignmentGroups, setAssignmentGroups] = useState([]);
  const [distributionLists, setDistributionLists] = useState([]);
  const [loadingDLs, setLoadingDLs] = useState(false);

  const [requestName, setRequestName] = useState('');
  const [serviceType, setServiceType] = useState('GENERAL');
  const [description, setDescription] = useState('');

  const [selectedDL, setSelectedDL] = useState(null);
  const [dlSearchQuery, setDlSearchQuery] = useState('');
  const [dlMembers, setDlMembers] = useState([]);

  const [selectedAG, setSelectedAG] = useState(null);
  const [selectedAGMembers, setSelectedAGMembers] = useState([]);

  const [onBehalfEnabled, setOnBehalfEnabled] = useState(false);
  const [onBehalfRequired, setOnBehalfRequired] = useState(false);
  const [attachmentsEnabled, setAttachmentsEnabled] = useState(false);
  const [attachmentsRequired, setAttachmentsRequired] = useState(false);

  const [requireApproval, setRequireApproval] = useState(false);
  const [approvalType, setApprovalType] = useState('manager');
  const [requireAllApprovers, setRequireAllApprovers] = useState(false);
  const [customApprovers, setCustomApprovers] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ open: false, message: "", type: "success" });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    fetchServices();
    fetchAssignmentGroups();
  }, []);

  const fetchServices = async () => {
    setLoadingServices(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/services`);
      const data = await res.json();
      setServices(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch services:", err);
      showToast('Failed to load services', 'error');
    } finally {
      setLoadingServices(false);
    }
  };

  const fetchAssignmentGroups = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/assignment-groups`);
      const data = await res.json();
      setAssignmentGroups(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch assignment groups:", err);
    }
  };

  const normalizeMember = (m = {}) => ({
    id: m.id || m.memberId || m._id || m.email || m.mail || m.userPrincipalName || "",
    name: m.name || m.displayName || m.memberName || "",
    mail: m.mail || m.email || m.userPrincipalName || m.id || ""
  });

  const handleSelectAG = async (ag) => {
    console.log('[debug] handleSelectAG called', { ag });
    setSelectedAG(ag);

    if (!ag) {
      setSelectedAGMembers([]);
      return;
    }

    const embeddedMembers = ag.members || [];
    if (Array.isArray(embeddedMembers) && embeddedMembers.length > 0) {
      const normalized = embeddedMembers.map(normalizeMember);
      console.log('[debug] AG has embedded members normalized:', normalized);
      setSelectedAGMembers(normalized);
      if (normalized.length === 1) {
        console.log('[debug] single AG member auto-selected:', normalized[0]);
      }
      return;
    }

    const id = ag._id || ag.id;
    if (!id) {
      setSelectedAGMembers([]);
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/assignment-groups/${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = await res.json();
        const mems = Array.isArray(data.members) ? data.members : [];
        const normalized = mems.map(normalizeMember);
        console.log('[debug] fetched AG members normalized:', normalized);
        setSelectedAGMembers(normalized);
        if (normalized.length === 1) {
          console.log('[debug] single fetched AG member auto-selected:', normalized[0]);
        }
      } else {
        setSelectedAGMembers([]);
      }
    } catch (err) {
      console.warn('[debug] fetch AG members error:', err);
      setSelectedAGMembers([]);
    }
  };

  const loadDLs = useCallback(async () => {
    setLoadingDLs(true);
    try {
      const token = await acquireToken();
      const query = new URLSearchParams({
        $filter: 'mailEnabled eq true and securityEnabled eq false',
        $select: 'id,displayName,mail,mailNickname',
        $top: '200',
      });
      const res = await fetch(`https://graph.microsoft.com/v1.0/groups?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Graph error ${res.status}`);
      const { value = [] } = await res.json();
      setDistributionLists(value.filter(g => !g.groupTypes || g.groupTypes.length === 0));
    } catch (e) {
      console.error("Failed to load DLs:", e);
    } finally {
      setLoadingDLs(false);
    }
  }, [acquireToken]);

  const handleSelectDL = async (dl) => {
    setSelectedDL(dl);
    setDlMembers([]);
    try {
      const token = await acquireToken();
      const res = await fetch(`https://graph.microsoft.com/v1.0/groups/${dl.id}/members?$select=id,displayName,mail,userPrincipalName`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDlMembers((data.value || []).map(u => ({ id: u.id, name: u.displayName, mail: u.mail || u.userPrincipalName })));
      }
    } catch (e) {
      console.warn('Could not load DL members:', e.message || e);
    }
  };

  const showToast = (message, type = "success") => {
    setToast({ open: true, message, type });
    setTimeout(() => setToast({ open: false, message: "", type: "success" }), 3000);
  };

  // ✅ FIXED: handleEdit function
  const handleEdit = (service) => {
    console.log('[debug] handleEdit called for service:', service);
    setEditingId(service._id);
    setRequestName(service.serviceName || '');
    const detectedType = getCategoryType(service.category?.name || '');
    setServiceType(detectedType);
    setDescription(service.description || '');
    setSelectedDL(service.distributionList || null);
    if (service.distributionList) handleSelectDL(service.distributionList);

    const ag = service.assignmentGroups?.[0] || service.assignmentGroup || null;
    if (ag) {
      setSelectedAG(ag);
      const members = ag.members || [];
      if (members && members.length > 0) {
        const normalized = members.map(normalizeMember);
        console.log('[debug] handleEdit AG members from service:', normalized);
        setSelectedAGMembers(normalized);
      } else {
        setSelectedAG(null);
        setSelectedAGMembers([]);
      }
    } else {
      setSelectedAG(null);
      setSelectedAGMembers([]);
    }

    setOnBehalfEnabled(service.onBehalf?.enabled || false);
    setOnBehalfRequired(service.onBehalf?.required || false);
    setAttachmentsEnabled(service.attachmentsEnabled || false);
    setAttachmentsRequired(service.attachmentsRequired || false);
    setRequireApproval(service.approval?.required || false);
    if (service.approval?.dlMembers) setApprovalType('dlMembers');
    else if (service.approval?.reportingManager) setApprovalType('manager');
    else setApprovalType('custom');
    setRequireAllApprovers(service.approval?.requireAll || false);
    setCustomApprovers(service.approval?.otherApprovers || []);
    setViewMode('form');
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/services/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      showToast('Service deleted successfully', 'success');
      fetchServices();
      setShowDeleteConfirm(false);
      setDeletingId(null);
    } catch (err) {
      showToast('Failed to delete service', 'error');
    }
  };

  const handleSubmit = async () => {
    console.log('[debug] handleSubmit starting', {
      selectedAG,
      selectedAGMembers,
    });

    if (!requestName.trim()) {
      showToast("Request name is required", "error");
      return;
    }
    if (!selectedAG) {
      showToast("Assignment group is required", "error");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        serviceName: requestName.trim(),
        category: { id: serviceType, name: serviceType },
        description,
        distributionList: selectedDL ? { id: selectedDL.id, name: selectedDL.displayName, mail: selectedDL.mail } : null,
        assignmentGroup: selectedAG
            ? {
                groupId: selectedAG._id || selectedAG.id,
                groupName: selectedAG.name || selectedAG.groupName,
                members: selectedAGMembers.map(m => ({
                  id: m.id,
                  name: m.name,
                  email: m.mail || m.id
                }))
              }
            : null,
        onBehalf: { enabled: onBehalfEnabled, required: onBehalfRequired },
        attachmentsEnabled,
        attachmentsRequired,
        approval: {
          required: requireApproval,
          reportingManager: approvalType === 'manager',
          dlMembers: approvalType === 'dlMembers',
          requireAll: requireAllApprovers,
          otherApprovers: approvalType === 'custom' ? customApprovers : [],
        },
        createdBy: { id: user.localAccountId || "", name: userName, mail: userEmail },
      };

      const url = editingId ? `${BACKEND_URL}/api/services/${editingId}` : `${BACKEND_URL}/api/services`;
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Submission failed");

      showToast(editingId ? 'Service updated successfully' : 'Service created successfully', 'success');
      resetForm();
      setViewMode('tiles');
      fetchServices();
    } catch (err) {
      console.error("Submission error:", err);
      showToast("Failed: " + (err.message || "Unknown error"), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setRequestName('');
    setServiceType('GENERAL');
    setDescription('');
    setSelectedDL(null);
    setDlMembers([]);
    setSelectedAG(null);
    setSelectedAGMembers([]);
    setOnBehalfEnabled(false);
    setOnBehalfRequired(false);
    setAttachmentsEnabled(false);
    setAttachmentsRequired(false);
    setRequireApproval(false);
    setApprovalType('manager');
    setRequireAllApprovers(false);
    setCustomApprovers([]);
  };

  const handleCreateNew = () => {
    resetForm();
    setViewMode('form');
    loadDLs();
  };

  const handleCancel = () => {
    resetForm();
    setViewMode('tiles');
  };

  const filteredDLs = dlSearchQuery.trim().length < 1
    ? distributionLists
    : distributionLists.filter(d =>
        d.displayName?.toLowerCase().includes(dlSearchQuery.toLowerCase()) ||
        d.mail?.toLowerCase().includes(dlSearchQuery.toLowerCase())
      );

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
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    .ar-page {
      min-height: 100vh;
      width: 100%;
      background: var(--bg);
      font-family: 'Lato', sans-serif;
      color: var(--text);
    }

    /* Hero Section */
    .ar-hero {
      background: var(--navy);
      position: relative;
      overflow: hidden;
      padding: 48px 48px 44px;
    }
    .ar-hero::after {
      content: '';
      position: absolute;
      right: -60px; top: -60px;
      width: 420px; height: 420px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(233,132,4,0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .ar-hero-inner {
      position: relative; z-index: 2;
      max-width: 1320px; margin: 0 auto;
      animation: fadeUp 0.55s ease both;
    }
    .ar-hero-eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--orange);
      margin-bottom: 14px;
    }
    .ar-hero-eyebrow-line {
      width: 28px; height: 2px; background: var(--orange); border-radius: 2px;
    }
    .ar-hero h1 {
      font-family: 'Sora', sans-serif;
      font-size: clamp(28px, 3vw, 36px);
      font-weight: 800;
      color: #ffffff;
      line-height: 1.15;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .ar-hero h1 em {
      font-style: normal;
      color: var(--orange);
    }
    .ar-hero-sub {
      font-size: 15px; color: rgba(255,255,255,0.62);
      font-weight: 400; line-height: 1.6;
    }

    /* Content Area */
    .ar-content {
      max-width: 1320px;
      margin: 0 auto;
      padding: 32px 48px 56px;
    }

    .ar-back-btn {
      background: none; border: none;
      font-size: 14px; font-weight: 600;
      color: var(--navy); cursor: pointer;
      padding: 0; margin-bottom: 24px; display: inline-flex;
      align-items: center; gap: 6px;
      font-family: 'Sora', sans-serif;
    }
    .ar-back-btn:hover { color: var(--orange); }

    /* Header Bar */
    .ar-header-bar {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 28px;
      padding: 20px 28px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 20px;
      animation: fadeUp 0.45s 0.05s ease both;
    }

    .ar-header-left h2 {
      font-family: 'Sora', sans-serif;
      font-size: 20px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 4px;
    }

    .ar-header-left p {
      font-size: 13px; color: var(--muted);
    }

    .ar-btn-primary {
      padding: 12px 24px;
      background: #e98404;
      border: none;
      border-radius: 14px;
      font-size: 14px; font-weight: 700;
      color: white;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.3s;
      box-shadow: 0 4px 12px rgba(0,32,96,0.2);
    }
    .ar-btn-primary:hover {
      background: var(--navy2);
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0,32,96,0.25);
    }

    .ar-btn-secondary {
      padding: 10px 20px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 12px;
      font-size: 13px; font-weight: 600;
      color: var(--muted);
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.2s;
    }
    .ar-btn-secondary:hover {
      border-color: var(--navy);
      color: var(--navy);
    }

    /* Service Grid */
    .ar-service-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 22px;
      animation: fadeUp 0.5s 0.1s ease both;
    }

    .ar-service-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 20px;
      padding: 28px;
      transition: all 0.22s;
    }
    .ar-service-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 16px 40px rgba(0,32,96,0.1);
      border-color: #c8d4e4;
    }

    .ar-card-header {
      display: flex; align-items: center; gap: 16px;
      margin-bottom: 16px;
    }

    .ar-card-icon {
      width: 56px; height: 56px; border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
      font-size: 28px;
      flex-shrink: 0;
    }

    .ar-card-title {
      font-family: 'Sora', sans-serif;
      font-size: 18px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 4px;
    }

    .ar-card-badge {
      display: inline-block;
      padding: 4px 12px; border-radius: 30px;
      font-size: 11px; font-weight: 700;
      letter-spacing: 0.03em;
    }

    .ar-card-desc {
      font-size: 13px; color: var(--muted);
      line-height: 1.5; margin-bottom: 16px;
    }

    .ar-card-meta {
      display: flex; flex-direction: column; gap: 6px;
      margin-bottom: 20px;
    }

    .ar-meta-item {
      display: flex; align-items: center; gap: 8px;
      font-size: 12px; color: var(--muted);
    }

    .ar-card-tags {
      display: flex; gap: 8px; flex-wrap: wrap;
      margin-bottom: 20px;
    }

    .ar-tag {
      font-size: 10px; font-weight: 700;
      padding: 4px 10px; border-radius: 20px;
      letter-spacing: 0.03em;
    }

    .ar-card-actions {
      display: flex; gap: 10px;
      padding-top: 16px;
      border-top: 1.5px solid var(--border);
    }

    /* Form Card */
    .ar-form-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 24px;
      padding: 32px;
      animation: fadeUp 0.45s 0.1s ease both;
    }

    .ar-form-group {
      margin-bottom: 28px;
    }

    .ar-form-label {
      display: block;
      font-family: 'Sora', sans-serif;
      font-size: 13px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 10px;
      letter-spacing: 0.02em;
    }
    .ar-form-label .required {
      color: #ef4444;
      margin-left: 4px;
    }

    .ar-input, .ar-textarea, .ar-select {
      width: 100%;
      padding: 14px 18px;
      border: 1.5px solid var(--border);
      border-radius: 14px;
      font-size: 14px;
      background: var(--white);
      color: var(--text);
      font-family: 'Lato', sans-serif;
      transition: all 0.2s;
    }
    .ar-input:focus, .ar-textarea:focus, .ar-select:focus {
      outline: none;
      border-color: var(--navy);
      box-shadow: 0 0 0 4px rgba(0,32,96,0.08);
    }
    .ar-textarea {
      resize: vertical;
      min-height: 100px;
    }

    .ar-search-input {
      width: 100%;
      padding: 14px 40px 14px 18px;
      border: 1.5px solid var(--border);
      border-radius: 14px;
      font-size: 14px;
      background: var(--white);
      color: var(--text);
      font-family: 'Lato', sans-serif;
    }
    .ar-search-input:focus {
      outline: none;
      border-color: var(--navy);
      box-shadow: 0 0 0 4px rgba(0,32,96,0.08);
    }

    .ar-select-arrow {
      position: absolute;
      right: 16px; top: 50%;
      transform: translateY(-50%);
      color: var(--muted);
      font-size: 12px;
      pointer-events: none;
    }

    /* Type Selector */
    .ar-type-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 12px;
    }

    .ar-type-btn {
      padding: 14px 8px;
      border-radius: 14px;
      border: 1.5px solid var(--border);
      background: var(--white);
      cursor: pointer;
      font-size: 12px; font-weight: 600;
      display: flex; flex-direction: column; align-items: center;
      gap: 8px;
      transition: all 0.2s;
    }
    .ar-type-btn:hover {
      border-color: var(--navy);
    }

    /* DL Grid */
    .ar-dl-grid {
      max-height: 250px;
      overflow-y: auto;
      display: flex; flex-direction: column; gap: 8px;
      margin-top: 12px;
    }

    .ar-dl-item {
      padding: 14px 18px;
      background: var(--bg);
      border: 1.5px solid var(--border);
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .ar-dl-item:hover {
      border-color: var(--navy);
      background: var(--white);
    }

    .ar-dl-name {
      font-weight: 600; font-size: 14px;
      color: var(--text);
      margin-bottom: 2px;
    }

    .ar-dl-email {
      font-size: 11px; color: var(--muted);
    }

    .ar-selected-dl {
      padding: 18px;
      background: rgba(0,32,96,0.04);
      border: 1.5px solid var(--navy);
      border-radius: 14px;
    }

    /* Features Section */
    .ar-features-section, .ar-approval-section {
      padding: 20px;
      background: var(--bg);
      border-radius: 14px;
      margin-bottom: 24px;
    }

    .ar-section-title {
      font-family: 'Sora', sans-serif;
      font-size: 14px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 16px;
    }

    .ar-toggle-row {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 12px;
    }

    .ar-toggle-label {
      font-size: 14px; font-weight: 500;
      color: var(--text);
    }

    /* Toggle Switch */
    .ar-toggle-switch {
      position: relative; width: 44px; height: 24px;
    }
    .ar-toggle-switch input {
      opacity: 0; width: 0; height: 0;
    }
    .ar-toggle-slider {
      position: absolute; cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background: var(--border);
      transition: .2s;
      border-radius: 24px;
    }
    .ar-toggle-slider:before {
      position: absolute; content: "";
      height: 18px; width: 18px;
      left: 3px; bottom: 3px;
      background: white;
      transition: .2s;
      border-radius: 50%;
    }
    input:checked + .ar-toggle-slider {
      background: var(--navy);
    }
    input:checked + .ar-toggle-slider:before {
      transform: translateX(20px);
    }

    /* Radio Group */
    .ar-radio-group {
      display: flex; flex-direction: column; gap: 12px;
      margin: 16px 0;
    }
    .ar-radio-label {
      display: flex; align-items: center; gap: 10px;
      cursor: pointer;
      font-size: 13px; color: var(--text);
    }
    .ar-radio {
      accent-color: var(--navy);
      width: 16px; height: 16px;
    }

    /* Dropdown */
    .ar-dropdown {
      position: absolute; top: 100%; left: 0; right: 0;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      margin-top: 8px;
      max-height: 280px; overflow-y: auto;
      z-index: 1000;
      box-shadow: 0 8px 24px rgba(0,32,96,0.12);
    }
    .ar-dropdown-item {
      padding: 14px 18px; cursor: pointer;
      border-bottom: 1px solid var(--border);
    }
    .ar-dropdown-item:last-child { border-bottom: none; }
    .ar-dropdown-item:hover { background: var(--bg); }
    .ar-dropdown-name {
      font-size: 14px; font-weight: 600;
      color: var(--text);
      margin-bottom: 2px;
    }
    .ar-dropdown-email {
      font-size: 12px; color: var(--muted);
    }
    .ar-dropdown-loading {
      position: absolute; top: 100%; left: 0; right: 0;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      margin-top: 8px; padding: 14px;
      color: var(--muted); font-size: 13px;
      z-index: 1000;
    }

    /* Chips */
    .ar-chip-container {
      display: flex; flex-wrap: wrap; gap: 8px;
      margin-top: 12px;
    }
    .ar-chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 14px;
      background: var(--navy);
      color: white;
      border-radius: 20px;
      font-size: 12px; font-weight: 500;
    }
    .ar-chip button {
      background: none; border: none;
      color: rgba(255,255,255,0.7);
      cursor: pointer; font-size: 14px;
    }
    .ar-chip button:hover { color: white; }

    /* Form Actions */
    .ar-form-actions {
      display: flex; justify-content: flex-end; gap: 12px;
      margin-top: 32px; padding-top: 24px;
      border-top: 1.5px solid var(--border);
    }

    /* Empty State */
    .ar-empty {
      text-align: center; padding: 60px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 20px;
    }
    .ar-empty-icon {
      font-size: 48px; margin-bottom: 16px;
    }
    .ar-empty-title {
      font-family: 'Sora', sans-serif;
      font-size: 18px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 8px;
    }

    /* Loading */
    .ar-loading {
      text-align: center; padding: 60px;
    }
    .ar-spinner {
      width: 40px; height: 40px; border-radius: 50%;
      border: 3px solid var(--border);
      border-top-color: var(--navy);
      animation: spin 0.9s linear infinite;
      margin: 0 auto 20px;
    }

    /* Toast */
    .ar-toast {
      position: fixed; bottom: 32px; right: 32px; z-index: 10000;
      padding: 14px 24px; border-radius: 14px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      font-size: 14px; font-weight: 600;
      animation: slideIn 0.25s ease;
      font-family: 'Sora', sans-serif;
    }
    .ar-toast-success {
      background: #d1fae5;
      border: 1.5px solid #10b981;
      color: #065f46;
    }
    .ar-toast-error {
      background: #fee2e2;
      border: 1.5px solid #ef4444;
      color: #991b1b;
    }

    /* Modal */
    .ar-modal-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.4);
      backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000;
    }
    .ar-modal {
      background: var(--white);
      border-radius: 20px;
      padding: 32px;
      max-width: 400px;
      width: 90%;
      border: 1.5px solid var(--border);
    }
    .ar-modal-title {
      font-family: 'Sora', sans-serif;
      font-size: 18px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 16px;
    }
    .ar-modal-actions {
      display: flex; gap: 12px; justify-content: flex-end;
      margin-top: 24px;
    }

    @media (max-width: 768px) {
      .ar-hero { padding: 40px 24px; }
      .ar-content { padding: 24px 20px 40px; }
      .ar-service-grid { grid-template-columns: 1fr; }
      .ar-type-grid { grid-template-columns: repeat(2, 1fr); }
    }
  `;

  const typeInfo = getServiceTypeInfo(serviceType);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Tiles View
  if (viewMode === 'tiles') {
    return (
      <div className="ar-page">
        <style>{sharedCSS}</style>

        {/* Hero Section */}
        <div className="ar-hero">
          <div className="ar-hero-inner">
            <div className="ar-hero-eyebrow">
              <div className="ar-hero-eyebrow-line" />
              Service Management
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <h1>Service <em>Catalog</em></h1>
                <p className="ar-hero-sub">{today} — Manage service requests and templates</p>
              </div>
              <button className="ar-btn-primary" onClick={handleCreateNew}>
                + Create Service
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="ar-content">
          <button className="ar-back-btn" onClick={() => navigate('/settings')}>
            ← Back to Settings
          </button>

          {loadingServices ? (
            <div className="ar-loading">
              <div className="ar-spinner" />
              <p style={{ color: '#64748b' }}>Loading services...</p>
            </div>
          ) : services.length === 0 ? (
            <div className="ar-empty">
              <div className="ar-empty-icon">📋</div>
              <div className="ar-empty-title">No services yet</div>
              <p style={{ color: '#64748b', marginBottom: 20 }}>Click "Create Service" to get started</p>
            </div>
          ) : (
            <div className="ar-service-grid">
              {services.map(service => {
                const typeInfo = getServiceTypeInfo(getCategoryType(service.category?.name || ''));
                return (
                  <div key={service._id} className="ar-service-card">
                    <div className="ar-card-header">
                      <div className="ar-card-icon" style={{ background: typeInfo.color + '15' }}>
                        {typeInfo.icon}
                      </div>
                      <div>
                        <div className="ar-card-title">{service.serviceName}</div>
                        <span className="ar-card-badge" style={{ background: typeInfo.color + '15', color: typeInfo.color }}>
                          {typeInfo.label}
                        </span>
                      </div>
                    </div>

                    {service.description && (
                      <div className="ar-card-desc">
                        {service.description.length > 80 ? service.description.substring(0, 80) + '...' : service.description}
                      </div>
                    )}

                    <div className="ar-card-meta">
                      {service.distributionList && (
                        <div className="ar-meta-item">
                          <span>📧</span>
                          <span>{service.distributionList.name}</span>
                        </div>
                      )}
                      {(service.assignmentGroups?.length > 0 || service.assignmentGroup) && (
                        <div className="ar-meta-item">
                          <span>🏷️</span>
                          <span>{service.assignmentGroups?.[0]?.name || service.assignmentGroup?.groupName || 'Assignment Group'}</span>
                        </div>
                      )}
                      {service.assignmentGroup?.members?.length > 0 && (
                        <div className="ar-meta-item">
                          <span>👥</span>
                          <span>{service.assignmentGroup.members.length} members</span>
                        </div>
                      )}
                    </div>

                    <div className="ar-card-tags">
                      {service.onBehalf?.enabled && (
                        <span className="ar-tag" style={{ background: 'rgba(139,92,246,0.1)', color: '#7c3aed' }}>
                          On Behalf
                        </span>
                      )}
                      {service.attachmentsEnabled && (
                        <span className="ar-tag" style={{ background: 'rgba(16,185,129,0.1)', color: '#065f46' }}>
                          Attachments
                        </span>
                      )}
                      {service.approval?.required && (
                        <span className="ar-tag" style={{ background: 'rgba(233,132,4,0.1)', color: '#92400e' }}>
                          Approval
                        </span>
                      )}
                    </div>

                    <div className="ar-card-actions">
                      <button className="ar-btn-secondary" style={{ flex: 1 }} onClick={() => handleEdit(service)}>
                        ✏️ Edit
                      </button>
                      <button className="ar-btn-secondary" style={{ flex: 1, borderColor: '#fee2e2', color: '#991b1b' }} onClick={() => { setDeletingId(service._id); setShowDeleteConfirm(true); }}>
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Delete Modal */}
        {showDeleteConfirm && (
          <div className="ar-modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
            <div className="ar-modal" onClick={e => e.stopPropagation()}>
              <div className="ar-modal-title">Delete Service?</div>
              <p style={{ color: '#64748b', marginBottom: 24 }}>This action cannot be undone.</p>
              <div className="ar-modal-actions">
                <button className="ar-btn-secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                <button className="ar-btn-primary" style={{ background: '#ef4444' }} onClick={() => handleDelete(deletingId)}>Delete</button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast.open && (
          <div className={`ar-toast ${toast.type === 'success' ? 'ar-toast-success' : 'ar-toast-error'}`}>
            {toast.type === 'success' ? '✓' : '✕'} {toast.message}
          </div>
        )}
      </div>
    );
  }

  // Form View
  return (
    <div className="ar-page">
      <style>{sharedCSS}</style>

      <div className="ar-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button className="ar-back-btn" onClick={handleCancel}>
            ← Back to Catalog
          </button>
          <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: 20, fontWeight: 700, color: '#002060' }}>
            {editingId ? 'Edit Service' : 'Create New Service'}
          </h2>
        </div>

        <div className="ar-form-card">
          {/* Service Name */}
          <div className="ar-form-group">
            <label className="ar-form-label">
              Service Name <span className="required">*</span>
            </label>
            <input
              className="ar-input"
              placeholder="e.g. New Laptop Request"
              value={requestName}
              onChange={e => setRequestName(e.target.value)}
            />
          </div>

          {/* Service Type */}
          <div className="ar-form-group">
            <label className="ar-form-label">
              Service Type <span className="required">*</span>
            </label>
            <div className="ar-type-grid">
              {SERVICE_TYPES.map(type => (
                <button
                  key={type.value}
                  type="button"
                  className="ar-type-btn"
                  onClick={() => setServiceType(type.value)}
                  style={{
                    background: serviceType === type.value ? type.color + '10' : 'var(--white)',
                    borderColor: serviceType === type.value ? type.color : 'var(--border)',
                    color: serviceType === type.value ? type.color : 'var(--muted)',
                  }}
                >
                  <span style={{ fontSize: 24 }}>{type.icon}</span>
                  <span>{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="ar-form-group">
            <label className="ar-form-label">Description</label>
            <textarea
              className="ar-textarea"
              placeholder="Describe the service..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          {/* Distribution List */}
          <div className="ar-form-group">
            <label className="ar-form-label">Distribution List</label>

            {!selectedDL ? (
              <>
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <input
                    className="ar-search-input"
                    placeholder="🔍 Search distribution lists..."
                    value={dlSearchQuery}
                    onChange={e => setDlSearchQuery(e.target.value)}
                    onFocus={loadDLs}
                  />
                  <span className="ar-select-arrow">▼</span>
                </div>
                {loadingDLs ? (
                  <p style={{ color: '#64748b', fontSize: 13 }}>Loading...</p>
                ) : (
                  <div className="ar-dl-grid">
                    {filteredDLs.map(dl => (
                      <div key={dl.id} className="ar-dl-item" onClick={() => handleSelectDL(dl)}>
                        <div className="ar-dl-name">{dl.displayName}</div>
                        <div className="ar-dl-email">{dl.mail}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="ar-selected-dl">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, color: '#002060' }}>{selectedDL.displayName}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{selectedDL.mail}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{dlMembers.length} members</div>
                  </div>
                  <button type="button" className="ar-btn-secondary" onClick={() => { setSelectedDL(null); setDlMembers([]); }}>
                    Change
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Assignment Group */}
          <div className="ar-form-group">
            <label className="ar-form-label">Assignment Group</label>

            <div style={{ position: 'relative', marginBottom: 16 }}>
              <select
                className="ar-select"
                value={selectedAG?._id || selectedAG?.id || ''}
                onChange={e => {
                  const ag = assignmentGroups.find(g => (g._id || g.id) === e.target.value);
                  handleSelectAG(ag);
                }}
              >
                <option value="">Select assignment group...</option>
                {assignmentGroups.map(g => (
                  <option key={g._id || g.id} value={g._id || g.id}>
                    {g.name} ({g.members?.length || 0} members)
                  </option>
                ))}
              </select>
              <span className="ar-select-arrow">▼</span>
            </div>

            {selectedAG && (
              <div style={{ padding: 20, background: '#d1fae5', border: '1.5px solid #10b981', borderRadius: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>👥</span>
                    <span style={{ fontWeight: 600, fontSize: 15, color: '#002060' }}>{selectedAG.name}</span>
                    <span style={{ fontSize: 12, color: '#065f46', background: 'rgba(16,185,129,0.15)', padding: '2px 10px', borderRadius: 12 }}>
                      {selectedAGMembers.length} members
                    </span>
                  </div>
                </div>

        
              </div>
            )}
          </div>

          {/* Features */}
          <div className="ar-features-section">
            <div className="ar-section-title">Features</div>

            <div className="ar-toggle-row">
              <span className="ar-toggle-label">Enable On Behalf Requests</span>
              <label className="ar-toggle-switch">
                <input type="checkbox" checked={onBehalfEnabled} onChange={e => setOnBehalfEnabled(e.target.checked)} />
                <span className="ar-toggle-slider"></span>
              </label>
            </div>
            {onBehalfEnabled && (
              <div style={{ marginLeft: 10, marginBottom: 16 }}>
                <label className="ar-radio-label">
                  <input type="checkbox" className="ar-radio" checked={onBehalfRequired} onChange={e => setOnBehalfRequired(e.target.checked)} />
                  <span>Required</span>
                </label>
              </div>
            )}

            <div className="ar-toggle-row">
              <span className="ar-toggle-label">Enable Attachments</span>
              <label className="ar-toggle-switch">
                <input type="checkbox" checked={attachmentsEnabled} onChange={e => setAttachmentsEnabled(e.target.checked)} />
                <span className="ar-toggle-slider"></span>
              </label>
            </div>
            {attachmentsEnabled && (
              <div style={{ marginLeft: 10 }}>
                <label className="ar-radio-label">
                  <input type="checkbox" className="ar-radio" checked={attachmentsRequired} onChange={e => setAttachmentsRequired(e.target.checked)} />
                  <span>Required</span>
                </label>
              </div>
            )}
          </div>

          {/* Approval */}
          <div className="ar-approval-section">
            <div className="ar-toggle-row">
              <span className="ar-section-title" style={{ marginBottom: 0 }}>Require Approval</span>
              <label className="ar-toggle-switch">
                <input type="checkbox" checked={requireApproval} onChange={e => setRequireApproval(e.target.checked)} />
                <span className="ar-toggle-slider"></span>
              </label>
            </div>

            {requireApproval && (
              <div style={{ marginTop: 16 }}>
                <div className="ar-radio-group">
                  <label className="ar-radio-label">
                    <input type="radio" className="ar-radio" name="approvalType" checked={approvalType === 'manager'} onChange={() => setApprovalType('manager')} />
                    <span>Reporting Manager</span>
                  </label>
                  <label className="ar-radio-label">
                    <input type="radio" className="ar-radio" name="approvalType" checked={approvalType === 'dlMembers'} onChange={() => setApprovalType('dlMembers')} />
                    <span>All DL Group Members</span>
                    {selectedDL && <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>({dlMembers.length} members)</span>}
                  </label>
                  <label className="ar-radio-label">
                    <input type="radio" className="ar-radio" name="approvalType" checked={approvalType === 'custom'} onChange={() => setApprovalType('custom')} />
                    <span>Custom Approvers</span>
                  </label>
                </div>

                {approvalType === 'custom' && (
                  <div style={{ marginBottom: 16 }}>
                    <UserSearchDropdown hook={approverSearch} selected={customApprovers} onSelect={u => { if (!customApprovers.find(a => a.id === u.id)) setCustomApprovers(prev => [...prev, u]); }} placeholder="Search approvers..." />
                    {customApprovers.length > 0 && (
                      <div className="ar-chip-container">
                        {customApprovers.map(a => (
                          <span key={a.id} className="ar-chip">
                            {a.displayName}
                            <button type="button" onClick={() => setCustomApprovers(prev => prev.filter(x => x.id !== a.id))}>✕</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <label className="ar-radio-label">
                  <input type="checkbox" className="ar-radio" checked={requireAllApprovers} onChange={e => setRequireAllApprovers(e.target.checked)} />
                  <span>Require all approvers to approve</span>
                </label>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="ar-form-actions">
            <button type="button" className="ar-btn-secondary" onClick={handleCancel}>Cancel</button>
            <button type="button" className="ar-btn-primary" onClick={handleSubmit} disabled={submitting} style={{ opacity: submitting ? 0.5 : 1 }}>
              {submitting ? 'Saving...' : (editingId ? 'Update Service' : 'Create Service')}
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast.open && (
        <div className={`ar-toast ${toast.type === 'success' ? 'ar-toast-success' : 'ar-toast-error'}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}
    </div>
  );
}