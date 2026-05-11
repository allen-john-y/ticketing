// KBView.js - Read-only view for regular users from App.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

function KBView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { accounts } = useMsal();
  
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Check if user is admin (for edit button - but won't be used in regular view)
  useEffect(() => {
    const userEmail = (accounts?.[0]?.username || '').toLowerCase();
    // Only specific admin emails can see edit button
    const adminEmails = ['allenj@sandeza-inc.com', 'admin@sandeza-inc.com'];
    setIsAdmin(adminEmails.includes(userEmail));
  }, [accounts]);

  useEffect(() => {
    fetchArticle();
  }, [id]);

  const fetchArticle = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${BACKEND}/api/kb/articles/${id}`);
      setArticle(res.data);
    } catch (err) {
      console.error('Failed to fetch article:', err);
      setError('Article not found');
    } finally {
      setLoading(false);
    }
  };
  const location = useLocation();
const returnTo = location.state?.returnTo || '/kb';

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  };

  const sharedCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    .kbv-page {
      min-height: 100vh;
      background: linear-gradient(135deg, #f5f7fa 0%, #eef2f6 100%);
      font-family: 'Inter', sans-serif;
    }
    
    /* Hero Section */
    .kbv-hero {
      background: linear-gradient(135deg, #002060 0%, #003080 100%);
      position: relative;
      overflow: hidden;
      padding: 60px 24px 50px;
    }
    
    .kbv-hero::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -20%;
      width: 60%;
      height: 200%;
      background: radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%);
      transform: rotate(25deg);
      pointer-events: none;
    }
    
    .kbv-hero::after {
      content: '';
      position: absolute;
      bottom: -30%;
      left: -10%;
      width: 50%;
      height: 150%;
      background: radial-gradient(circle, rgba(233,132,4,0.1) 0%, transparent 70%);
      pointer-events: none;
    }
    
    .kbv-hero-inner {
      max-width: 900px;
      margin: 0 auto;
      position: relative;
      z-index: 2;
    }
    
    .kbv-back-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: rgba(255,255,255,0.7);
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 30px;
      transition: color 0.2s;
      cursor: pointer;
    }
    
    .kbv-back-link:hover {
      color: #e98404;
    }
    
    .kbv-title {
      font-size: 48px;
      font-weight: 800;
      color: white;
      line-height: 1.2;
      margin-bottom: 20px;
      letter-spacing: -0.02em;
    }
    
    .kbv-meta {
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
      font-size: 14px;
      color: rgba(255,255,255,0.6);
    }
    
    .kbv-meta span {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    /* Content */
    .kbv-content {
      max-width: 900px;
      margin: 0 auto;
      padding: 48px 24px 80px;
    }
    
    /* Article Card */
    .kbv-article-card {
      background: white;
      border-radius: 24px;
      box-shadow: 0 20px 40px -12px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    
    /* Category Badge */
    .kbv-category {
      display: inline-block;
      padding: 6px 14px;
      background: linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%);
      color: #5b21b6;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 20px;
    }
    
    /* Article Header */
    .kbv-article-header {
      padding: 32px 40px 0;
      border-bottom: 1px solid #eef2f6;
    }
    
    .kbv-article-header h1 {
      font-size: 32px;
      font-weight: 700;
      color: #002060;
      margin-bottom: 16px;
      line-height: 1.3;
    }
    
    .kbv-header-meta {
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
      padding-bottom: 20px;
      font-size: 13px;
      color: #64748b;
    }
    
    /* Description */
    .kbv-description {
      padding: 24px 40px;
      background: #f8fafc;
      border-bottom: 1px solid #eef2f6;
      font-size: 16px;
      color: #334155;
      line-height: 1.6;
      font-style: italic;
    }
    
    /* Article Body */
    .kbv-body {
      padding: 48px 40px;
      font-size: 16px;
      line-height: 1.8;
      color: #1e293b;
    }
    
    .kbv-body h1 {
      font-size: 28px;
      font-weight: 700;
      color: #002060;
      margin: 32px 0 16px;
    }
    
    .kbv-body h2 {
      font-size: 24px;
      font-weight: 700;
      color: #002060;
      margin: 28px 0 14px;
    }
    
    .kbv-body h3 {
      font-size: 20px;
      font-weight: 600;
      color: #002060;
      margin: 24px 0 12px;
    }
    
    .kbv-body p {
      margin-bottom: 20px;
    }
    
    .kbv-body ul, .kbv-body ol {
      margin: 0 0 20px 24px;
    }
    
    .kbv-body li {
      margin-bottom: 8px;
    }
    
    .kbv-body img {
      max-width: 100%;
      height: auto;
      border-radius: 12px;
      margin: 24px 0;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    
    .kbv-body a {
      color: #e98404;
      text-decoration: none;
      border-bottom: 1px solid rgba(233,132,4,0.3);
    }
    
    .kbv-body a:hover {
      color: #002060;
      border-bottom-color: #002060;
    }
    
    .kbv-body pre {
      background: #1e293b;
      color: #e2e8f0;
      padding: 20px;
      border-radius: 12px;
      overflow-x: auto;
      margin: 24px 0;
      font-size: 14px;
    }
    
    .kbv-body code {
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 6px;
      font-family: 'Monaco', monospace;
      font-size: 14px;
    }
    
    .kbv-body blockquote {
      border-left: 4px solid #e98404;
      padding: 16px 24px;
      margin: 24px 0;
      background: #fefce8;
      border-radius: 0 12px 12px 0;
      font-style: italic;
      color: #713f12;
    }
    
    /* Footer */
    .kbv-footer {
      padding: 24px 40px;
      background: #f8fafc;
      border-top: 1px solid #eef2f6;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    
    .kbv-footer-stats {
      display: flex;
      gap: 24px;
      font-size: 13px;
      color: #64748b;
    }
    
    .kbv-btn {
      padding: 10px 24px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
      font-family: 'Inter', sans-serif;
    }
    
    .kbv-btn-back {
      background: white;
      border: 1.5px solid #e2e8f0;
      color: #1e293b;
    }
    
    .kbv-btn-back:hover {
      border-color: #002060;
      color: #002060;
    }
    
    .kbv-btn-edit {
      background: #002060;
      color: white;
    }
    
    .kbv-btn-edit:hover {
      background: #003080;
      transform: translateY(-2px);
    }
    
    /* Loading */
    .kbv-loading {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #f5f7fa 0%, #eef2f6 100%);
    }
    
    .kbv-spinner {
      width: 50px;
      height: 50px;
      border: 3px solid #e2e8f0;
      border-top-color: #002060;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    /* Error */
    .kbv-error {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      text-align: center;
      padding: 40px;
      background: linear-gradient(135deg, #f5f7fa 0%, #eef2f6 100%);
    }
    
    .kbv-error-icon {
      font-size: 64px;
      margin-bottom: 20px;
    }
    
    .kbv-error h2 {
      font-size: 24px;
      color: #002060;
      margin-bottom: 12px;
    }
    
    /* Responsive */
    @media (max-width: 768px) {
      .kbv-title { font-size: 32px; }
      .kbv-article-header { padding: 24px 24px 0; }
      .kbv-article-header h1 { font-size: 24px; }
      .kbv-description { padding: 20px 24px; }
      .kbv-body { padding: 32px 24px; }
      .kbv-footer { padding: 20px 24px; flex-direction: column; text-align: center; }
    }
  `;

  if (loading) {
    return (
      <div className="kbv-page">
        <style>{sharedCSS}</style>
        <div className="kbv-loading">
          <div className="kbv-spinner" />
        </div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="kbv-page">
        <style>{sharedCSS}</style>
        <div className="kbv-error">
          <div className="kbv-error-icon">📖</div>
          <h2>Article Not Found</h2>
          <p style={{ color: '#64748b', marginBottom: 24 }}>The article you're looking for doesn't exist or has been removed.</p>
          <button className="kbv-btn kbv-btn-back" onClick={() => navigate(returnTo)}>
            ← Back to Knowledge Base
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="kbv-page">
      <style>{sharedCSS}</style>
      
      {/* Hero Section */}
      <div className="kbv-hero">
        <div className="kbv-hero-inner">
          <div className="kbv-back-link" onClick={() => navigate(returnTo)}>
            <span>←</span> Back to Knowledge Base
          </div>
          <h1 className="kbv-title">{article.title}</h1>
          <div className="kbv-meta">
            <span>📅 {formatDate(article.createdAt)}</span>
            <span>👁️ {article.viewCount || 0} views</span>
            <span>✏️ By {article.createdBy?.name || article.createdBy?.email || 'Team'}</span>
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="kbv-content">
        <div className="kbv-article-card">
          <div className="kbv-article-header">
            <div className="kbv-category">
              {article.category?.name || 'General'}
            </div>
            <h1>{article.title}</h1>
            <div className="kbv-header-meta">
              <span>📅 Published on {formatDate(article.createdAt)}</span>
              <span>👁️ {article.viewCount || 0} views</span>
            </div>
          </div>
          
          {article.description && (
            <div className="kbv-description">
              {article.description}
            </div>
          )}
          
          <div className="kbv-body" dangerouslySetInnerHTML={{ __html: article.content }} />
          
          <div className="kbv-footer">
            <div className="kbv-footer-stats">
              <span>📅 Last updated: {formatDate(article.updatedAt)}</span>
              <span>👁️ {article.viewCount || 0} people found this helpful</span>
            </div>
            <button className="kbv-btn kbv-btn-back" onClick={() => navigate(returnTo)}>
              ← Browse More Articles
            </button>
          </div>
        </div>  
      </div>
    </div>
  );
}

export default KBView;