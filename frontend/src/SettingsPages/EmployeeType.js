// src/SettingsPages/EmployeeType.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useMsal } from '@azure/msal-react';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

export default function EmployeeType() {
  const navigate = useNavigate();
  const { accounts } = useMsal();
  const currentUser = accounts[0] || {};

  const [employeeTypes, setEmployeeTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [toast, setToast] = useState({ open: false, message: '', type: 'success' });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    fetchEmployeeTypes();
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ open: true, message, type });
    setTimeout(() => setToast(p => ({ ...p, open: false })), 3000);
  };

  const fetchEmployeeTypes = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${BACKEND}/api/employee-types`);
      setEmployeeTypes(res.data || []);
    } catch (err) {
      showToast('Failed to load employee types', 'error');
      console.error('Error fetching employee types:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast('Employee type name is required', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || '',
        createdBy: {
          id: currentUser.localAccountId || '',
          name: currentUser.name || '',
          email: currentUser.username || ''
        }
      };

      if (editingId) {
        await axios.put(`${BACKEND}/api/employee-types/${editingId}`, payload);
        showToast('Employee type updated successfully', 'success');
      } else {
        await axios.post(`${BACKEND}/api/employee-types`, payload);
        showToast('Employee type created successfully', 'success');
      }

      resetForm();
      fetchEmployeeTypes();
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to save employee type';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', description: '' });
    setEditingId(null);
  };

  const handleEdit = (type) => {
    setFormData({ name: type.name, description: type.description || '' });
    setEditingId(type._id);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await axios.delete(`${BACKEND}/api/employee-types/${deleteTarget._id}`);
      showToast(`Employee type "${deleteTarget.name}" deleted successfully`, 'success');
      setShowDeleteModal(false);
      setDeleteTarget(null);
      fetchEmployeeTypes();
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to delete employee type';
      showToast(msg, 'error');
    }
  };

  const openDeleteModal = (type) => {
    setDeleteTarget(type);
    setShowDeleteModal(true);
  };

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
    }

    .emptype-page {
      min-height: 70vh;
      width: 100%;
      max-width: 1100px;
      margin: 0 auto;
      padding: 32px 24px;
      font-family: 'Lato', sans-serif;
      color: var(--text);
      background: var(--bg);
    }

    .emptype-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 32px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .emptype-header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .emptype-header-icon {
      font-size: 36px;
    }
    .emptype-header h1 {
      font-family: 'Sora', sans-serif;
      font-size: 26px;
      font-weight: 800;
      color: var(--navy);
      margin: 0;
    }
    .emptype-header-sub {
      font-size: 14px;
      color: var(--muted);
      margin-top: 4px;
    }
    .emptype-count-badge {
      background: var(--navy);
      color: white;
      padding: 4px 14px;
      border-radius: 30px;
      font-size: 13px;
      font-weight: 600;
    }
    .emptype-back-btn {
      padding: 10px 20px;
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 10px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      color: var(--navy);
      font-family: 'Sora', sans-serif;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .emptype-back-btn:hover {
      border-color: var(--navy);
      background: rgba(0,32,96,0.04);
    }

    /* Form Card */
    .emptype-form-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      padding: 28px 32px;
      margin-bottom: 32px;
    }
    .emptype-form-title {
      font-family: 'Sora', sans-serif;
      font-size: 16px;
      font-weight: 700;
      color: var(--navy);
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .emptype-form-row {
      display: grid;
      grid-template-columns: 1fr 2fr auto;
      gap: 16px;
      align-items: flex-end;
    }
    .emptype-form-group {
      display: flex;
      flex-direction: column;
    }
    .emptype-form-label {
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 6px;
      font-family: 'Sora', sans-serif;
    }
    .emptype-form-label .required {
      color: var(--red);
      margin-left: 4px;
    }
    .emptype-form-input {
      padding: 12px 16px;
      border: 1.5px solid var(--border);
      border-radius: 12px;
      font-size: 14px;
      font-family: 'Lato', sans-serif;
      transition: all 0.2s;
      width: 100%;
      background: var(--white);
      color: var(--text);
    }
    .emptype-form-input:focus {
      outline: none;
      border-color: var(--navy);
      box-shadow: 0 0 0 4px rgba(0,32,96,0.08);
    }
    .emptype-form-btn {
      padding: 12px 28px;
      background: var(--navy);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.2s;
      white-space: nowrap;
      min-height: 48px;
    }
    .emptype-form-btn:hover:not(:disabled) {
      background: var(--navy2);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,32,96,0.2);
    }
    .emptype-form-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .emptype-form-btn.cancel {
      background: var(--bg);
      color: var(--text);
    }
    .emptype-form-btn.cancel:hover:not(:disabled) {
      background: var(--border);
      transform: none;
      box-shadow: none;
    }

    /* List */
    .emptype-list-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      overflow: hidden;
    }
    .emptype-list-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 28px;
      border-bottom: 1.5px solid var(--border);
      background: var(--light);
    }
    .emptype-list-header h3 {
      font-family: 'Sora', sans-serif;
      font-size: 15px;
      font-weight: 700;
      color: var(--navy);
    }

    .emptype-table-wrap {
      overflow-x: auto;
    }
    .emptype-table {
      width: 100%;
      border-collapse: collapse;
    }
    .emptype-table th {
      text-align: left;
      padding: 14px 20px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      border-bottom: 1.5px solid var(--border);
      background: var(--light);
      font-family: 'Sora', sans-serif;
    }
    .emptype-table td {
      padding: 14px 20px;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
      vertical-align: middle;
    }
    .emptype-table tr:last-child td {
      border-bottom: none;
    }
    .emptype-table tr:hover td {
      background: rgba(0,32,96,0.02);
    }

    .emptype-name {
      font-weight: 600;
      color: var(--text);
    }
    .emptype-desc {
      color: var(--muted);
      font-size: 13px;
    }
    .emptype-created {
      font-size: 12px;
      color: var(--muted);
    }

    .emptype-actions {
      display: flex;
      gap: 8px;
    }
    .emptype-action-btn {
      padding: 6px 12px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: all 0.15s;
      font-family: 'Sora', sans-serif;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .emptype-action-btn.edit {
      background: rgba(0,32,96,0.08);
      color: var(--navy);
    }
    .emptype-action-btn.edit:hover {
      background: rgba(0,32,96,0.15);
    }
    .emptype-action-btn.delete {
      background: rgba(239,68,68,0.08);
      color: var(--red);
    }
    .emptype-action-btn.delete:hover {
      background: rgba(239,68,68,0.15);
    }

    .emptype-empty {
      text-align: center;
      padding: 60px 20px;
      color: var(--muted);
    }
    .emptype-empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    .emptype-empty h4 {
      font-size: 18px;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 8px;
    }
    .emptype-empty p {
      font-size: 14px;
    }

    /* Loading */
    .emptype-loading {
      text-align: center;
      padding: 60px 20px;
    }
    .emptype-spinner {
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

    /* Modal */
    .emptype-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      backdrop-filter: blur(4px);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      animation: fadeIn 0.2s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .emptype-modal {
      background: var(--white);
      border-radius: 20px;
      padding: 32px 36px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
      animation: scaleUp 0.2s ease;
    }
    @keyframes scaleUp {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    .emptype-modal-icon {
      font-size: 48px;
      text-align: center;
      margin-bottom: 16px;
    }
    .emptype-modal h3 {
      font-family: 'Sora', sans-serif;
      font-size: 20px;
      font-weight: 700;
      color: var(--text);
      text-align: center;
      margin-bottom: 8px;
    }
    .emptype-modal p {
      color: var(--muted);
      text-align: center;
      font-size: 15px;
      margin-bottom: 24px;
      line-height: 1.6;
    }
    .emptype-modal-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
    }
    .emptype-modal-btn {
      padding: 12px 28px;
      border: none;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      transition: all 0.2s;
      min-width: 100px;
    }
    .emptype-modal-btn.cancel {
      background: var(--bg);
      color: var(--text);
    }
    .emptype-modal-btn.cancel:hover {
      background: var(--border);
    }
    .emptype-modal-btn.confirm {
      background: var(--red);
      color: white;
    }
    .emptype-modal-btn.confirm:hover {
      background: #dc2626;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(239,68,68,0.3);
    }

    /* Toast */
    .emptype-toast {
      position: fixed;
      bottom: 32px;
      right: 32px;
      z-index: 99999;
      padding: 16px 28px;
      border-radius: 14px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      font-size: 15px;
      font-weight: 600;
      animation: slideIn 0.3s ease;
      font-family: 'Sora', sans-serif;
    }
    .emptype-toast.success {
      background: var(--green);
      color: white;
    }
    .emptype-toast.error {
      background: var(--red);
      color: white;
    }
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    @media (max-width: 768px) {
      .emptype-page { padding: 20px 16px; }
      .emptype-header { flex-direction: column; align-items: flex-start; }
      .emptype-header-left { flex-wrap: wrap; }
      .emptype-form-row { grid-template-columns: 1fr; }
      .emptype-form-btn { width: 100%; }
      .emptype-modal { margin: 20px; padding: 24px; }
      .emptype-modal-actions { flex-direction: column; }
      .emptype-modal-btn { width: 100%; }
      .emptype-actions { flex-direction: column; gap: 4px; }
      .emptype-table th, .emptype-table td { padding: 10px 12px; font-size: 13px; }
    }
  `;

  return (
    <div className="emptype-page">
      <style>{sharedCSS}</style>

      {/* Header */}
      <div className="emptype-header">
        <div className="emptype-header-left">
          <span className="emptype-header-icon">💼</span>
          <div>
            <h1>Employee Types</h1>
            <div className="emptype-header-sub">Manage employee type classifications</div>
          </div>
          <span className="emptype-count-badge">{employeeTypes.length}</span>
        </div>
        <button className="emptype-back-btn" onClick={() => navigate('/settings')}>
          ← Back to Settings
        </button>
      </div>

      {/* Form */}
      <div className="emptype-form-card">
        <div className="emptype-form-title">
          {editingId ? '✏️ Edit Employee Type' : '➕ Add New Employee Type'}
        </div>
        <form onSubmit={handleSubmit}>
          <div className="emptype-form-row">
            <div className="emptype-form-group" style={{ gridColumn: '1 / 2' }}>
              <label className="emptype-form-label">
                Employee Type Name <span className="required">*</span>
              </label>
              <input
                className="emptype-form-input"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="e.g., Full-Time, Contractor, Intern"
                required
              />
            </div>
            <div className="emptype-form-group" style={{ gridColumn: '2 / 3' }}>
              <label className="emptype-form-label">Description</label>
              <input
                className="emptype-form-input"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Brief description of this employee type"
              />
            </div>
            <div className="emptype-form-group" style={{ gridColumn: '3 / 4', display: 'flex', gap: '8px' }}>
              {editingId && (
                <button
                  type="button"
                  className="emptype-form-btn cancel"
                  onClick={resetForm}
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                className="emptype-form-btn"
                disabled={submitting}
              >
                {submitting ? 'Saving...' : (editingId ? 'Update' : 'Add')}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* List */}
      <div className="emptype-list-card">
        <div className="emptype-list-header">
          <h3>All Employee Types</h3>
          <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
            {employeeTypes.length} type{employeeTypes.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div className="emptype-loading">
            <div className="emptype-spinner" />
            <p style={{ color: 'var(--muted)', fontSize: '14px' }}>Loading employee types...</p>
          </div>
        ) : employeeTypes.length === 0 ? (
          <div className="emptype-empty">
            <div className="emptype-empty-icon">📋</div>
            <h4>No employee types yet</h4>
            <p>Add your first employee type using the form above.</p>
          </div>
        ) : (
          <div className="emptype-table-wrap">
            <table className="emptype-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {employeeTypes.map(type => (
                  <tr key={type._id}>
                    <td className="emptype-name">{type.name}</td>
                    <td className="emptype-desc">{type.description || '—'}</td>
                    <td className="emptype-created">
                      {new Date(type.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="emptype-actions" style={{ justifyContent: 'flex-end' }}>
                        <button
                          className="emptype-action-btn edit"
                          onClick={() => handleEdit(type)}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          className="emptype-action-btn delete"
                          onClick={() => openDeleteModal(type)}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Modal */}
      {showDeleteModal && deleteTarget && (
        <div className="emptype-modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="emptype-modal" onClick={e => e.stopPropagation()}>
            <div className="emptype-modal-icon">⚠️</div>
            <h3>Delete Employee Type</h3>
            <p>
              Are you sure you want to delete <strong>"{deleteTarget.name}"</strong>?
              <br />
              <span style={{ color: '#94a3b8', fontSize: '13px' }}>
                This action cannot be undone.
              </span>
            </p>
            <div className="emptype-modal-actions">
              <button
                className="emptype-modal-btn cancel"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button
                className="emptype-modal-btn confirm"
                onClick={handleDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast.open && (
        <div className={`emptype-toast ${toast.type}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}
    </div>
  );
}