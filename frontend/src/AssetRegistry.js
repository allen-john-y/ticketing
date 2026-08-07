// src/SettingsPages/AssetRegistry.js
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const GRAPH_SCOPES = ['User.ReadBasic.All'];

function AssetRegistry() {
  const navigate = useNavigate();
  const { instance, accounts } = useMsal();
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    assigned: 0,
    unassigned: 0,
    withIssues: 0,
    critical: 0,
    warning: 0,
    healthy: 0,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Selection state for bulk delete
  const [selectedAssets, setSelectedAssets] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    type: '',
    brand: '',
    model: '',
    serialNumber: '',
    assetTag: '',
    location: '',
    notes: '',
    purchaseDate: '',
    warrantyExpiry: '',
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');

  // Assign modal state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningAsset, setAssigningAsset] = useState(null);
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [employeeResults, setEmployeeResults] = useState([]);
  const [searchingEmployees, setSearchingEmployees] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState('');
  const searchDebounce = useRef(null);

  // Confirmation / success modal state
  const [pendingUnassign, setPendingUnassign] = useState(null);
  const [unassignSubmitting, setUnassignSubmitting] = useState(false);
  const [assignSuccessInfo, setAssignSuccessInfo] = useState(null);

  // Report issue modal state
  const [issueTargetAsset, setIssueTargetAsset] = useState(null);
  const [issueDescription, setIssueDescription] = useState('');
  const [issuePriority, setIssuePriority] = useState('Medium');
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [issueError, setIssueError] = useState('');
  const [resolvingId, setResolvingId] = useState(null);
  const [pendingResolve, setPendingResolve] = useState(null);

  // Fetch assets from backend
  useEffect(() => {
    fetchAssets();
  }, []);

  // Reset selection when filters change
  useEffect(() => {
    setSelectedAssets(new Set());
    setSelectAll(false);
  }, [searchTerm, filterStatus]);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${BACKEND}/api/assets`);
      const assetData = response.data || [];
      setAssets(assetData);
      calculateStats(assetData);
    } catch (err) {
      console.error('Error fetching assets:', err);
      setAssets([]);
      calculateStats([]);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (assetData) => {
    const total = assetData.length;
    const assigned = assetData.filter(a => a.assignedTo?.azureObjectId).length;
    const unassigned = assetData.filter(a => !a.assignedTo?.azureObjectId).length;
    const withIssues = assetData.filter(a => a.issues?.some(i => !i.resolvedAt)).length;
    const critical = assetData.filter(a => a.health === 'Critical').length;
    const warning = assetData.filter(a => a.health === 'Warning').length;
    const healthy = assetData.filter(a => a.health === 'Healthy').length;

    setStats({
      total,
      assigned,
      unassigned,
      withIssues,
      critical,
      warning,
      healthy
    });
  };

  const getStatusColor = (status) => {
    const colors = {
      'Assigned': '#16a34a',
      'Unassigned': '#94a3b8',
      'In Repair': '#d97706',
      'Disposed': '#dc2626'
    };
    return colors[status] || '#64748b';
  };

  const getHealthColor = (health) => {
    const colors = {
      'Healthy': '#16a34a',
      'Warning': '#d97706',
      'Critical': '#dc2626'
    };
    return colors[health] || '#64748b';
  };

  const getHealthIcon = (health) => {
    const icons = {
      'Healthy': '✅',
      'Warning': '⚠️',
      'Critical': '🚨'
    };
    return icons[health] || '❓';
  };

  const formatDate = (value) => {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatDateForInput = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  };

  const formatDateTime = (value) => {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  // ✅ Define filteredAssets FIRST before using it
  const filteredAssets = assets.filter(asset => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const match = asset.name?.toLowerCase().includes(term) ||
        asset.assetTag?.toLowerCase().includes(term) ||
        asset.serialNumber?.toLowerCase().includes(term) ||
        asset.model?.toLowerCase().includes(term) ||
        asset.brand?.toLowerCase().includes(term) ||
        asset.type?.toLowerCase().includes(term) ||
        (asset.assignedTo && asset.assignedTo.name?.toLowerCase().includes(term));
      if (!match) return false;
    }
    if (filterStatus !== 'all') {
      if (filterStatus === 'assigned' && !asset.assignedTo?.azureObjectId) return false;
      if (filterStatus === 'unassigned' && asset.assignedTo?.azureObjectId) return false;
      if (filterStatus === 'issues' && !asset.issues?.some(i => !i.resolvedAt)) return false;
      if (filterStatus === 'critical' && asset.health !== 'Critical') return false;
      if (filterStatus === 'warning' && asset.health !== 'Warning') return false;
    }
    return true;
  });

  // ✅ Now define displayedAssetIds AFTER filteredAssets
  const displayedAssetIds = filteredAssets.map(a => a.id || a._id);

  // ✅ Auto-select all when all displayed assets are manually checked
  useEffect(() => {
    if (displayedAssetIds.length > 0 && 
        displayedAssetIds.every(id => selectedAssets.has(id))) {
      setSelectAll(true);
    } else {
      setSelectAll(false);
    }
  }, [selectedAssets, displayedAssetIds]);

  // Handle individual checkbox toggle
  const toggleAssetSelection = (assetId) => {
    setSelectedAssets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(assetId)) {
        newSet.delete(assetId);
      } else {
        newSet.add(assetId);
      }
      return newSet;
    });
  };

  // Handle select all toggle
  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedAssets(new Set());
      setSelectAll(false);
    } else {
      setSelectedAssets(new Set(displayedAssetIds));
      setSelectAll(true);
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedAssets.size === 0) return;
    setDeleting(true);
    try {
      const assetIds = Array.from(selectedAssets);
      await axios.delete(`${BACKEND}/api/assets/bulk`, { data: { ids: assetIds } });
      await fetchAssets();
      setSelectedAssets(new Set());
      setSelectAll(false);
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error('Error deleting assets:', err);
      alert('Failed to delete selected assets. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  // Open edit modal
  const openEditModal = (asset) => {
    setEditingAsset(asset);
    setEditFormData({
      name: asset.name || '',
      type: asset.type || '',
      brand: asset.brand || '',
      model: asset.model || '',
      serialNumber: asset.serialNumber || '',
      assetTag: asset.assetTag || '',
      location: asset.location || '',
      notes: asset.notes || '',
      purchaseDate: formatDateForInput(asset.purchaseDate),
      warrantyExpiry: formatDateForInput(asset.warrantyExpiry),
    });
    setEditError('');
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingAsset(null);
    setEditFormData({});
    setEditError('');
  };

  // Handle edit form change
  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: value }));
  };

  // Save edited asset
  const handleSaveEdit = async () => {
    if (!editingAsset) return;
    const assetId = editingAsset.id || editingAsset._id;
    setEditSubmitting(true);
    setEditError('');

    try {
      // Validate required fields
      if (!editFormData.name?.trim()) {
        setEditError('Asset name is required');
        setEditSubmitting(false);
        return;
      }
      if (!editFormData.type?.trim()) {
        setEditError('Asset type is required');
        setEditSubmitting(false);
        return;
      }
      if (!editFormData.serialNumber?.trim()) {
        setEditError('Serial number is required');
        setEditSubmitting(false);
        return;
      }
      if (!editFormData.assetTag?.trim()) {
        setEditError('Asset tag is required');
        setEditSubmitting(false);
        return;
      }

      const payload = {
        name: editFormData.name.trim(),
        type: editFormData.type.trim(),
        brand: editFormData.brand?.trim() || '',
        model: editFormData.model?.trim() || '',
        serialNumber: editFormData.serialNumber.trim(),
        assetTag: editFormData.assetTag.trim(),
        location: editFormData.location?.trim() || '',
        notes: editFormData.notes?.trim() || '',
        purchaseDate: editFormData.purchaseDate || null,
        warrantyExpiry: editFormData.warrantyExpiry || null,
      };

      const res = await axios.patch(`${BACKEND}/api/assets/${assetId}`, payload);
      
      // Update the asset in the list
      applyFullAsset(res.data);
      
      closeEditModal();
    } catch (err) {
      console.error('Error updating asset:', err);
      setEditError(err.response?.data?.message || 'Failed to update asset. Please try again.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const openDetailModal = (asset) => {
    setSelectedAsset(asset);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedAsset(null);
  };

  // ── Azure AD (Graph) employee lookup ──────────────────────────────
  const getGraphToken = async () => {
    const account = accounts?.[0];
    if (!account) throw new Error('No signed-in account.');
    try {
      const res = await instance.acquireTokenSilent({ scopes: GRAPH_SCOPES, account });
      return res.accessToken;
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        const res = await instance.acquireTokenPopup({ scopes: GRAPH_SCOPES, account });
        return res.accessToken;
      }
      throw err;
    }
  };

  const searchEmployees = async (query) => {
    if (!query || query.trim().length < 2) {
      setEmployeeResults([]);
      return;
    }
    setSearchingEmployees(true);
    setAssignError('');
    try {
      const token = await getGraphToken();
      const term = query.trim().replace(/"/g, '');
      const res = await axios.get(
        `https://graph.microsoft.com/v1.0/users?$search="displayName:${term}" OR "mail:${term}"&$select=id,displayName,mail,userPrincipalName,jobTitle,department&$top=10`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            ConsistencyLevel: 'eventual',
          },
        }
      );
      setEmployeeResults(res.data?.value || []);
    } catch (err) {
      console.error('Error searching Azure AD users:', err);
      setAssignError('Could not search directory. Check your Graph permissions.');
      setEmployeeResults([]);
    } finally {
      setSearchingEmployees(false);
    }
  };

  const handleEmployeeQueryChange = (value) => {
    setEmployeeQuery(value);
    setSelectedEmployee(null);
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => searchEmployees(value), 350);
  };

  const openAssignModal = (asset) => {
    setAssigningAsset(asset);
    setEmployeeQuery('');
    setEmployeeResults([]);
    setSelectedEmployee(null);
    setAssignError('');
    setShowAssignModal(true);
  };

  const closeAssignModal = () => {
    setShowAssignModal(false);
    setAssigningAsset(null);
    setSelectedEmployee(null);
    setEmployeeQuery('');
    setEmployeeResults([]);
  };

  // FIX: Replaces an asset wholesale with the server's version
  const applyFullAsset = (updatedAsset) => {
    const assetId = updatedAsset.id || updatedAsset._id;
    setAssets(prev => {
      const next = prev.map(a => ((a.id || a._id) === assetId ? updatedAsset : a));
      calculateStats(next);
      return next;
    });
    if (selectedAsset && (selectedAsset.id || selectedAsset._id) === assetId) {
      setSelectedAsset(updatedAsset);
    }
  };

  const openIssueModal = (asset) => {
    setIssueTargetAsset(asset);
    setIssueDescription('');
    setIssuePriority('Medium');
    setIssueError('');
  };

  const closeIssueModal = () => {
    setIssueTargetAsset(null);
    setIssueDescription('');
    setIssueError('');
  };

  const handleReportIssue = async () => {
    if (!issueTargetAsset) return;
    if (!issueDescription.trim()) {
      setIssueError('Describe the issue first.');
      return;
    }
    const assetId = issueTargetAsset.id || issueTargetAsset._id;
    setIssueSubmitting(true);
    setIssueError('');
    try {
      const res = await axios.patch(`${BACKEND}/api/assets/${assetId}/report-issue`, {
        description: issueDescription.trim(),
        priority: issuePriority,
      });
      applyFullAsset(res.data);
      closeIssueModal();
    } catch (err) {
      console.error('Error reporting issue:', err);
      setIssueError('Could not save this issue. Please try again.');
    } finally {
      setIssueSubmitting(false);
    }
  };

  const requestResolve = (asset) => {
    setPendingResolve(asset);
  };

  const confirmResolve = async () => {
    if (!pendingResolve) return;
    const assetId = pendingResolve.id || pendingResolve._id;
    setResolvingId(assetId);
    try {
      const res = await axios.patch(`${BACKEND}/api/assets/${assetId}/resolve-issue`);
      applyFullAsset(res.data);
      setPendingResolve(null);
    } catch (err) {
      console.error('Error resolving issue:', err);
    } finally {
      setResolvingId(null);
    }
  };

  const handleConfirmAssign = async () => {
    if (!selectedEmployee || !assigningAsset) return;
    const assetId = assigningAsset.id || assigningAsset._id;
    setAssignSubmitting(true);
    setAssignError('');
    try {
      const assignedTo = {
        azureObjectId: selectedEmployee.id,
        name: selectedEmployee.displayName,
        email: selectedEmployee.mail || selectedEmployee.userPrincipalName,
        department: selectedEmployee.department || null,
        jobTitle: selectedEmployee.jobTitle || null,
      };
      const res = await axios.patch(`${BACKEND}/api/assets/${assetId}/assign`, {
        ...assignedTo,
        assignedDate: new Date().toISOString(),
      });
      applyFullAsset(res.data);
      setAssignSuccessInfo({
        assetTag: assigningAsset.assetTag,
        serialNumber: assigningAsset.serialNumber,
        assetName: assigningAsset.name,
        employeeName: assignedTo.name,
      });
      closeAssignModal();
    } catch (err) {
      console.error('Error assigning asset:', err);
      setAssignError('Could not assign this asset. Please try again.');
    } finally {
      setAssignSubmitting(false);
    }
  };

  const requestUnassign = (asset) => {
    setPendingUnassign(asset);
  };

  const confirmUnassign = async () => {
    if (!pendingUnassign) return;
    const assetId = pendingUnassign.id || pendingUnassign._id;
    setUnassignSubmitting(true);
    try {
      const res = await axios.patch(`${BACKEND}/api/assets/${assetId}/unassign`, {
        returnedDate: new Date().toISOString(),
      });
      applyFullAsset(res.data);
      if (selectedAsset && (selectedAsset.id || selectedAsset._id) === assetId) {
        setSelectedAsset(null);
      }
      setPendingUnassign(null);
    } catch (err) {
      console.error('Error unassigning asset:', err);
    } finally {
      setUnassignSubmitting(false);
    }
  };

  return (
    <div className="asset-registry">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap');

        .asset-registry {
          padding: 32px 40px;
          font-family: 'Inter', sans-serif;
          background: #f8fafc;
          min-height: calc(100vh - 68px);
        }

        .asset-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 32px;
        }

        .asset-header-left h1 {
          font-family: 'Sora', sans-serif;
          font-size: 28px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 4px;
        }

        .asset-header-left p {
          color: #64748b;
          font-size: 14px;
        }

        .asset-header-actions {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .asset-add-btn {
          padding: 10px 24px;
          background: #002060;
          color: white;
          border: none;
          border-radius: 12px;
          font-family: 'Sora', sans-serif;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .asset-add-btn:hover {
          background: #003090;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,32,96,0.2);
        }

        .asset-add-btn.danger {
          background: #dc2626;
        }

        .asset-add-btn.danger:hover {
          background: #b91c1c;
          box-shadow: 0 4px 12px rgba(220,38,38,0.3);
        }

        .asset-add-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .asset-add-btn.edit-btn {
          background: #7c3aed;
        }

        .asset-add-btn.edit-btn:hover {
          background: #6d28d9;
          box-shadow: 0 4px 12px rgba(124,58,237,0.3);
        }

        /* Stats Grid */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 16px;
          margin-bottom: 32px;
        }

        .stat-card {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 20px 24px;
          transition: all 0.2s;
        }

        .stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.06);
        }

        .stat-label {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #94a3b8;
          margin-bottom: 8px;
        }

        .stat-value {
          font-family: 'Sora', sans-serif;
          font-size: 28px;
          font-weight: 700;
          color: #0f172a;
        }

        .stat-sub {
          font-size: 13px;
          color: #64748b;
          margin-top: 4px;
        }

        .stat-card.primary .stat-value { color: #002060; }
        .stat-card.success .stat-value { color: #16a34a; }
        .stat-card.warning .stat-value { color: #d97706; }
        .stat-card.danger .stat-value { color: #dc2626; }
        .stat-card.purple .stat-value { color: #7c3aed; }
        .stat-card.info .stat-value { color: #0ea5e9; }

        /* Filters */
        .filters-bar {
          display: flex;
          gap: 12px;
          margin-bottom: 24px;
          flex-wrap: wrap;
          align-items: center;
        }

        .filters-bar input,
        .filters-bar select {
          padding: 10px 16px;
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          font-size: 14px;
          background: white;
          color: #0f172a;
          font-family: 'Inter', sans-serif;
          transition: border-color 0.2s;
        }

        .filters-bar input:focus,
        .filters-bar select:focus {
          outline: none;
          border-color: #002060;
          box-shadow: 0 0 0 3px rgba(0,32,96,0.08);
        }

        .filters-bar input {
          flex: 1;
          min-width: 200px;
        }

        .filter-tags {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .filter-tag {
          padding: 6px 16px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          border: 1.5px solid #e2e8f0;
          background: white;
          color: #64748b;
        }

        .filter-tag:hover {
          border-color: #002060;
          color: #002060;
        }

        .filter-tag.active {
          background: #002060;
          border-color: #002060;
          color: white;
        }

        /* Table */
        .table-container {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          overflow: hidden;
        }

        .table-scroll {
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        th {
          text-align: left;
          padding: 14px 20px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #64748b;
          background: #f8fafc;
          border-bottom: 1.5px solid #e2e8f0;
          font-family: 'Sora', sans-serif;
        }

        th:first-child {
          width: 40px;
          text-align: center;
        }

        td {
          padding: 12px 20px;
          border-bottom: 1px solid #eef2f6;
          font-size: 14px;
          vertical-align: middle;
        }

        td:first-child {
          text-align: center;
        }

        tr:last-child td {
          border-bottom: none;
        }

        tr:hover td {
          background: rgba(0,32,96,0.02);
        }

        td.clickable {
          cursor: pointer;
        }

        td.clickable:hover {
          text-decoration: underline;
          color: #002060;
        }

        /* Checkbox styles */
        .asset-checkbox {
          width: 18px;
          height: 18px;
          cursor: pointer;
          accent-color: #002060;
        }

        .asset-checkbox:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .selection-info {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 13px;
          color: #64748b;
        }

        .selection-info strong {
          color: #0f172a;
        }

        .asset-tag {
          font-family: 'Sora', sans-serif;
          font-weight: 700;
          color: #002060;
          font-size: 13px;
        }

        .asset-name {
          font-weight: 600;
          color: #0f172a;
        }

        .asset-type {
          font-size: 12px;
          color: #64748b;
          background: #f1f5f9;
          padding: 2px 10px;
          border-radius: 12px;
          display: inline-block;
        }

        .model-display {
          font-size: 13px;
          font-weight: 500;
          color: #0f172a;
        }

        .model-display .brand {
          color: #64748b;
          font-weight: 400;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
        }

        .health-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 13px;
          font-weight: 600;
        }

        .health-badge .status-icon {
          font-size: 14px;
        }

        .user-cell {
          font-size: 13px;
        }

        .user-name {
          font-weight: 500;
          color: #0f172a;
        }

        .user-dept {
          font-size: 11px;
          color: #94a3b8;
        }

        .issues-count {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
        }

        .issues-count.has-issues {
          background: rgba(220,38,38,0.08);
          color: #dc2626;
        }

        .issues-count.no-issues {
          background: rgba(22,163,74,0.08);
          color: #16a34a;
        }

        .table-footer {
          padding: 12px 20px;
          border-top: 1px solid #eef2f6;
          font-size: 13px;
          color: #64748b;
          background: #fafbfc;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }

        /* Row actions */
        .row-action-btn {
          padding: 6px 14px;
          border-radius: 8px;
          border: 1.5px solid #e2e8f0;
          background: white;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          font-family: 'Inter', sans-serif;
        }

        .row-action-btn.assign {
          color: #002060;
          border-color: #002060;
        }

        .row-action-btn.assign:hover {
          background: #002060;
          color: white;
        }

        .row-action-btn.unassign {
          color: #dc2626;
          border-color: #fecaca;
        }

        .row-action-btn.unassign:hover {
          background: #dc2626;
          color: white;
          border-color: #dc2626;
        }

        .row-action-btn.edit {
          color: #7c3aed;
          border-color: #ddd6fe;
        }

        .row-action-btn.edit:hover {
          background: #7c3aed;
          color: white;
          border-color: #7c3aed;
        }

        .modal-actions-bar {
          padding: 0 28px 16px;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
        }

        /* Assign modal */
        .assign-modal {
          max-width: 440px;
        }

        .assign-body {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .employee-search-input {
          width: 100%;
          padding: 10px 14px;
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          font-size: 14px;
          font-family: 'Inter', sans-serif;
        }

        .employee-search-input:focus {
          outline: none;
          border-color: #002060;
          box-shadow: 0 0 0 3px rgba(0,32,96,0.08);
        }

        .employee-results {
          max-height: 260px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .employee-hint {
          font-size: 13px;
          color: #94a3b8;
          padding: 8px 4px;
        }

        .employee-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 10px;
          cursor: pointer;
          border: 1.5px solid transparent;
        }

        .employee-row:hover {
          background: #f8fafc;
        }

        .employee-row.selected {
          background: rgba(0,32,96,0.06);
          border-color: #002060;
        }

        .employee-avatar {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: #002060;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          flex-shrink: 0;
        }

        .employee-name {
          font-size: 13px;
          font-weight: 600;
          color: #0f172a;
        }

        .employee-meta {
          font-size: 12px;
          color: #64748b;
        }

        .assign-error {
          padding: 10px 14px;
          border-radius: 8px;
          background: rgba(220,38,38,0.08);
          color: #dc2626;
          font-size: 13px;
        }

        .assign-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 8px;
        }

        .cap-back-btn {
          padding: 9px 18px;
          background: white;
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 13px;
          color: #334155;
          cursor: pointer;
        }

        .cap-back-btn:hover { border-color: #002060; color: #002060; }

        /* Confirm / success modals */
        .confirm-modal {
          max-width: 380px;
          padding: 32px 28px 24px;
          text-align: center;
        }

        .confirm-icon {
          font-size: 36px;
          margin-bottom: 12px;
        }

        .confirm-title {
          font-family: 'Sora', sans-serif;
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 10px;
        }

        .confirm-text {
          font-size: 14px;
          color: #64748b;
          line-height: 1.6;
          margin-bottom: 24px;
        }

        .confirm-footer {
          display: flex;
          justify-content: center;
          gap: 12px;
        }

        .confirm-btn {
          padding: 9px 20px;
        }

        .actions-cell {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .row-action-btn.issue {
          color: #d97706;
          border-color: #fde68a;
        }

        .row-action-btn.issue:hover {
          background: #d97706;
          color: white;
          border-color: #d97706;
        }

        .row-action-btn.resolve {
          color: #16a34a;
          border-color: #bbf7d0;
        }

        .row-action-btn.resolve:hover {
          background: #16a34a;
          color: white;
          border-color: #16a34a;
        }

        .row-action-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .row-action-btn.delete {
          color: #dc2626;
          border-color: #fecaca;
        }

        .row-action-btn.delete:hover {
          background: #dc2626;
          color: white;
          border-color: #dc2626;
        }

        .issue-textarea {
          width: 100%;
          min-height: 90px;
          padding: 10px 14px;
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          font-size: 14px;
          font-family: 'Inter', sans-serif;
          resize: vertical;
        }

        .issue-textarea:focus {
          outline: none;
          border-color: #002060;
          box-shadow: 0 0 0 3px rgba(0,32,96,0.08);
        }

        .assign-warning {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          padding: 12px 14px;
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 10px;
        }

        .assign-warning-icon {
          font-size: 16px;
          flex-shrink: 0;
        }

        .assign-warning-title {
          font-size: 13px;
          font-weight: 700;
          color: #92400e;
        }

        .assign-warning-text {
          font-size: 12px;
          color: #92400e;
          margin-top: 2px;
        }

        .open-issues-box {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px;
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 10px;
          max-height: 140px;
          overflow-y: auto;
        }

        .open-issue-row {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          font-size: 13px;
          color: #78350f;
        }

        /* Modal */
        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .modal-content {
          background: white;
          border-radius: 20px;
          max-width: 700px;
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
          padding: 32px 36px;
          animation: slideUp 0.25s ease;
          box-shadow: 0 20px 60px rgba(0,0,0,0.2);
        }

        .modal-content.edit-modal {
          max-width: 500px;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 1.5px solid #eef2f6;
        }

        .modal-header h2 {
          font-family: 'Sora', sans-serif;
          font-size: 22px;
          color: #0f172a;
        }

        .modal-close {
          background: none;
          border: none;
          font-size: 24px;
          color: #94a3b8;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 8px;
          transition: all 0.2s;
        }

        .modal-close:hover {
          background: #f1f5f9;
          color: #0f172a;
        }

        .modal-body {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .modal-body .full-width {
          grid-column: span 2;
        }

        .detail-item {
          background: #f8fafc;
          border-radius: 12px;
          padding: 14px 18px;
        }

        .detail-item .label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #94a3b8;
          margin-bottom: 4px;
        }

        .detail-item .value {
          font-size: 14px;
          font-weight: 500;
          color: #0f172a;
        }

        .detail-item .value.mono {
          font-family: monospace;
          font-size: 13px;
        }

        /* Edit form styles */
        .edit-form-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .edit-form-group label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #94a3b8;
        }

        .edit-form-group input,
        .edit-form-group select,
        .edit-form-group textarea {
          padding: 8px 12px;
          border: 1.5px solid #e2e8f0;
          border-radius: 8px;
          font-size: 14px;
          font-family: 'Inter', sans-serif;
          transition: border-color 0.2s;
        }

        .edit-form-group input:focus,
        .edit-form-group select:focus,
        .edit-form-group textarea:focus {
          outline: none;
          border-color: #002060;
          box-shadow: 0 0 0 3px rgba(0,32,96,0.08);
        }

        .edit-form-group textarea {
          resize: vertical;
          min-height: 60px;
        }

        .edit-error {
          padding: 10px 14px;
          border-radius: 8px;
          background: rgba(220,38,38,0.08);
          color: #dc2626;
          font-size: 13px;
        }

        .edit-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1.5px solid #eef2f6;
        }

        .issues-list {
          background: #f8fafc;
          border-radius: 12px;
          padding: 14px 18px;
        }

        .issues-list .label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #94a3b8;
          margin-bottom: 8px;
        }

        .issue-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 0;
          border-bottom: 1px solid #eef2f6;
          font-size: 13px;
        }

        .issue-item:last-child {
          border-bottom: none;
        }

        .issue-priority {
          font-size: 11px;
          font-weight: 600;
          padding: 2px 10px;
          border-radius: 12px;
        }

        .issue-priority.critical { background: #fee2e2; color: #dc2626; }
        .issue-priority.high { background: #fef3c7; color: #d97706; }
        .issue-priority.medium { background: #dbeafe; color: #1e40af; }
        .issue-priority.low { background: #e5e7eb; color: #6b7280; }

        .no-issues-text {
          color: #94a3b8;
          font-size: 13px;
        }

        /* Delete confirmation modal */
        .delete-confirm-text {
          font-size: 14px;
          color: #64748b;
          line-height: 1.6;
          margin-bottom: 8px;
        }

        .delete-asset-list {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 12px 16px;
          max-height: 150px;
          overflow-y: auto;
          text-align: left;
          font-size: 13px;
          color: #dc2626;
          margin-bottom: 16px;
        }

        .delete-asset-list li {
          padding: 4px 0;
          border-bottom: 1px solid #fee2e2;
        }

        .delete-asset-list li:last-child {
          border-bottom: none;
        }

        @media (max-width: 768px) {
          .asset-registry { padding: 20px; }
          .asset-header { flex-direction: column; align-items: flex-start; gap: 16px; }
          .stats-grid { grid-template-columns: repeat(2, 1fr); }
          .modal-body { grid-template-columns: 1fr; }
          .modal-body .full-width { grid-column: span 1; }
          .filters-bar { flex-direction: column; align-items: stretch; }
          .filters-bar input { min-width: unset; }
          .table-footer { flex-direction: column; align-items: flex-start; }
          .modal-actions-bar { flex-direction: column; align-items: stretch; }
        }
      `}</style>

      {/* Header */}
      <div className="asset-header">
        <div className="asset-header-left">
          <h1>📦 Asset Registry</h1>
          <p>Manage and track all IT assets across the organization</p>
        </div>
        <div className="asset-header-actions">
          {selectedAssets.size > 0 && (
            <button
              className="asset-add-btn danger"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
            >
              🗑️ Delete Selected ({selectedAssets.size})
            </button>
          )}
          <button className="asset-add-btn" onClick={() => navigate('/settings/asset-registry/add')}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Asset
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-label">Total Assets</div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-sub">All registered assets</div>
        </div>
        <div className="stat-card success">
          <div className="stat-label">Assigned</div>
          <div className="stat-value">{stats.assigned}</div>
          <div className="stat-sub">{stats.total > 0 ? ((stats.assigned / stats.total) * 100).toFixed(0) : 0}% of total</div>
        </div>
        <div className="stat-card info">
          <div className="stat-label">Unassigned</div>
          <div className="stat-value">{stats.unassigned}</div>
          <div className="stat-sub">Available for allocation</div>
        </div>
        <div className="stat-card danger">
          <div className="stat-label">⚠️ With Issues</div>
          <div className="stat-value">{stats.withIssues}</div>
          <div className="stat-sub">Needs attention</div>
        </div>
        <div className="stat-card danger">
          <div className="stat-label">🚨 Critical</div>
          <div className="stat-value">{stats.critical}</div>
          <div className="stat-sub">Urgent action required</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-label">⚠️ Warning</div>
          <div className="stat-value">{stats.warning}</div>
          <div className="stat-sub">Monitor closely</div>
        </div>
        <div className="stat-card success">
          <div className="stat-label">✅ Healthy</div>
          <div className="stat-value">{stats.healthy}</div>
          <div className="stat-sub">No issues</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <input
          type="text"
          placeholder="🔍 Search assets by name, tag, serial, user..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <div className="filter-tags">
          <button
            className={`filter-tag ${filterStatus === 'all' ? 'active' : ''}`}
            onClick={() => setFilterStatus('all')}
          >
            All
          </button>
          <button
            className={`filter-tag ${filterStatus === 'assigned' ? 'active' : ''}`}
            onClick={() => setFilterStatus('assigned')}
          >
            Assigned
          </button>
          <button
            className={`filter-tag ${filterStatus === 'unassigned' ? 'active' : ''}`}
            onClick={() => setFilterStatus('unassigned')}
          >
            Unassigned
          </button>
          <button
            className={`filter-tag ${filterStatus === 'issues' ? 'active' : ''}`}
            onClick={() => setFilterStatus('issues')}
          >
            Has Issues
          </button>
          <button
            className={`filter-tag ${filterStatus === 'critical' ? 'active' : ''}`}
            onClick={() => setFilterStatus('critical')}
          >
            Critical
          </button>
          <button
            className={`filter-tag ${filterStatus === 'warning' ? 'active' : ''}`}
            onClick={() => setFilterStatus('warning')}
          >
            Warning
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    className="asset-checkbox"
                    checked={selectAll && displayedAssetIds.length > 0}
                    onChange={toggleSelectAll}
                    disabled={loading || filteredAssets.length === 0}
                  />
                </th>
                <th>Serial Number</th>
                <th>Type</th>
                <th>Model</th>
                <th>Status</th>
                <th>Health</th>
                <th>Assigned To</th>
                <th>Issue History</th>
                <th>Location</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#002060', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      <span>Loading assets...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredAssets.length === 0 ? (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔍</div>
                    <div>No assets found matching your criteria</div>
                  </td>
                </tr>
              ) : (
                filteredAssets.map((asset) => {
                  const assetId = asset.id || asset._id;
                  const modelDisplay = asset.brand && asset.model 
                    ? `${asset.brand} ${asset.model}` 
                    : asset.model || asset.brand || '—';
                  return (
                    <tr key={assetId}>
                      <td>
                        <input
                          type="checkbox"
                          className="asset-checkbox"
                          checked={selectedAssets.has(assetId)}
                          onChange={() => toggleAssetSelection(assetId)}
                        />
                      </td>
                      <td>
                        <span className="asset-tag">{asset.serialNumber}</span>
                      </td>
                      <td>
                        <span className="asset-type">{asset.type}</span>
                      </td>
                      <td className="clickable" onClick={() => openDetailModal(asset)}>
                        <div className="model-display">
                          {modelDisplay}
                        </div>
                      </td>
                      <td>
                        <span
                          className="status-badge"
                          style={{
                            background: `${getStatusColor(asset.status)}15`,
                            color: getStatusColor(asset.status)
                          }}
                        >
                          {asset.status}
                        </span>
                      </td>
                      <td>
                        <span
                          className="health-badge"
                          style={{ color: getHealthColor(asset.health) }}
                        >
                          <span className="status-icon">{getHealthIcon(asset.health)}</span>
                          {asset.health}
                        </span>
                      </td>
                      <td>
                        {asset.assignedTo?.azureObjectId ? (
                          <div className="user-cell">
                            <div className="user-name">{asset.assignedTo.name}</div>
                            <div className="user-dept">{asset.assignedTo.department}</div>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '13px' }}>—</span>
                        )}
                      </td>
                      <td>
                        <span className={`issues-count ${asset.issues && asset.issues.length > 0 ? 'has-issues' : 'no-issues'}`}>
                          {asset.issues && asset.issues.length > 0 ? `${asset.issues.length} logged` : '✅ None'}
                        </span>
                      </td>
                      <td style={{ fontSize: '13px', color: '#64748b' }}>
                        {asset.location}
                      </td>
                      <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                        <button
                          className="row-action-btn edit"
                          onClick={() => openEditModal(asset)}
                        >
                          ✏️ Edit
                        </button>
                        {asset.status === 'In Repair' && (
                          <button
                            className="row-action-btn resolve"
                            onClick={() => requestResolve(asset)}
                            disabled={resolvingId === assetId}
                          >
                            {resolvingId === assetId ? 'Resolving…' : 'Mark Resolved'}
                          </button>
                        )}
                        {asset.assignedTo?.azureObjectId ? (
                          <button className="row-action-btn unassign" onClick={() => requestUnassign(asset)}>
                            Unassign
                          </button>
                        ) : (
                          <button className="row-action-btn assign" onClick={() => openAssignModal(asset)}>
                            Assign
                          </button>
                        )}
                        <button className="row-action-btn issue" onClick={() => openIssueModal(asset)}>
                          {asset.status === 'In Repair' ? 'Update Issue' : 'Report Issue'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>
            Showing {filteredAssets.length} of {assets.length} assets
            {filterStatus !== 'all' && ` (filtered by: ${filterStatus})`}
          </span>
          {selectedAssets.size > 0 && (
            <span className="selection-info">
              <strong>{selectedAssets.size}</strong> asset{selectedAssets.size > 1 ? 's' : ''} selected
            </span>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedAsset && (
        <div className="modal-overlay" onClick={closeDetailModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{selectedAsset.name}</h2>
                <div style={{ fontSize: '14px', color: '#64748b', marginTop: '2px' }}>
                  {selectedAsset.assetTag} · {selectedAsset.brand} {selectedAsset.model}
                </div>
              </div>
              <button className="modal-close" onClick={closeDetailModal}>✕</button>
            </div>

            <div className="modal-actions-bar">
              <button
                className="row-action-btn edit"
                onClick={() => { closeDetailModal(); openEditModal(selectedAsset); }}
              >
                ✏️ Edit
              </button>
              {selectedAsset.status === 'In Repair' && (
                <button
                  className="row-action-btn resolve"
                  onClick={() => requestResolve(selectedAsset)}
                  disabled={resolvingId === (selectedAsset.id || selectedAsset._id)}
                >
                  {resolvingId === (selectedAsset.id || selectedAsset._id) ? 'Resolving…' : 'Mark Resolved'}
                </button>
              )}
              {selectedAsset.assignedTo?.azureObjectId ? (
                <button className="row-action-btn unassign" onClick={() => requestUnassign(selectedAsset)}>
                  Unassign this asset
                </button>
              ) : (
                <button className="row-action-btn assign" onClick={() => { closeDetailModal(); openAssignModal(selectedAsset); }}>
                  Assign this asset
                </button>
              )}
              <button className="row-action-btn issue" onClick={() => openIssueModal(selectedAsset)}>
                {selectedAsset.status === 'In Repair' ? 'Update Issue' : 'Report Issue'}
              </button>
            </div>

            <div className="modal-body">
              <div className="detail-item">
                <div className="label">Asset Tag</div>
                <div className="value mono">{selectedAsset.assetTag}</div>
              </div>
              <div className="detail-item">
                <div className="label">Serial Number</div>
                <div className="value mono">{selectedAsset.serialNumber}</div>
              </div>
              <div className="detail-item">
                <div className="label">Status</div>
                <div className="value">
                  <span
                    className="status-badge"
                    style={{
                      background: `${getStatusColor(selectedAsset.status)}15`,
                      color: getStatusColor(selectedAsset.status)
                    }}
                  >
                    {selectedAsset.status}
                  </span>
                </div>
              </div>
              <div className="detail-item">
                <div className="label">Health</div>
                <div className="value">
                  <span
                    className="health-badge"
                    style={{ color: getHealthColor(selectedAsset.health) }}
                  >
                    <span className="status-icon">{getHealthIcon(selectedAsset.health)}</span>
                    {selectedAsset.health}
                  </span>
                </div>
              </div>
              <div className="detail-item">
                <div className="label">Type</div>
                <div className="value">{selectedAsset.type}</div>
              </div>
              <div className="detail-item">
                <div className="label">Model</div>
                <div className="value">{selectedAsset.brand} {selectedAsset.model}</div>
              </div>
              <div className="detail-item full-width">
                <div className="label">Assigned To</div>
                <div className="value">
                  {selectedAsset.assignedTo?.azureObjectId ? (
                    <div>
                      <div style={{ fontWeight: '600' }}>{selectedAsset.assignedTo.name}</div>
                      <div style={{ fontSize: '13px', color: '#64748b' }}>
                        {selectedAsset.assignedTo.email} · {selectedAsset.assignedTo.department}
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: '#94a3b8' }}>Not assigned</span>
                  )}
                </div>
              </div>
              <div className="detail-item">
                <div className="label">Purchase Date</div>
                <div className="value">{formatDate(selectedAsset.purchaseDate)}</div>
              </div>
              <div className="detail-item">
                <div className="label">Warranty Expiry</div>
                <div className="value">{formatDate(selectedAsset.warrantyExpiry)}</div>
              </div>
              <div className="detail-item">
                <div className="label">Last Maintenance</div>
                <div className="value">{formatDate(selectedAsset.lastMaintenance)}</div>
              </div>
              <div className="detail-item">
                <div className="label">Location</div>
                <div className="value">{selectedAsset.location}</div>
              </div>
              <div className="detail-item full-width">
                <div className="label">Notes</div>
                <div className="value" style={{ fontSize: '13px', color: '#64748b' }}>
                  {selectedAsset.notes || 'No notes'}
                </div>
              </div>
              <div className="issues-list full-width">
                <div className="label">Issues ({selectedAsset.issues?.length || 0})</div>
                {selectedAsset.issues && selectedAsset.issues.length > 0 ? (
                  selectedAsset.issues.map((issue, idx) => (
                    <div key={idx} className="issue-item">
                      <span>{issue.description}</span>
                      <span>
                        <span className={`issue-priority ${issue.priority?.toLowerCase() || 'medium'}`}>
                          {issue.priority || 'Medium'}
                        </span>
                        <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: '12px' }}>
                          {formatDateTime(issue.reportedAt)}
                        </span>
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="no-issues-text">No issues reported</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Edit Modal */}
      {showEditModal && editingAsset && (
        <div className="modal-overlay" onClick={() => !editSubmitting && closeEditModal()}>
          <div className="modal-content edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>✏️ Edit Asset</h2>
                <div style={{ fontSize: '14px', color: '#64748b', marginTop: '2px' }}>
                  {editingAsset.assetTag} · {editingAsset.serialNumber}
                </div>
              </div>
              <button className="modal-close" onClick={closeEditModal}>✕</button>
            </div>

            <div className="modal-body" style={{ gridTemplateColumns: '1fr' }}>
              {editError && <div className="edit-error">{editError}</div>}

              <div className="edit-form-group">
                <label>Asset Name *</label>
                <input
                  type="text"
                  name="name"
                  value={editFormData.name}
                  onChange={handleEditChange}
                  placeholder="e.g., Laptop, Monitor, etc."
                />
              </div>

              <div className="edit-form-group">
                <label>Type *</label>
                <input
                  type="text"
                  name="type"
                  value={editFormData.type}
                  onChange={handleEditChange}
                  placeholder="e.g., Laptop, Desktop, Monitor"
                />
              </div>

              <div className="edit-form-group">
                <label>Brand</label>
                <input
                  type="text"
                  name="brand"
                  value={editFormData.brand}
                  onChange={handleEditChange}
                  placeholder="e.g., HP, Dell, Apple"
                />
              </div>

              <div className="edit-form-group">
                <label>Model</label>
                <input
                  type="text"
                  name="model"
                  value={editFormData.model}
                  onChange={handleEditChange}
                  placeholder="e.g., MT15, XPS 13, MacBook Pro"
                />
              </div>

              <div className="edit-form-group">
                <label>Serial Number *</label>
                <input
                  type="text"
                  name="serialNumber"
                  value={editFormData.serialNumber}
                  onChange={handleEditChange}
                  placeholder="Serial number"
                />
              </div>

              <div className="edit-form-group">
                <label>Asset Tag *</label>
                <input
                  type="text"
                  name="assetTag"
                  value={editFormData.assetTag}
                  onChange={handleEditChange}
                  placeholder="e.g., LAP-0001"
                />
              </div>

              <div className="edit-form-group">
                <label>Location</label>
                <input
                  type="text"
                  name="location"
                  value={editFormData.location}
                  onChange={handleEditChange}
                  placeholder="e.g., Chennai, Mumbai, etc."
                />
              </div>

              <div className="edit-form-group">
                <label>Purchase Date</label>
                <input
                  type="date"
                  name="purchaseDate"
                  value={editFormData.purchaseDate}
                  onChange={handleEditChange}
                />
              </div>

              <div className="edit-form-group">
                <label>Warranty Expiry</label>
                <input
                  type="date"
                  name="warrantyExpiry"
                  value={editFormData.warrantyExpiry}
                  onChange={handleEditChange}
                />
              </div>

              <div className="edit-form-group">
                <label>Notes</label>
                <textarea
                  name="notes"
                  value={editFormData.notes}
                  onChange={handleEditChange}
                  placeholder="Additional notes about this asset..."
                />
              </div>
            </div>

            <div className="edit-footer">
              <button className="cap-back-btn" onClick={closeEditModal} disabled={editSubmitting}>
                Cancel
              </button>
              <button
                className="asset-add-btn edit-btn"
                onClick={handleSaveEdit}
                disabled={editSubmitting}
              >
                {editSubmitting ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && assigningAsset && (
        <div className="modal-overlay" onClick={closeAssignModal}>
          <div className="modal-content assign-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Assign asset</h2>
                <div style={{ fontSize: '14px', color: '#64748b', marginTop: '2px' }}>
                  {assigningAsset.assetTag} · {assigningAsset.name}
                </div>
              </div>
              <button className="modal-close" onClick={closeAssignModal}>✕</button>
            </div>

            <div className="modal-body assign-body">
              {assignError && <div className="assign-error">{assignError}</div>}

              {assigningAsset.issues?.some(i => !i.resolvedAt) && (
                <div className="assign-warning">
                  <span className="assign-warning-icon">⚠️</span>
                  <div>
                    <div className="assign-warning-title">This asset has open issues</div>
                    <div className="assign-warning-text">
                      {assigningAsset.issues.filter(i => !i.resolvedAt).map(i => i.description).join(' · ')}
                    </div>
                  </div>
                </div>
              )}

              <div className="detail-item full-width">
                <div className="label">Search Azure AD</div>
                <input
                  type="text"
                  className="employee-search-input"
                  placeholder="Search by name or email…"
                  value={employeeQuery}
                  onChange={(e) => handleEmployeeQueryChange(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="employee-results">
                {searchingEmployees && (
                  <div className="employee-hint">Searching directory…</div>
                )}
                {!searchingEmployees && employeeQuery.trim().length >= 2 && employeeResults.length === 0 && (
                  <div className="employee-hint">No matches found.</div>
                )}
                {!searchingEmployees && employeeQuery.trim().length > 0 && employeeQuery.trim().length < 2 && (
                  <div className="employee-hint">Keep typing…</div>
                )}
                {employeeResults.map((u) => (
                  <div
                    key={u.id}
                    className={`employee-row ${selectedEmployee?.id === u.id ? 'selected' : ''}`}
                    onClick={() => setSelectedEmployee(u)}
                  >
                    <div className="employee-avatar">
                      {(u.displayName || '?').split(' ').map(p => p[0]).slice(0, 2).join('')}
                    </div>
                    <div>
                      <div className="employee-name">{u.displayName}</div>
                      <div className="employee-meta">
                        {u.mail || u.userPrincipalName}
                        {u.department ? ` · ${u.department}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="assign-footer">
                <button className="cap-back-btn" onClick={closeAssignModal}>Cancel</button>
                <button
                  className="asset-add-btn"
                  disabled={!selectedEmployee || assignSubmitting}
                  onClick={handleConfirmAssign}
                >
                  {assignSubmitting
                    ? 'Assigning…'
                    : assigningAsset.issues?.some(i => !i.resolvedAt)
                      ? `Assign anyway to ${selectedEmployee?.displayName || '...'}`
                      : `Assign to ${selectedEmployee?.displayName || '...'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unassign Confirmation Modal */}
      {pendingUnassign && (
        <div className="modal-overlay" onClick={() => !unassignSubmitting && setPendingUnassign(null)}>
          <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon warning">⚠️</div>
            <h2 className="confirm-title">Unassign this asset?</h2>
            <p className="confirm-text">
              <strong>{pendingUnassign.name}</strong> ({pendingUnassign.serialNumber}) will be
              removed from <strong>{pendingUnassign.assignedTo?.name || 'the current owner'}</strong>.{' '}
              {pendingUnassign.status === 'In Repair'
                ? 'It will stay marked In Repair until the issue is resolved.'
                : 'It will be marked as available in inventory.'}
            </p>
            <div className="confirm-footer">
              <button
                className="cap-back-btn"
                onClick={() => setPendingUnassign(null)}
                disabled={unassignSubmitting}
              >
                Cancel
              </button>
              <button
                className="row-action-btn unassign confirm-btn"
                onClick={confirmUnassign}
                disabled={unassignSubmitting}
              >
                {unassignSubmitting ? 'Unassigning…' : 'Yes, unassign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Confirmation Modal */}
      {pendingResolve && (
        <div className="modal-overlay" onClick={() => resolvingId === null && setPendingResolve(null)}>
          <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon success">✅</div>
            <h2 className="confirm-title">Mark as resolved?</h2>
            <p className="confirm-text">
              <strong>{pendingResolve.name}</strong> ({pendingResolve.serialNumber}) will be marked{' '}
              <strong>{pendingResolve.assignedTo?.azureObjectId ? 'Assigned' : 'Unassigned'}</strong> again
              and its health reset to Healthy. Open issues on this asset will be closed out.
            </p>
            <div className="confirm-footer">
              <button
                className="cap-back-btn"
                onClick={() => setPendingResolve(null)}
                disabled={resolvingId !== null}
              >
                Cancel
              </button>
              <button
                className="row-action-btn resolve confirm-btn"
                onClick={confirmResolve}
                disabled={resolvingId !== null}
              >
                {resolvingId !== null ? 'Resolving…' : 'Yes, mark resolved'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Success Modal */}
      {assignSuccessInfo && (
        <div className="modal-overlay" onClick={() => setAssignSuccessInfo(null)}>
          <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon success">✅</div>
            <h2 className="confirm-title">Asset assigned</h2>
            <p className="confirm-text">
              <strong>{assignSuccessInfo.assetName}</strong> ({assignSuccessInfo.serialNumber}) is now
              assigned to <strong>{assignSuccessInfo.employeeName}</strong>.
            </p>
            <div className="confirm-footer" style={{ justifyContent: 'center' }}>
              <button className="asset-add-btn" onClick={() => setAssignSuccessInfo(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report / Update Issue Modal */}
      {issueTargetAsset && (
        <div className="modal-overlay" onClick={() => !issueSubmitting && closeIssueModal()}>
          <div className="modal-content assign-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{issueTargetAsset.status === 'In Repair' ? 'Update issue' : 'Report an issue'}</h2>
                <div style={{ fontSize: '14px', color: '#64748b', marginTop: '2px' }}>
                  {issueTargetAsset.serialNumber} · {issueTargetAsset.name}
                </div>
              </div>
              <button className="modal-close" onClick={closeIssueModal}>✕</button>
            </div>

            <div className="modal-body assign-body">
              {issueError && <div className="assign-error">{issueError}</div>}

              {issueTargetAsset.issues?.some(i => !i.resolvedAt) && (
                <div className="detail-item full-width">
                  <div className="label">Currently open</div>
                  <div className="open-issues-box">
                    {issueTargetAsset.issues.filter(i => !i.resolvedAt).map((issue, idx) => (
                      <div key={idx} className="open-issue-row">
                        <span className={`issue-priority ${issue.priority?.toLowerCase() || 'medium'}`}>
                          {issue.priority || 'Medium'}
                        </span>
                        <span>{issue.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="detail-item full-width">
                <div className="label">
                  {issueTargetAsset.status === 'In Repair' ? "What's new or changed?" : "What's wrong with it?"}
                </div>
                <textarea
                  className="issue-textarea"
                  placeholder="e.g. Screen flickers on startup, won't hold charge, keys sticking…"
                  value={issueDescription}
                  onChange={(e) => setIssueDescription(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="detail-item full-width">
                <div className="label">Severity</div>
                <select
                  className="employee-search-input"
                  value={issuePriority}
                  onChange={(e) => setIssuePriority(e.target.value)}
                >
                  <option value="Low">Low — cosmetic or minor</option>
                  <option value="Medium">Medium — affects normal use</option>
                  <option value="High">High — unusable / urgent</option>
                </select>
              </div>

              <div className="assign-footer">
                <button className="cap-back-btn" onClick={closeIssueModal} disabled={issueSubmitting}>
                  Cancel
                </button>
                <button className="asset-add-btn" onClick={handleReportIssue} disabled={issueSubmitting}>
                  {issueSubmitting
                    ? 'Saving…'
                    : issueTargetAsset.status === 'In Repair'
                      ? 'Add update'
                      : 'Mark as In Repair'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => !deleting && setShowDeleteConfirm(false)}>
          <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon danger">⚠️</div>
            <h2 className="confirm-title">Delete Selected Assets?</h2>
            <p className="delete-confirm-text">
              You are about to delete <strong>{selectedAssets.size}</strong> asset{selectedAssets.size > 1 ? 's' : ''}. 
              This action <strong style={{ color: '#dc2626' }}>cannot be undone</strong>.
            </p>
            <div className="delete-asset-list">
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {assets
                  .filter(a => selectedAssets.has(a.id || a._id))
                  .slice(0, 10)
                  .map(a => (
                    <li key={a.id || a._id}>
                      <strong>{a.assetTag}</strong> — {a.name} ({a.serialNumber})
                    </li>
                  ))}
                {selectedAssets.size > 10 && (
                  <li style={{ color: '#64748b', fontStyle: 'italic' }}>
                    ... and {selectedAssets.size - 10} more
                  </li>
                )}
              </ul>
            </div>
            <p className="confirm-text" style={{ fontSize: '13px', color: '#94a3b8' }}>
              Are you sure you want to permanently delete these assets?
            </p>
            <div className="confirm-footer">
              <button
                className="cap-back-btn"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="row-action-btn delete confirm-btn"
                onClick={handleBulkDelete}
                disabled={deleting}
                style={{ padding: '9px 20px' }}
              >
                {deleting ? 'Deleting…' : 'Yes, Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AssetRegistry;