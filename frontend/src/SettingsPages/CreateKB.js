// src/SettingsPages/CreateKB.js - Manage ALL articles (Draft + Published)
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import axios from 'axios';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

function CreateKB() {
  const { accounts } = useMsal();
  const navigate = useNavigate();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [toast, setToast] = useState({ open: false, message: '', type: 'success' });
  
  // Delete confirmation modal state
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null, title: '' });

  useEffect(() => {
    fetchArticles();
    fetchCategories();
  }, []);

  const fetchArticles = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${BACKEND}/api/kb/articles`);
      setArticles(res.data || []);
    } catch (err) {
      console.error('Failed to fetch articles:', err);
      showToast('Failed to load articles', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await axios.get(`${BACKEND}/api/categories`);
      setCategories(res.data || []);
    } catch (err) {
      console.error('Failed to fetch categories:', err);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ open: true, message, type });
    setTimeout(() => setToast(p => ({ ...p, open: false })), 3000);
  };

  const handleEdit = (article) => {
    // Navigate to CreateKBForm with article data in state
    navigate('/settings/create-kb/new', { state: { editArticle: article } });
  };

  const confirmDelete = (id, title) => {
    setDeleteModal({ open: true, id, title });
  };

  const deleteArticle = async () => {
    const { id, title } = deleteModal;
    try {
      await axios.delete(`${BACKEND}/api/kb/articles/${id}`);
      setDeleteModal({ open: false, id: null, title: '' });
      showToast(`Article "${title}" deleted successfully!`, 'success');
      fetchArticles();
    } catch (err) {
      console.error('Delete error:', err);
      showToast('Failed to delete article', 'error');
    }
  };

  const cancelDelete = () => {
    setDeleteModal({ open: false, id: null, title: '' });
  };

  const publishArticle = async (id, title) => {
    try {
      await axios.put(`${BACKEND}/api/kb/articles/${id}`, { status: 'published' });
      showToast(`Article "${title}" published successfully!`, 'success');
      fetchArticles();
    } catch (err) {
      console.error('Publish error:', err);
      showToast('Failed to publish article', 'error');
    }
  };

  const filteredArticles = articles.filter(article => {
    const matchesSearch = searchTerm === '' || 
      article.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      article.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === '' || 
      article.category?.id === selectedCategory || 
      article.category?.name === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  };

  const sharedCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --navy: #002060; --navy2: #003090; --orange: #e98404; --white: #ffffff; --bg: #f5f7fa; --border: #e2e8f0; --text: #0f172a; --muted: #64748b; --light: #f8fafc; }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    
    .kb-manage-page { min-height: 100vh; width: 100%; background: var(--bg); font-family: 'Lato', sans-serif; color: var(--text); }
    .kb-manage-hero { background: var(--navy); position: relative; overflow: hidden; padding: 48px 48px 44px; }
    .kb-manage-hero::after { content: ''; position: absolute; right: -60px; top: -60px; width: 420px; height: 420px; border-radius: 50%; background: radial-gradient(circle, rgba(233,132,4,0.15) 0%, transparent 70%); pointer-events: none; }
    .kb-manage-hero-inner { position: relative; z-index: 2; max-width: 1320px; margin: 0 auto; animation: fadeUp 0.55s ease both; }
    .kb-manage-hero-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--orange); margin-bottom: 14px; }
    .kb-manage-hero-eyebrow-line { width: 28px; height: 2px; background: var(--orange); border-radius: 2px; }
    .kb-manage-hero h1 { font-family: 'Sora', sans-serif; font-size: clamp(28px, 3vw, 36px); font-weight: 800; color: #ffffff; line-height: 1.15; margin-bottom: 8px; letter-spacing: -0.02em; }
    .kb-manage-hero h1 em { font-style: normal; color: var(--orange); }
    .kb-manage-hero-sub { font-size: 15px; color: rgba(255,255,255,0.62); font-weight: 400; line-height: 1.6; }
    .kb-manage-content { max-width: 1320px; margin: 0 auto; padding: 32px 48px 56px; }
    .kb-manage-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px; }
    .kb-manage-title { font-family: 'Sora', sans-serif; font-size: 24px; font-weight: 700; color: var(--navy); }
    .kb-create-btn { padding: 12px 24px; background: var(--navy); color: white; border: none; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: 'Sora', sans-serif; }
    .kb-create-btn:hover { background: var(--navy2); }
    .kb-search-bar { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .kb-search-input { flex: 1; padding: 12px 18px; border: 1.5px solid var(--border); border-radius: 12px; font-size: 14px; background: var(--white); }
    .kb-search-input:focus { outline: none; border-color: var(--navy); }
    .kb-category-select { padding: 12px 18px; border: 1.5px solid var(--border); border-radius: 12px; font-size: 14px; background: var(--white); min-width: 180px; cursor: pointer; }
    .kb-stats { margin-bottom: 20px; font-size: 14px; color: var(--muted); }
    .kb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 24px; }
    .kb-card { background: var(--white); border: 1.5px solid var(--border); border-radius: 18px; padding: 24px; transition: all 0.22s ease; animation: fadeUp 0.4s ease both; }
    .kb-card:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0,32,96,0.1); border-color: var(--navy); }
    .kb-card-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: 700; margin-bottom: 12px; }
    .kb-card-badge.draft { background: #fee2e2; color: #991b1b; }
    .kb-card-badge.published { background: #d1fae5; color: #065f46; }
    .kb-card-title { font-family: 'Sora', sans-serif; font-size: 18px; font-weight: 700; color: var(--navy); margin-bottom: 10px; cursor: pointer; }
    .kb-card-title:hover { text-decoration: underline; }
    .kb-card-desc { font-size: 13px; color: var(--muted); line-height: 1.5; margin-bottom: 16px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .kb-card-footer { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--muted); border-top: 1px solid var(--border); padding-top: 14px; margin-top: 8px; }
    .kb-card-actions { display: flex; gap: 8px; margin-top: 12px; }
    .kb-action-btn { padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; border: none; font-family: 'Sora', sans-serif; }
    .kb-action-edit { background: var(--navy); color: white; }
    .kb-action-edit:hover { background: var(--navy2); }
    .kb-action-publish { background: #10b981; color: white; }
    .kb-action-publish:hover { background: #059669; }
    .kb-action-delete { background: #ef4444; color: white; }
    .kb-action-delete:hover { background: #dc2626; }
    .kb-empty { text-align: center; padding: 80px; background: var(--white); border: 1.5px solid var(--border); border-radius: 20px; }
    .kb-empty-icon { font-size: 48px; margin-bottom: 16px; }
    .kb-empty-title { font-family: 'Sora', sans-serif; font-size: 18px; font-weight: 700; color: var(--navy); margin-bottom: 8px; }
    .kb-loading { text-align: center; padding: 80px; }
    .kb-spinner { width: 40px; height: 40px; border-radius: 50%; border: 3px solid var(--border); border-top-color: var(--navy); animation: spin 0.9s linear infinite; margin: 0 auto 16px; }
    .kb-toast { position: fixed; bottom: 32px; right: 32px; z-index: 10000; padding: 14px 24px; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); font-size: 14px; font-weight: 600; animation: slideIn 0.3s ease; font-family: 'Sora', sans-serif; }
    .kb-toast-success { background: #10b981; color: white; }
    .kb-toast-error { background: #ef4444; color: white; }
    .kb-back-btn { background: none; border: none; font-size: 14px; font-weight: 600; color: var(--navy); cursor: pointer; margin-bottom: 20px; display: inline-flex; align-items: center; gap: 6px; font-family: 'Sora', sans-serif; }
    .kb-back-btn:hover { color: var(--orange); }

    /* Delete Modal Styles */
    .modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.5);
      z-index: 9999; backdrop-filter: blur(3px); animation: fadeIn 0.15s;
      display: flex; align-items: center; justify-content: center;
    }
    .delete-modal {
      background: var(--white); border-radius: 20px;
      max-width: 450px; width: 90%; overflow: hidden;
      animation: slideUp 0.2s ease;
    }
    .delete-modal-header {
      padding: 24px; border-bottom: 1px solid var(--border);
      background: #fef2f2;
    }
    .delete-modal-header h3 {
      font-family: 'Sora', sans-serif;
      font-size: 18px; font-weight: 700;
      color: #991b1b;
    }
    .delete-modal-body {
      padding: 24px;
    }
    .delete-modal-body p {
      font-size: 14px;
      color: var(--text);
      margin-bottom: 4px;
    }
    .delete-modal-body .article-title {
      font-weight: 700;
      color: var(--navy);
      background: var(--light);
      padding: 8px 12px;
      border-radius: 8px;
      margin-top: 12px;
      word-break: break-word;
    }
    .delete-modal-actions {
      display: flex; gap: 12px;
      padding: 20px 24px;
      border-top: 1px solid var(--border);
      background: var(--light);
    }
    .delete-modal-actions button {
      flex: 1;
      padding: 10px 20px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      font-family: 'Sora', sans-serif;
      border: none;
    }
    .delete-confirm-btn {
      background: #ef4444;
      color: white;
    }
    .delete-confirm-btn:hover {
      background: #dc2626;
    }
    .delete-cancel-btn {
      background: var(--white);
      border: 1.5px solid var(--border);
      color: var(--text);
    }
    .delete-cancel-btn:hover {
      border-color: var(--navy);
      color: var(--navy);
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    
    @media (max-width: 768px) {
      .kb-manage-hero { padding: 32px 24px; }
      .kb-manage-content { padding: 24px 20px 40px; }
      .kb-grid { grid-template-columns: 1fr; }
      .kb-manage-header { flex-direction: column; align-items: flex-start; }
    }
  `;

  return (
    <div className="kb-manage-page">
      <style>{sharedCSS}</style>
      
      <div className="kb-manage-hero">
        <div className="kb-manage-hero-inner">
          <div className="kb-manage-hero-eyebrow">
            <div className="kb-manage-hero-eyebrow-line" />
            Knowledge Base Management
          </div>
          <h1>Manage <em>Articles</em></h1>
          <p className="kb-manage-hero-sub">Create, edit, publish, or delete knowledge base articles</p>
        </div>
      </div>
      
      <div className="kb-manage-content">
        <button className="kb-back-btn" onClick={() => navigate('/settings')}>← Back to Settings</button>
        
        <div className="kb-manage-header">
          <div className="kb-manage-title">All Articles</div>
          <button className="kb-create-btn" onClick={() => navigate('/settings/create-kb/new')}>+ Create New Article</button>
        </div>
        
        <div className="kb-search-bar">
          <input type="text" className="kb-search-input" placeholder="Search articles..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          <select className="kb-category-select" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat._id || cat.id} value={cat._id || cat.id}>{cat.categoryName || cat.name}</option>
            ))}
          </select>
        </div>
        
        <div className="kb-stats">Showing {filteredArticles.length} of {articles.length} articles</div>
        
        {loading ? (
          <div className="kb-loading">
            <div className="kb-spinner" />
            <div style={{ color: '#64748b' }}>Loading articles...</div>
          </div>
        ) : filteredArticles.length === 0 ? (
          <div className="kb-empty">
            <div className="kb-empty-icon">📚</div>
            <div className="kb-empty-title">No articles found</div>
            <div style={{ fontSize: 14, color: '#64748b' }}>Click "Create New Article" to get started</div>
          </div>
        ) : (
          <div className="kb-grid">
            {filteredArticles.map(article => (
              <div key={article._id} className="kb-card">
                <div className={`kb-card-badge ${article.status === 'draft' ? 'draft' : 'published'}`}>
                  {article.category?.name || 'General'} • {article.status === 'draft' ? 'Draft' : 'Published'}
                </div>
                <div className="kb-card-title" onClick={() => navigate(`/kb/${article._id}`)}>
                  {article.title}
                </div>
                <div className="kb-card-desc">{article.description || 'No description provided'}</div>
                <div className="kb-card-footer">
                  <span>{formatDate(article.createdAt)}</span>
                  <span>👁️ {article.viewCount || 0} views</span>
                </div>
                <div className="kb-card-actions">
                  <button className="kb-action-btn kb-action-edit" onClick={() => handleEdit(article)}>✏️ Edit</button>
                  {article.status === 'draft' && (
                    <button className="kb-action-btn kb-action-publish" onClick={() => publishArticle(article._id, article.title)}>📢 Publish</button>
                  )}
                  <button className="kb-action-btn kb-action-delete" onClick={() => confirmDelete(article._id, article.title)}>🗑️ Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Delete Confirmation Modal */}
      {deleteModal.open && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-modal-header">
              <h3>🗑️ Delete Article</h3>
            </div>
            <div className="delete-modal-body">
              <p>Are you sure you want to delete this article?</p>
              <div className="article-title">"{deleteModal.title}"</div>
              <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '16px' }}>
                ⚠️ This action cannot be undone. The article will be permanently removed.
              </p>
            </div>
            <div className="delete-modal-actions">
              <button className="delete-cancel-btn" onClick={cancelDelete}>Cancel</button>
              <button className="delete-confirm-btn" onClick={deleteArticle}>Yes, Delete</button>
            </div>
          </div>
        </div>
      )}
      
      {toast.open && (
        <div className={`kb-toast kb-toast-${toast.type}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}
    </div>
  );
}

export default CreateKB;