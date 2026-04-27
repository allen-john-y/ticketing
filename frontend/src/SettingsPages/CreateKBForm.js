// src/SettingsPages/CreateKBForm.js - Create new article form with rich text editor
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import axios from 'axios';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

// Professional Rich Text Editor Toolbar
function RichTextToolbar({ editorRef }) {
  const execCommand = (command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
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
  const justifyFull = () => execCommand('justifyFull');

  const setFormat = (format) => {
    document.execCommand('formatBlock', false, format);
    editorRef.current?.focus();
  };

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '4px',
      padding: '8px 12px',
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderBottom: 'none',
      borderRadius: '12px 12px 0 0',
    }}>
      {/* Format Dropdown */}
      <select
        onChange={(e) => setFormat(e.target.value)}
        style={selectStyle}
        defaultValue="p"
      >
        <option value="p">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
        <option value="h4">Heading 4</option>
        <option value="pre">Preformatted</option>
      </select>

      <div style={dividerStyle} />

      {/* Text Formatting */}
      <button type="button" onClick={() => execCommand('bold')} title="Bold" style={toolbarBtnStyle}>
        <b>B</b>
      </button>
      <button type="button" onClick={() => execCommand('italic')} title="Italic" style={toolbarBtnStyle}>
        <i>I</i>
      </button>
      <button type="button" onClick={() => execCommand('underline')} title="Underline" style={toolbarBtnStyle}>
        <u>U</u>
      </button>
      <button type="button" onClick={() => execCommand('strikeThrough')} title="Strikethrough" style={toolbarBtnStyle}>
        <s>S</s>
      </button>

      <div style={dividerStyle} />

      {/* Text Color */}
      <input
        type="color"
        title="Text Color"
        onChange={(e) => execCommand('foreColor', e.target.value)}
        style={colorPickerStyle}
        value="#000000"
      />
      <input
        type="color"
        title="Background Color"
        onChange={(e) => execCommand('backColor', e.target.value)}
        style={colorPickerStyle}
        value="#ffff00"
      />

      <div style={dividerStyle} />

      {/* Lists */}
      <button type="button" onClick={insertUnorderedList} title="Bullet List" style={toolbarBtnStyle}>
        • List
      </button>
      <button type="button" onClick={insertOrderedList} title="Numbered List" style={toolbarBtnStyle}>
        1. List
      </button>

      <div style={dividerStyle} />

      {/* Alignment */}
      <button type="button" onClick={justifyLeft} title="Align Left" style={toolbarBtnStyle}>
        ⬅️
      </button>
      <button type="button" onClick={justifyCenter} title="Align Center" style={toolbarBtnStyle}>
        ⬌
      </button>
      <button type="button" onClick={justifyRight} title="Align Right" style={toolbarBtnStyle}>
        ➡️
      </button>
      <button type="button" onClick={justifyFull} title="Justify" style={toolbarBtnStyle}>
        ☰
      </button>

      <div style={dividerStyle} />

      {/* Insert */}
      <button type="button" onClick={insertLink} title="Insert Link" style={toolbarBtnStyle}>
        🔗 Link
      </button>
      <button type="button" onClick={insertImage} title="Insert Image" style={toolbarBtnStyle}>
        🖼️ Image
      </button>

      <div style={dividerStyle} />

      {/* Undo/Redo */}
      <button type="button" onClick={() => execCommand('undo')} title="Undo" style={toolbarBtnStyle}>
        ↩️
      </button>
      <button type="button" onClick={() => execCommand('redo')} title="Redo" style={toolbarBtnStyle}>
        ↪️
      </button>

      <div style={dividerStyle} />

      {/* Remove Format */}
      <button type="button" onClick={() => execCommand('removeFormat')} title="Remove Format" style={toolbarBtnStyle}>
        ✕ Clear
      </button>
    </div>
  );
}

const toolbarBtnStyle = {
  padding: '6px 12px',
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: '500',
  transition: 'all 0.2s',
  fontFamily: "'DM Sans', sans-serif",
};

const selectStyle = {
  padding: '6px 12px',
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '13px',
  fontFamily: "'DM Sans', sans-serif",
};

const colorPickerStyle = {
  width: '32px',
  height: '32px',
  padding: '4px',
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  cursor: 'pointer',
  background: '#ffffff',
};

const dividerStyle = {
  width: '1px',
  height: '28px',
  background: '#e2e8f0',
  margin: '0 4px',
};

function CreateKBForm() {
  const { accounts } = useMsal();
  const navigate = useNavigate();
  const location = useLocation();
  const editorRef = useRef(null);
  
  const editArticle = location.state?.editArticle;
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [categories, setCategories] = useState([]);
  const [assignmentGroups, setAssignmentGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [articleId, setArticleId] = useState(null);
  const [toast, setToast] = useState({ open: false, message: '', type: 'success' });
  const [wordCount, setWordCount] = useState(0);

  // Fetch categories and assignment groups
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [categoriesRes, groupsRes] = await Promise.all([
          axios.get(`${BACKEND}/api/categories`),
          axios.get(`${BACKEND}/api/assignment-groups`)
        ]);
        setCategories(categoriesRes.data || []);
        setAssignmentGroups(groupsRes.data || []);
      } catch (err) {
        console.error('Failed to fetch data:', err);
        showToast('Failed to load categories or groups', 'error');
      }
    };
    fetchData();
  }, []);

  // Handle edit mode - populate form with article data
  useEffect(() => {
    if (editArticle) {
      setIsEditMode(true);
      setArticleId(editArticle._id);
      setTitle(editArticle.title || '');
      setDescription(editArticle.description || '');
      setContent(editArticle.content || '');
      setSelectedCategory(editArticle.category || null);
      setSelectedGroup(editArticle.assignmentGroup || null);
    }
  }, [editArticle]);

  // Initialize rich text editor
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.contentEditable = 'true';
      
      // Set initial content for edit mode
      if (isEditMode && content) {
        editorRef.current.innerHTML = content;
      } else {
        editorRef.current.innerHTML = '';
      }
      
      // Update word count on input
      const updateWordCount = () => {
        const text = editorRef.current.innerText || '';
        const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
        setWordCount(words);
        setContent(editorRef.current.innerHTML);
      };
      
      editorRef.current.addEventListener('input', updateWordCount);
      updateWordCount();
      
      return () => {
        editorRef.current?.removeEventListener('input', updateWordCount);
      };
    }
  }, [isEditMode]);

  const showToast = (message, type = 'success') => {
    setToast({ open: true, message, type });
    setTimeout(() => setToast(p => ({ ...p, open: false })), 3000);
  };

  const saveArticle = async (status) => {
    if (!title.trim()) {
      showToast('Please enter an article title', 'error');
      return;
    }
    
    const articleContent = editorRef.current?.innerHTML || '';
    if (!articleContent || articleContent === '<br>' || articleContent === '<div><br></div>') {
      showToast('Please add some content to the article', 'error');
      return;
    }
    
    if (!selectedCategory) {
      showToast('Please select a category', 'error');
      return;
    }
    
    if (!selectedGroup) {
      showToast('Please select an assignment group', 'error');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        content: articleContent,
        category: {
          id: selectedCategory.id || selectedCategory._id,
          name: selectedCategory.categoryName || selectedCategory.name
        },
        assignmentGroup: {
          groupId: selectedGroup._id,
          groupName: selectedGroup.name
        },
        status: status,
        createdBy: {
          id: accounts[0]?.localAccountId || '',
          name: accounts[0]?.name || '',
          email: accounts[0]?.username || ''
        },
        updatedBy: {
          id: accounts[0]?.localAccountId || '',
          name: accounts[0]?.name || '',
          email: accounts[0]?.username || ''
        },
        tags: []
      };

      let url = `${BACKEND}/api/kb/articles`;
      let method = 'post';
      
      if (isEditMode && articleId) {
        url = `${BACKEND}/api/kb/articles/${articleId}`;
        method = 'put';
      }
      
      await axios({ method, url, data: payload });
      showToast(`Article ${status === 'published' ? 'published' : 'saved as draft'} successfully!`, 'success');
      
      setTimeout(() => {
        navigate('/settings/create-kb');
      }, 1500);
    } catch (err) {
      console.error('Save error:', err);
      showToast(err?.response?.data?.message || 'Failed to save article', 'error');
    } finally {
      setLoading(false);
    }
  };

  const sharedCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --navy: #002060; --navy2: #003090; --orange: #e98404; --white: #ffffff; --bg: #f5f7fa; --border: #e2e8f0; --text: #0f172a; --muted: #64748b; --light: #f8fafc; }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    
    .kb-form-page { min-height: 100vh; width: 100%; background: var(--bg); font-family: 'Lato', sans-serif; color: var(--text); }
    .kb-form-hero { background: var(--navy); position: relative; overflow: hidden; padding: 48px 48px 44px; }
    .kb-form-hero::after { content: ''; position: absolute; right: -60px; top: -60px; width: 420px; height: 420px; border-radius: 50%; background: radial-gradient(circle, rgba(233,132,4,0.15) 0%, transparent 70%); pointer-events: none; }
    .kb-form-hero-inner { position: relative; z-index: 2; max-width: 1200px; margin: 0 auto; animation: fadeUp 0.55s ease both; }
    .kb-form-hero-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--orange); margin-bottom: 14px; }
    .kb-form-hero-eyebrow-line { width: 28px; height: 2px; background: var(--orange); border-radius: 2px; }
    .kb-form-hero h1 { font-family: 'Sora', sans-serif; font-size: clamp(28px, 3vw, 36px); font-weight: 800; color: #ffffff; line-height: 1.15; margin-bottom: 8px; letter-spacing: -0.02em; }
    .kb-form-hero h1 em { font-style: normal; color: var(--orange); }
    .kb-form-hero-sub { font-size: 15px; color: rgba(255,255,255,0.62); font-weight: 400; line-height: 1.6; }
    .kb-form-content { max-width: 1200px; margin: 0 auto; padding: 32px 48px 56px; }
    .kb-form-card { background: var(--white); border: 1.5px solid var(--border); border-radius: 24px; overflow: hidden; animation: fadeUp 0.4s ease both; }
    .kb-form-header { padding: 28px 32px; border-bottom: 1.5px solid var(--border); background: var(--light); }
    .kb-form-header h2 { font-family: 'Sora', sans-serif; font-size: 20px; font-weight: 700; color: var(--navy); margin-bottom: 4px; }
    .kb-form-header p { font-size: 14px; color: var(--muted); }
    .kb-form-body { padding: 32px; }
    .kb-form-group { margin-bottom: 28px; }
    .kb-label { display: block; font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; color: var(--navy); margin-bottom: 10px; letter-spacing: 0.02em; }
    .kb-label .required { color: #ef4444; margin-left: 4px; }
    .kb-input, .kb-textarea { width: 100%; padding: 12px 16px; border: 1.5px solid var(--border); border-radius: 12px; font-size: 14px; background: var(--white); color: var(--text); font-family: 'Lato', sans-serif; transition: all 0.2s; }
    .kb-input:focus, .kb-textarea:focus { outline: none; border-color: var(--navy); box-shadow: 0 0 0 3px rgba(0,32,96,0.08); }
    .kb-textarea { resize: vertical; min-height: 80px; }
    .kb-select { width: 100%; padding: 12px 16px; border: 1.5px solid var(--border); border-radius: 12px; font-size: 14px; background: var(--white); color: var(--text); font-family: 'Lato', sans-serif; cursor: pointer; }
    .kb-select:focus { outline: none; border-color: var(--navy); }
    .kb-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .rich-editor-container { border: 1.5px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--white); }
    .rich-editor-content { min-height: 400px; padding: 16px; background: var(--white); font-size: 14px; line-height: 1.6; outline: none; overflow-y: auto; }
    .rich-editor-content:focus { outline: none; }
    .rich-editor-content img { max-width: 100%; height: auto; }
    .rich-editor-content h1, .rich-editor-content h2, .rich-editor-content h3 { margin: 16px 0 8px; }
    .rich-editor-content p { margin-bottom: 12px; }
    .rich-editor-content ul, .rich-editor-content ol { margin: 8px 0 12px 24px; }
    .kb-actions { display: flex; justify-content: flex-end; gap: 16px; margin-top: 32px; padding-top: 24px; border-top: 1.5px solid var(--border); }
    .kb-btn { padding: 12px 28px; border-radius: 12px; font-size: 14px; font-weight: 700; font-family: 'Sora', sans-serif; cursor: pointer; transition: all 0.2s; border: none; }
    .kb-btn-draft { background: var(--white); border: 1.5px solid var(--border); color: var(--muted); }
    .kb-btn-draft:hover { border-color: var(--navy); color: var(--navy); }
    .kb-btn-publish { background: var(--navy); color: white; box-shadow: 0 4px 12px rgba(0,32,96,0.2); }
    .kb-btn-publish:hover:not(:disabled) { background: var(--navy2); transform: translateY(-2px); }
    .kb-btn-cancel { background: var(--white); border: 1.5px solid var(--border); color: var(--muted); }
    .kb-btn-cancel:hover { border-color: #ef4444; color: #ef4444; }
    .kb-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    
    /* Word Count Footer */
    .editor-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 16px;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #64748b;
    }
    .auto-save {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .kb-toast { position: fixed; bottom: 32px; right: 32px; z-index: 10000; padding: 14px 24px; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); font-size: 14px; font-weight: 600; animation: slideIn 0.3s ease; font-family: 'Sora', sans-serif; }
    .kb-toast-success { background: #10b981; color: white; }
    .kb-toast-error { background: #ef4444; color: white; }
    .kb-back-btn { background: none; border: none; font-size: 14px; font-weight: 600; color: var(--navy); cursor: pointer; margin-bottom: 20px; display: inline-flex; align-items: center; gap: 6px; font-family: 'Sora', sans-serif; }
    .kb-back-btn:hover { color: var(--orange); }
    @media (max-width: 768px) {
      .kb-form-hero { padding: 32px 24px; }
      .kb-form-content { padding: 20px; }
      .kb-row { grid-template-columns: 1fr; }
      .kb-actions { flex-wrap: wrap; }
      .kb-btn { flex: 1; text-align: center; }
    }
  `;

  return (
    <div className="kb-form-page">
      <style>{sharedCSS}</style>
      
      <div className="kb-form-hero">
        <div className="kb-form-hero-inner">
          <div className="kb-form-hero-eyebrow">
            <div className="kb-form-hero-eyebrow-line" />
            Knowledge Base
          </div>
          <h1>{isEditMode ? 'Edit' : 'Create'} <em>Article</em></h1>
          <p className="kb-form-hero-sub">Write and publish helpful documentation for your team</p>
        </div>
      </div>
      
      <div className="kb-form-content">
        <button className="kb-back-btn" onClick={() => navigate('/settings/create-kb')}>
          ← Back to Articles List
        </button>
        
        <div className="kb-form-card">
          <div className="kb-form-header">
            <h2>{isEditMode ? 'Edit Knowledge Article' : 'Create New Knowledge Article'}</h2>
            <p>Fill in the details below to {isEditMode ? 'update the' : 'create a new'} knowledge base article</p>
          </div>
          
          <div className="kb-form-body">
            {/* Article Title */}
            <div className="kb-form-group">
              <label className="kb-label">Article Title <span className="required">*</span></label>
              <input
                className="kb-input"
                type="text"
                placeholder="e.g., How to Reset Password in Azure AD"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            
            {/* Category and Assignment Group */}
            <div className="kb-row">
              <div className="kb-form-group">
                <label className="kb-label">Category <span className="required">*</span></label>
                <select
                  className="kb-select"
                  value={selectedCategory?._id || selectedCategory?.id || ''}
                  onChange={(e) => {
                    const cat = categories.find(c => (c._id || c.id) === e.target.value);
                    setSelectedCategory(cat || null);
                  }}
                >
                  <option value="">Select a category...</option>
                  {categories.map(cat => (
                    <option key={cat._id || cat.id} value={cat._id || cat.id}>
                      {cat.categoryName || cat.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="kb-form-group">
                <label className="kb-label">Assignment Group <span className="required">*</span></label>
                <select
                  className="kb-select"
                  value={selectedGroup?._id || ''}
                  onChange={(e) => {
                    const group = assignmentGroups.find(g => g._id === e.target.value);
                    setSelectedGroup(group || null);
                  }}
                >
                  <option value="">Select an assignment group...</option>
                  {assignmentGroups.map(group => (
                    <option key={group._id} value={group._id}>{group.name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Short Description */}
            <div className="kb-form-group">
              <label className="kb-label">Short Description</label>
              <textarea
                className="kb-textarea"
                placeholder="Brief summary of the article (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            
            {/* Rich Text Content Editor */}
            <div className="kb-form-group">
              <label className="kb-label">Content <span className="required">*</span></label>
              <div className="rich-editor-container">
                <RichTextToolbar editorRef={editorRef} />
                <div
                  ref={editorRef}
                  className="rich-editor-content"
                  contentEditable="true"
                />
                <div className="editor-footer">
                  <div className="auto-save">
                    <span>📝</span>
                    <span>Draft auto-saves in your browser</span>
                  </div>
                  <div>Word count: {wordCount}</div>
                </div>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
                💡 Tip: Use the toolbar to format text, add lists, links, and images
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="kb-actions">
              <button className="kb-btn kb-btn-cancel" onClick={() => navigate('/settings/create-kb')}>
                Cancel
              </button>
              <button
                className="kb-btn kb-btn-draft"
                onClick={() => saveArticle('draft')}
                disabled={loading}
              >
                {loading ? 'Saving...' : '💾 Save as Draft'}
              </button>
              <button
                className="kb-btn kb-btn-publish"
                onClick={() => saveArticle('published')}
                disabled={loading}
              >
                {loading ? 'Publishing...' : '📢 Publish'}
              </button>
            </div>
            
            <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', marginTop: '16px' }}>
              {loading ? 'Processing...' : 'Drafts are only visible to admins. Published articles are visible to all users.'}
            </div>
          </div>
        </div>
      </div>
      
      {/* Toast Notification */}
      {toast.open && (
        <div className={`kb-toast kb-toast-${toast.type}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}
    </div>
  );
}

export default CreateKBForm;    