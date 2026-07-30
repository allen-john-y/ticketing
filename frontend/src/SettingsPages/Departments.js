// src/SettingsPages/Departments.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useMsal } from '@azure/msal-react';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

export default function Departments() {
  const navigate = useNavigate();
  const { accounts } = useMsal();
  const currentUser = accounts[0] || {};

  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [toast, setToast] = useState({ open: false, message: '', type: 'success' });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    fetchDepartments();
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ open: true, message, type });
    setTimeout(() => setToast(p => ({ ...p, open: false })), 3000);
  };

  const fetchDepartments = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${BACKEND}/api/departments`);
      setDepartments(res.data || []);
    } catch (err) {
      showToast('Failed to load departments', 'error');
      console.error('Error fetching departments:', err);
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
      showToast('Department name is required', 'error');
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
        // Update existing department
        await axios.put(`${BACKEND}/api/departments/${editingId}`, payload);
        showToast('Department updated successfully', 'success');
      } else {
        // Create new department
        await axios.post(`${BACKEND}/api/departments`, payload);
        showToast('Department created successfully', 'success');
      }

      resetForm();
      fetchDepartments();
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to save department';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', description: '' });
    setEditingId(null);
  };

  const handleEdit = (dept) => {
    setFormData({ name: dept.name, description: dept.description || '' });
    setEditingId(dept._id);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await axios.delete(`${BACKEND}/api/departments/${deleteTarget._id}`);
      showToast(`Department "${deleteTarget.name}" deleted successfully`, 'success');
      setShowDeleteModal(false);
      setDeleteTarget(null);
      fetchDepartments();
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to delete department';
      showToast(msg, 'error');
    }
  };

  const openDeleteModal = (dept) => {
    setDeleteTarget(dept);
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

    .dept-page {
      min-height: 70vh;
      width: 100%;
      max-width: 1100px;
      margin: 0 auto;
      padding: 32px 24px;
      font-family: 'Lato', sans-serif;
      color: var(--text);
      background: var(--bg);
    }

    .dept-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 32px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .dept-header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .dept-header-icon {
      font-size: 36px;
    }
    .dept-header h1 {
      font-family: 'Sora', sans-serif;
      font-size: 26px;
      font-weight: 800;
      color: var(--navy);
      margin: 0;
    }
    .dept-header-sub {
      font-size: 14px;
      color: var(--muted);
      margin-top: 4px;
    }
    .dept-count-badge {
      background: var(--navy);
      color: white;
      padding: 4px 14px;
      border-radius: 30px;
      font-size: 13px;
      font-weight: 600;
    }
    .dept-back-btn {
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
    .dept-back-btn:hover {
      border-color: var(--navy);
      background: rgba(0,32,96,0.04);
    }

    /* Form Card */
    .dept-form-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      padding: 28px 32px;
      margin-bottom: 32px;
    }
    .dept-form-title {
      font-family: 'Sora', sans-serif;
      font-size: 16px;
      font-weight: 700;
      color: var(--navy);
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .dept-form-row {
      display: grid;
      grid-template-columns: 1fr 2fr auto;
      gap: 16px;
      align-items: flex-end;
    }
    .dept-form-group {
      display: flex;
      flex-direction: column;
    }
    .dept-form-label {
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 6px;
      font-family: 'Sora', sans-serif;
    }
    .dept-form-label .required {
      color: var(--red);
      margin-left: 4px;
    }
    .dept-form-input {
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
    .dept-form-input:focus {
      outline: none;
      border-color: var(--navy);
      box-shadow: 0 0 0 4px rgba(0,32,96,0.08);
    }
    .dept-form-btn {
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
    .dept-form-btn:hover:not(:disabled) {
      background: var(--navy2);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,32,96,0.2);
    }
    .dept-form-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .dept-form-btn.cancel {
      background: var(--bg);
      color: var(--text);
    }
    .dept-form-btn.cancel:hover:not(:disabled) {
      background: var(--border);
      transform: none;
      box-shadow: none;
    }

    /* List */
    .dept-list-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      overflow: hidden;
    }
    .dept-list-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 28px;
      border-bottom: 1.5px solid var(--border);
      background: var(--light);
    }
    .dept-list-header h3 {
      font-family: 'Sora', sans-serif;
      font-size: 15px;
      font-weight: 700;
      color: var(--navy);
    }

    .dept-table-wrap {
      overflow-x: auto;
    }
    .dept-table {
      width: 100%;
      border-collapse: collapse;
    }
    .dept-table th {
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
    .dept-table td {
      padding: 14px 20px;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
      vertical-align: middle;
    }
    .dept-table tr:last-child td {
      border-bottom: none;
    }
    .dept-table tr:hover td {
      background: rgba(0,32,96,0.02);
    }

    .dept-name {
      font-weight: 600;
      color: var(--text);
    }
    .dept-desc {
      color: var(--muted);
      font-size: 13px;
    }
    .dept-created {
      font-size: 12px;
      color: var(--muted);
    }

    .dept-actions {
      display: flex;
      gap: 8px;
    }
    .dept-action-btn {
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
    .dept-action-btn.edit {
      background: rgba(0,32,96,0.08);
      color: var(--navy);
    }
    .dept-action-btn.edit:hover {
      background: rgba(0,32,96,0.15);
    }
    .dept-action-btn.delete {
      background: rgba(239,68,68,0.08);
      color: var(--red);
    }
    .dept-action-btn.delete:hover {
      background: rgba(239,68,68,0.15);
    }

    .dept-empty {
      text-align: center;
      padding: 60px 20px;
      color: var(--muted);
    }
    .dept-empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    .dept-empty h4 {
      font-size: 18px;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 8px;
    }
    .dept-empty p {
      font-size: 14px;
    }

    /* Loading */
    .dept-loading {
      text-align: center;
      padding: 60px 20px;
    }
    .dept-spinner {
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
    .dept-modal-overlay {
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
    .dept-modal {
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
    .dept-modal-icon {
      font-size: 48px;
      text-align: center;
      margin-bottom: 16px;
    }
    .dept-modal h3 {
      font-family: 'Sora', sans-serif;
      font-size: 20px;
      font-weight: 700;
      color: var(--text);
      text-align: center;
      margin-bottom: 8px;
    }
    .dept-modal p {
      color: var(--muted);
      text-align: center;
      font-size: 15px;
      margin-bottom: 24px;
      line-height: 1.6;
    }
    .dept-modal-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
    }
    .dept-modal-btn {
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
    .dept-modal-btn.cancel {
      background: var(--bg);
      color: var(--text);
    }
    .dept-modal-btn.cancel:hover {
      background: var(--border);
    }
    .dept-modal-btn.confirm {
      background: var(--red);
      color: white;
    }
    .dept-modal-btn.confirm:hover {
      background: #dc2626;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(239,68,68,0.3);
    }

    /* Toast */
    .dept-toast {
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
    .dept-toast.success {
      background: var(--green);
      color: white;
    }
    .dept-toast.error {
      background: var(--red);
      color: white;
    }
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    @media (max-width: 768px) {
      .dept-page { padding: 20px 16px; }
      .dept-header { flex-direction: column; align-items: flex-start; }
      .dept-header-left { flex-wrap: wrap; }
      .dept-form-row { grid-template-columns: 1fr; }
      .dept-form-btn { width: 100%; }
      .dept-modal { margin: 20px; padding: 24px; }
      .dept-modal-actions { flex-direction: column; }
      .dept-modal-btn { width: 100%; }
      .dept-actions { flex-direction: column; gap: 4px; }
      .dept-table th, .dept-table td { padding: 10px 12px; font-size: 13px; }
    }
  `;

  return (
    <div className="dept-page">
      <style>{sharedCSS}</style>

      {/* Header */}
      <div className="dept-header">
        <div className="dept-header-left">
          <span className="dept-header-icon">🏢</span>
          <div>
            <h1>Departments</h1>
            <div className="dept-header-sub">Manage your organization's departments</div>
          </div>
          <span className="dept-count-badge">{departments.length}</span>
        </div>
        <button className="dept-back-btn" onClick={() => navigate('/settings')}>
          ← Back to Settings
        </button>
      </div>

      {/* Form */}
      <div className="dept-form-card">
        <div className="dept-form-title">
          {editingId ? '✏️ Edit Department' : '➕ Add New Department'}
        </div>
        <form onSubmit={handleSubmit}>
          <div className="dept-form-row">
            <div className="dept-form-group" style={{ gridColumn: '1 / 2' }}>
              <label className="dept-form-label">
                Department Name <span className="required">*</span>
              </label>
              <input
                className="dept-form-input"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="e.g., Engineering"
                required
              />
            </div>
            <div className="dept-form-group" style={{ gridColumn: '2 / 3' }}>
              <label className="dept-form-label">Description</label>
              <input
                className="dept-form-input"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Brief description of the department"
              />
            </div>
            <div className="dept-form-group" style={{ gridColumn: '3 / 4', display: 'flex', gap: '8px' }}>
              {editingId && (
                <button
                  type="button"
                  className="dept-form-btn cancel"
                  onClick={resetForm}
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                className="dept-form-btn"
                disabled={submitting}
              >
                {submitting ? 'Saving...' : (editingId ? 'Update' : 'Add')}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* List */}
      <div className="dept-list-card">
        <div className="dept-list-header">
          <h3>All Departments</h3>
          <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
            {departments.length} department{departments.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div className="dept-loading">
            <div className="dept-spinner" />
            <p style={{ color: 'var(--muted)', fontSize: '14px' }}>Loading departments...</p>
          </div>
        ) : departments.length === 0 ? (
          <div className="dept-empty">
            <div className="dept-empty-icon">📋</div>
            <h4>No departments yet</h4>
            <p>Add your first department using the form above.</p>
          </div>
        ) : (
          <div className="dept-table-wrap">
            <table className="dept-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {departments.map(dept => (
                  <tr key={dept._id}>
                    <td className="dept-name">{dept.name}</td>
                    <td className="dept-desc">{dept.description || '—'}</td>
                    <td className="dept-created">
                      {new Date(dept.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="dept-actions" style={{ justifyContent: 'flex-end' }}>
                        <button
                          className="dept-action-btn edit"
                          onClick={() => handleEdit(dept)}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          className="dept-action-btn delete"
                          onClick={() => openDeleteModal(dept)}
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
        <div className="dept-modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="dept-modal" onClick={e => e.stopPropagation()}>
            <div className="dept-modal-icon">⚠️</div>
            <h3>Delete Department</h3>
            <p>
              Are you sure you want to delete <strong>"{deleteTarget.name}"</strong>?
              <br />
              <span style={{ color: '#94a3b8', fontSize: '13px' }}>
                This action cannot be undone.
              </span>
            </p>
            <div className="dept-modal-actions">
              <button
                className="dept-modal-btn cancel"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button
                className="dept-modal-btn confirm"
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
        <div className={`dept-toast ${toast.type}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}
    </div>
  );
}