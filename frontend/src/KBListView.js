// src/KBListView.js - View ONLY published articles (All users)
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

function KBListView() {
  const navigate = useNavigate();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    fetchArticles();
    fetchCategories();
  }, []);

  const fetchArticles = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${BACKEND}/api/kb/articles/published`);
      setArticles(res.data || []);
    } catch (err) {
      console.error('Failed to fetch articles:', err);
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
    .kb-list-page { min-height: 100vh; width: 100%; background: var(--bg); font-family: 'Lato', sans-serif; color: var(--text); }
    .kb-list-hero { background: var(--navy); position: relative; overflow: hidden; padding: 48px 48px 44px; }
    .kb-list-hero::after { content: ''; position: absolute; right: -60px; top: -60px; width: 420px; height: 420px; border-radius: 50%; background: radial-gradient(circle, rgba(233,132,4,0.15) 0%, transparent 70%); pointer-events: none; }
    .kb-list-hero-inner { position: relative; z-index: 2; max-width: 1320px; margin: 0 auto; animation: fadeUp 0.55s ease both; }
    .kb-list-hero-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--orange); margin-bottom: 14px; }
    .kb-list-hero-eyebrow-line { width: 28px; height: 2px; background: var(--orange); border-radius: 2px; }
    .kb-list-hero h1 { font-family: 'Sora', sans-serif; font-size: clamp(28px, 3vw, 36px); font-weight: 800; color: #ffffff; line-height: 1.15; margin-bottom: 8px; letter-spacing: -0.02em; }
    .kb-list-hero h1 em { font-style: normal; color: var(--orange); }
    .kb-list-hero-sub { font-size: 15px; color: rgba(255,255,255,0.62); font-weight: 400; line-height: 1.6; }
    .kb-list-content { max-width: 1320px; margin: 0 auto; padding: 32px 48px 56px; }
    .kb-search-bar { display: flex; gap: 16px; margin-bottom: 32px; flex-wrap: wrap; }
    .kb-search-input { flex: 1; padding: 12px 18px; border: 1.5px solid var(--border); border-radius: 12px; font-size: 14px; background: var(--white); }
    .kb-search-input:focus { outline: none; border-color: var(--navy); }
    .kb-category-select { padding: 12px 18px; border: 1.5px solid var(--border); border-radius: 12px; font-size: 14px; background: var(--white); min-width: 180px; cursor: pointer; }
    .kb-stats { margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border); font-size: 14px; color: var(--muted); }
    .kb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 24px; }
    .kb-card { background: var(--white); border: 1.5px solid var(--border); border-radius: 18px; padding: 24px; cursor: pointer; transition: all 0.22s ease; animation: fadeUp 0.4s ease both; }
    .kb-card:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0,32,96,0.1); border-color: var(--navy); }
    .kb-card-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: 700; background: #ede9fe; color: #5b21b6; margin-bottom: 12px; }
    .kb-card-title { font-family: 'Sora', sans-serif; font-size: 18px; font-weight: 700; color: var(--navy); margin-bottom: 12px; line-height: 1.3; }
    .kb-card-desc { font-size: 13px; color: var(--muted); line-height: 1.5; margin-bottom: 16px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .kb-card-footer { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--muted); border-top: 1px solid var(--border); padding-top: 14px; margin-top: 8px; }
    .kb-card-views { display: flex; align-items: center; gap: 4px; }
    .kb-empty { text-align: center; padding: 80px; background: var(--white); border: 1.5px solid var(--border); border-radius: 20px; }
    .kb-empty-icon { font-size: 48px; margin-bottom: 16px; }
    .kb-empty-title { font-family: 'Sora', sans-serif; font-size: 18px; font-weight: 700; color: var(--navy); margin-bottom: 8px; }
    .kb-loading { text-align: center; padding: 80px; }
    .kb-spinner { width: 40px; height: 40px; border-radius: 50%; border: 3px solid var(--border); border-top-color: var(--navy); animation: spin 0.9s linear infinite; margin: 0 auto 16px; }
    @media (max-width: 768px) {
      .kb-list-hero { padding: 32px 24px; }
      .kb-list-content { padding: 24px 20px 40px; }
      .kb-search-bar { flex-direction: column; }
      .kb-grid { grid-template-columns: 1fr; }
    }
  `;

  return (
    <div className="kb-list-page">
      <style>{sharedCSS}</style>
      
      <div className="kb-list-hero">
        <div className="kb-list-hero-inner">
          <div className="kb-list-hero-eyebrow">
            <div className="kb-list-hero-eyebrow-line" />
            Knowledge Base
          </div>
          <h1>Browse <em>Articles</em></h1>
          <p className="kb-list-hero-sub">Find helpful documentation and guides from our team</p>
        </div>
      </div>
      
      <div className="kb-list-content">
        <div className="kb-search-bar">
          <input type="text" className="kb-search-input" placeholder="Search articles..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          <select className="kb-category-select" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat._id || cat.id} value={cat._id || cat.id}>{cat.categoryName || cat.name}</option>
            ))}
          </select>
        </div>
        
        <div className="kb-stats">Showing {filteredArticles.length} published articles</div>
        
        {loading ? (
          <div className="kb-loading">
            <div className="kb-spinner" />
            <div style={{ color: '#64748b' }}>Loading articles...</div>
          </div>
        ) : filteredArticles.length === 0 ? (
          <div className="kb-empty">
            <div className="kb-empty-icon">📚</div>
            <div className="kb-empty-title">No articles found</div>
            <div style={{ fontSize: 14, color: '#64748b' }}>Check back later for new articles</div>
          </div>
        ) : (
          <div className="kb-grid">
            {filteredArticles.map(article => (
              <div key={article._id} className="kb-card" onClick={() => navigate(`/kb/${article._id}`)}>
                <div className="kb-card-badge">{article.category?.name || 'General'}</div>
                <div className="kb-card-title">{article.title}</div>
                <div className="kb-card-desc">{article.description || 'No description provided'}</div>
                <div className="kb-card-footer">
                  <span>{formatDate(article.createdAt)}</span>
                  <div className="kb-card-views">👁️ {article.viewCount || 0} views</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default KBListView;