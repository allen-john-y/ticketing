// src/KBView.js - View single article (Read only OR Edit mode)
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import axios from 'axios';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

// Rich Text Editor Toolbar for Edit Mode
const RichTextToolbar = ({ editorRef }) => {
  const execCommand = (command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  };

  const setFontSize = () => {
    const size = prompt('Enter font size (1-7 or px value):', '3');
    if (size) execCommand('fontSize', size);
  };

  const setFontColor = () => {
    const color = prompt('Enter color (name, hex, or rgb):', 'black');
    if (color) execCommand('foreColor', color);
  };

  const setBackColor = () => {
    const color = prompt('Enter background color:', 'yellow');
    if (color) execCommand('backColor', color);
  };

  const insertLink = () => {
    const url = prompt('Enter URL:', 'https://');
    if (url) execCommand('createLink', url);
  };

  const insertImage = () => {
    const url = prompt('Enter image URL:', 'https://');
    if (url) execCommand('insertImage', url);
  };

  const insertUnorderedList = () => execCommand('insertUnorderedList');
  const insertOrderedList = () => execCommand('insertOrderedList');
  const justifyLeft = () => execCommand('justifyLeft');
  const justifyCenter = () => execCommand('justifyCenter');
  const justifyRight = () => execCommand('justifyRight');

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '5px', padding: '10px',
      background: '#f8fafc', border: '1px solid #e2e8f0', borderBottom: 'none',
      borderRadius: '12px 12px 0 0',
    }}>
      <button type="button" onClick={() => execCommand('bold')} title="Bold" style={toolbarBtnStyle}><b>B</b></button>
      <button type="button" onClick={() => execCommand('italic')} title="Italic" style={toolbarBtnStyle}><i>I</i></button>
      <button type="button" onClick={() => execCommand('underline')} title="Underline" style={toolbarBtnStyle}><u>U</u></button>
      <button type="button" onClick={() => execCommand('strikeThrough')} title="Strikethrough" style={toolbarBtnStyle}><s>S</s></button>
      <div style={{ width: '1px', background: '#e2e8f0', margin: '0 5px' }} />
      <button type="button" onClick={() => execCommand('undo')} title="Undo" style={toolbarBtnStyle}>↩️</button>
      <button type="button" onClick={() => execCommand('redo')} title="Redo" style={toolbarBtnStyle}>↪️</button>
      <div style={{ width: '1px', background: '#e2e8f0', margin: '0 5px' }} />
      <button type="button" onClick={setFontSize} title="Font Size" style={toolbarBtnStyle}>🔤 Size</button>
      <button type="button" onClick={setFontColor} title="Text Color" style={toolbarBtnStyle}>🎨 Color</button>
      <button type="button" onClick={setBackColor} title="Background Color" style={toolbarBtnStyle}>🖌️ Highlight</button>
      <div style={{ width: '1px', background: '#e2e8f0', margin: '0 5px' }} />
      <button type="button" onClick={insertUnorderedList} title="Bullet List" style={toolbarBtnStyle}>• List</button>
      <button type="button" onClick={insertOrderedList} title="Numbered List" style={toolbarBtnStyle}>1. List</button>
      <div style={{ width: '1px', background: '#e2e8f0', margin: '0 5px' }} />
      <button type="button" onClick={justifyLeft} title="Align Left" style={toolbarBtnStyle}>⬅️</button>
      <button type="button" onClick={justifyCenter} title="Align Center" style={toolbarBtnStyle}>⬌</button>
      <button type="button" onClick={justifyRight} title="Align Right" style={toolbarBtnStyle}>➡️</button>
      <div style={{ width: '1px', background: '#e2e8f0', margin: '0 5px' }} />
      <button type="button" onClick={insertLink} title="Insert Link" style={toolbarBtnStyle}>🔗 Link</button>
      <button type="button" onClick={insertImage} title="Insert Image" style={toolbarBtnStyle}>🖼️ Image</button>
    </div>
  );
};

const toolbarBtnStyle = {
  padding: '6px 12px', background: 'white', border: '1px solid #e2e8f0',
  borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500',
  transition: 'all 0.2s',
};

function KBView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEditMode = searchParams.get('edit') === 'true';
  const { accounts } = useMsal();
  const editorRef = useRef(null);
  
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [toast, setToast] = useState({ open: false, message: '', type: 'success' });

  useEffect(() => {
    const userEmail = accounts?.[0]?.username?.toLowerCase() || '';
    setIsAdmin(userEmail.includes('admin') || userEmail.includes('allen'));
  }, [accounts]);

  useEffect(() => {
    fetchArticle();
  }, [id]);

  useEffect(() => {
    if (isEditMode && editorRef.current && article) {
      editorRef.current.innerHTML = article.content;
      editorRef.current.contentEditable = 'true';
      
      const handleInput = () => {
        setEditedContent(editorRef.current.innerHTML);
      };
      editorRef.current.addEventListener('input', handleInput);
      
      return () => {
        editorRef.current?.removeEventListener('input', handleInput);
      };
    }
  }, [isEditMode, article, editorRef.current]);

  const showToast = (message, type = 'success') => {
    setToast({ open: true, message, type });
    setTimeout(() => setToast(p => ({ ...p, open: false })), 3000);
  };

  const fetchArticle = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${BACKEND}/api/kb/articles/${id}`);
      setArticle(res.data);
      setEditedContent(res.data.content);
    } catch (err) {
      console.error('Failed to fetch article:', err);
      setError('Article not found');
    } finally {
      setLoading(false);
    }
  };

  const saveArticle = async () => {
    if (!editedContent.trim()) {
      showToast('Content cannot be empty', 'error');
      return;
    }
    
    setIsSaving(true);
    try {
      await axios.put(`${BACKEND}/api/kb/articles/${id}`, {
        content: editedContent,
        updatedBy: {
          id: accounts[0]?.localAccountId || '',
          name: accounts[0]?.name || '',
          email: accounts[0]?.username || ''
        }
      });
      showToast('Article saved successfully!', 'success');
      setTimeout(() => {
        navigate(`/kb/${id}`);
      }, 1000);
    } catch (err) {
      console.error('Save error:', err);
      showToast('Failed to save article', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const sharedCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --navy: #002060; --navy2: #003090; --orange: #e98404; --white: #ffffff; --bg: #f5f7fa; --border: #e2e8f0; --text: #0f172a; --muted: #64748b; --light: #f8fafc; }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    
    .kb-view-page { min-height: 100vh; width: 100%; background: var(--bg); font-family: 'Lato', sans-serif; color: var(--text); }
    .kb-view-hero { background: var(--navy); position: relative; overflow: hidden; padding: 48px 48px 44px; }
    .kb-view-hero::after { content: ''; position: absolute; right: -60px; top: -60px; width: 420px; height: 420px; border-radius: 50%; background: radial-gradient(circle, rgba(233,132,4,0.15) 0%, transparent 70%); pointer-events: none; }
    .kb-view-hero-inner { position: relative; z-index: 2; max-width: 1200px; margin: 0 auto; animation: fadeUp 0.55s ease both; }
    .kb-view-hero-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--orange); margin-bottom: 14px; }
    .kb-view-hero-eyebrow-line { width: 28px; height: 2px; background: var(--orange); border-radius: 2px; }
    .kb-view-hero h1 { font-family: 'Sora', sans-serif; font-size: clamp(28px, 3vw, 36px); font-weight: 800; color: #ffffff; line-height: 1.15; margin-bottom: 8px; letter-spacing: -0.02em; }
    .kb-view-hero h1 em { font-style: normal; color: var(--orange); }
    .kb-view-hero-sub { font-size: 15px; color: rgba(255,255,255,0.62); font-weight: 400; line-height: 1.6; }
    .kb-view-content { max-width: 900px; margin: 0 auto; padding: 32px 48px 56px; }
    .kb-view-card { background: var(--white); border: 1.5px solid var(--border); border-radius: 24px; overflow: hidden; animation: fadeUp 0.4s ease both; }
    .kb-view-header { padding: 32px; border-bottom: 1.5px solid var(--border); }
    .kb-view-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; background: #ede9fe; color: #5b21b6; margin-bottom: 16px; }
    .kb-view-title { font-family: 'Sora', sans-serif; font-size: 28px; font-weight: 800; color: var(--navy); margin-bottom: 16px; line-height: 1.3; }
    .kb-view-meta { display: flex; gap: 24px; flex-wrap: wrap; font-size: 13px; color: var(--muted); margin-bottom: 8px; }
    .kb-view-description { font-size: 16px; color: var(--text); line-height: 1.5; padding: 24px 32px; background: var(--light); border-bottom: 1.5px solid var(--border); }
    .kb-view-body { padding: 40px; }
    .kb-view-body h1, .kb-view-body h2, .kb-view-body h3 { color: var(--navy); margin: 24px 0 12px; }
    .kb-view-body p { margin-bottom: 16px; line-height: 1.7; }
    .kb-view-body ul, .kb-view-body ol { margin: 0 0 16px 24px; }
    .kb-view-body li { margin-bottom: 6px; line-height: 1.6; }
    .kb-view-body img { max-width: 100%; height: auto; border-radius: 8px; margin: 16px 0; }
    .kb-view-body a { color: var(--navy); text-decoration: underline; }
    .kb-view-footer { padding: 24px 32px; border-top: 1.5px solid var(--border); background: var(--light); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
    .kb-actions { display: flex; gap: 12px; }
    .kb-edit-btn { padding: 10px 20px; background: var(--navy); color: white; border: none; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'Sora', sans-serif; }
    .kb-edit-btn:hover { background: var(--navy2); }
    .kb-save-btn { padding: 10px 20px; background: #10b981; color: white; border: none; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'Sora', sans-serif; }
    .kb-save-btn:hover { background: #059669; }
    .kb-cancel-btn { padding: 10px 20px; background: var(--white); border: 1.5px solid var(--border); border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'Sora', sans-serif; color: var(--text); }
    .kb-cancel-btn:hover { border-color: #ef4444; color: #ef4444; }
    .kb-back-btn { padding: 10px 20px; background: var(--white); border: 1.5px solid var(--border); border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'Sora', sans-serif; color: var(--text); }
    .kb-back-btn:hover { border-color: var(--navy); color: var(--navy); }
    .rich-editor-container { border: 1.5px solid var(--border); border-radius: 12px; overflow: hidden; margin: 20px 0; }
    .rich-editor-content { min-height: 400px; padding: 16px; background: var(--white); font-size: 14px; line-height: 1.6; outline: none; overflow-y: auto; }
    .rich-editor-content:focus { outline: none; }
    .rich-editor-content img { max-width: 100%; height: auto; }
    .kb-loading { text-align: center; padding: 80px; }
    .kb-spinner { width: 40px; height: 40px; border-radius: 50%; border: 3px solid var(--border); border-top-color: var(--navy); animation: spin 0.9s linear infinite; margin: 0 auto 16px; }
    .kb-toast { position: fixed; bottom: 32px; right: 32px; z-index: 10000; padding: 14px 24px; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); font-size: 14px; font-weight: 600; animation: slideIn 0.3s ease; font-family: 'Sora', sans-serif; }
    .kb-toast-success { background: #10b981; color: white; }
    .kb-toast-error { background: #ef4444; color: white; }
    @media (max-width: 768px) {
      .kb-view-hero { padding: 32px 24px; }
      .kb-view-content { padding: 20px; }
      .kb-view-title { font-size: 22px; }
      .kb-view-body { padding: 24px; }
    }
  `;

  if (loading) {
    return (
      <div className="kb-view-page">
        <style>{sharedCSS}</style>
        <div className="kb-loading">
          <div className="kb-spinner" />
          <div style={{ color: '#64748b' }}>Loading article...</div>
        </div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="kb-view-page">
        <style>{sharedCSS}</style>
        <div className="kb-view-hero">
          <div className="kb-view-hero-inner">
            <div className="kb-view-hero-eyebrow"><div className="kb-view-hero-eyebrow-line" />Knowledge Base</div>
            <h1>Article not <em>found</em></h1>
            <p className="kb-view-hero-sub">The article you're looking for doesn't exist or has been removed</p>
          </div>
        </div>
        <div className="kb-view-content" style={{ textAlign: 'center' }}>
          <button className="kb-back-btn" onClick={() => navigate('/kb')}>← Back to Knowledge Base</button>
        </div>
      </div>
    );
  }

  // EDIT MODE
  if (isEditMode && isAdmin) {
    return (
      <div className="kb-view-page">
        <style>{sharedCSS}</style>
        
        <div className="kb-view-hero">
          <div className="kb-view-hero-inner">
            <div className="kb-view-hero-eyebrow">
              <div className="kb-view-hero-eyebrow-line" />
              Knowledge Base
            </div>
            <h1>Edit <em>Article</em></h1>
            <p className="kb-view-hero-sub">Edit the content of your article</p>
          </div>
        </div>
        
        <div className="kb-view-content">
          <div className="kb-view-card">
            <div className="kb-view-header">
              <div className="kb-view-badge">{article.category?.name || 'General'}</div>
              <h1 className="kb-view-title">{article.title}</h1>
            </div>
            
            <div className="rich-editor-container">
              <RichTextToolbar editorRef={editorRef} />
              <div ref={editorRef} className="rich-editor-content" />
            </div>
            
            <div className="kb-view-footer">
              <button className="kb-cancel-btn" onClick={() => navigate(`/kb/${id}`)}>Cancel</button>
              <div className="kb-actions">
                <button className="kb-save-btn" onClick={saveArticle} disabled={isSaving}>
                  {isSaving ? 'Saving...' : '💾 Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {toast.open && (
          <div className={`kb-toast kb-toast-${toast.type}`}>
            {toast.type === 'success' ? '✓' : '✕'} {toast.message}
          </div>
        )}
      </div>
    );
  }

  // READ ONLY MODE (Regular view)
  return (
    <div className="kb-view-page">
      <style>{sharedCSS}</style>
      
      <div className="kb-view-hero">
        <div className="kb-view-hero-inner">
          <div className="kb-view-hero-eyebrow">
            <div className="kb-view-hero-eyebrow-line" />
            Knowledge Base
          </div>
          <h1>Read <em>Article</em></h1>
          <p className="kb-view-hero-sub">Browse through our documentation and guides</p>
        </div>
      </div>
      
      <div className="kb-view-content">
        <div className="kb-view-card">
          <div className="kb-view-header">
            <div className="kb-view-badge">{article.category?.name || 'General'}</div>
            <h1 className="kb-view-title">{article.title}</h1>
            <div className="kb-view-meta">
              <span>📅 {formatDate(article.createdAt)}</span>
              <span>👁️ {article.viewCount || 0} views</span>
              <span>✏️ By {article.createdBy?.name || article.createdBy?.email || 'Unknown'}</span>
            </div>
          </div>
          
          {article.description && (
            <div className="kb-view-description">
              {article.description}
            </div>
          )}
          
          <div className="kb-view-body" dangerouslySetInnerHTML={{ __html: article.content }} />
          
          <div className="kb-view-footer">
            <button className="kb-back-btn" onClick={() => navigate('/kb')}>← Back to all articles</button>
            {isAdmin && (
              <div className="kb-actions">
                <button className="kb-edit-btn" onClick={() => navigate(`/kb/${id}?edit=true`)}>✏️ Edit Article</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default KBView;