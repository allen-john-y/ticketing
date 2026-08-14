// Settings.js - Redesigned to match Home.js styling
import React from 'react';
import { useNavigate, Routes, Route, useLocation } from 'react-router-dom';
import AddAdmin from './AddAdmin';
import RemoveAdmin from './RemoveAdmin';
import AddField from './AddField';
import EditField from './EditField';
import RemoveField from './RemoveField';
import AddRequest from './AddRequest';
import AssignmentGroups from './AssignmentGroup';
import Departments from './Departments';
import OnboardingSettings from './OnboardingSettings';
import CreateKB from './CreateKB';
import EmployeeType from './EmployeeType'; // Import the new component
import AssetSettings from './AssetSettings';
import LicenseMapping from './LicenseMapping';

// Full settings options (admin only)
const adminSettingsOptions = [
  {
    id: 'add-admin',
    path: 'add-admin',
    title: 'Add Admin User',
    description: 'Grant admin rights to a user by adding them to the Helpdesk_Admin group.',
    icon: '👤',
    accent: '#002060',
    accentBg: 'rgba(0, 32, 96, 0.08)',
  },
  {
    id: 'remove-admin',
    path: 'remove-admin',
    title: 'Remove Admin User',
    description: 'Revoke admin rights by removing a user from the Helpdesk_Admin group.',
    icon: '👥',
    accent: '#ef4444',
    accentBg: 'rgba(239, 68, 68, 0.08)',
  },
  {
    id: 'add-field',
    path: 'add-field',
    title: 'Add Category',
    description: 'Create a new ticket category with custom fields, heads, approval flow and CC list.',
    icon: '📂',
    accent: '#10b981',
    accentBg: 'rgba(16, 185, 129, 0.08)',
  },
  {
    id: 'edit-field',
    path: 'edit-field',
    title: 'Edit Category',
    description: 'Modify an existing category — update heads, sub-categories, approval config and more.',
    icon: '✏️',
    accent: '#e98404',
    accentBg: 'rgba(233, 132, 4, 0.08)',
  },
  {
    id: 'remove-field',
    path: 'remove-field',
    title: 'Remove Category',
    description: 'Permanently delete a category. This may impact existing tickets in that category.',
    icon: '🗑️',
    accent: '#ec4899',
    accentBg: 'rgba(236, 72, 153, 0.08)',
  },
  {
    id: 'add-request',
    path: 'add-request',
    title: 'Add Request Service',
    description: 'Create and configure a new service request type for the catalog.',
    icon: '📋',
    accent: '#6366f1',
    accentBg: 'rgba(99, 102, 241, 0.08)',
  },
  {
    id: 'assignment-groups',
    path: 'assignment-groups',
    title: 'Assignment Groups',
    description: 'Create and manage assignment groups for ticket routing. Add members and configure group settings.',
    icon: '👔',
    accent: '#8b5cf6',
    accentBg: 'rgba(139, 92, 246, 0.08)',
  },
  {
    id: 'departments',
    path: 'departments',
    title: 'Departments',
    description: 'Manage departments and department-related configuration for the helpdesk system.',
    icon: '🏢',
    accent: '#0f766e',
    accentBg: 'rgba(15, 118, 110, 0.08)',
  },
  {
    id: 'employee-type',
    path: 'employee-type',
    title: 'Employee Type',
    description: 'Configure employee types and classifications for your organization, including categories and permissions.',
    icon: '💼',
    accent: '#059669',
    accentBg: 'rgba(5, 150, 105, 0.08)',
  },
  {
    id: 'onboarding-settings',
    path: 'onboarding-settings',
    title: 'Onboarding settings',
    description: 'Configure onboarding-related settings and department options for new employee requests.',
    icon: '📝',
    accent: '#2563eb',
    accentBg: 'rgba(37, 99, 235, 0.08)',
  },
  {
    id: 'offboarding-settings',
    path: 'offboarding-settings',
    title: 'Offboarding settings',
    description: 'Configure offboarding-related settings and department options for employee departure processes.',
    icon: '📝',
    accent: '#2563eb',
    accentBg: 'rgba(37, 99, 235, 0.08)',
  },
  {
    id: 'hr-request-settings',
    path: 'hr-request-settings',
    title: 'Hr Request Settings',
    description: 'Manage HR request settings and related configuration for employee request workflows.',
    icon: '📋',
    accent: '#7c3aed',
    accentBg: 'rgba(124, 58, 237, 0.08)',
  },
  {
    id: 'asset-registry-settings',
    path: 'asset-registry',
    title: 'Asset Settings',
    description: 'Configure asset registry settings and related asset management options.',
    icon: '🧰',
    accent: '#0ea5e9',
    accentBg: 'rgba(14, 165, 233, 0.08)',
  },
  ,
  {
    id: 'license-mapping',
    path: 'license-mapping',
    title: 'License Mapping',
    description: 'Link each Microsoft 365 license to the security group that grants it, so License Registry can manage assignments.',
    icon: '🔗',
    accent: '#0891b2',
    accentBg: 'rgba(8, 145, 178, 0.08)',
  },
  {
    id: 'create-kb',
    path: 'create-kb',
    title: 'Knowledge Base Articles',
    description: 'Create, edit, and manage knowledge base articles for your team. Write documentation with rich text editor.',
    icon: '📚',
    accent: '#8b5cf6',
    accentBg: 'rgba(139, 92, 246, 0.08)',
  }
];

// KB only options (for non-admin users)
const kbOnlySettingsOptions = [
  {
    id: 'create-kb',
    path: 'create-kb',
    title: 'Knowledge Base Articles',
    description: 'Create, edit, and manage knowledge base articles for your team. Write documentation with rich text editor.',
    icon: '📚',
    accent: '#8b5cf6',
    accentBg: 'rgba(139, 92, 246, 0.08)',
  }
];

// Main settings landing page
function SettingsLanding({ navigate, isAdmin }) {
  // Choose which settings to show based on user role
  const settingsOptions = isAdmin ? adminSettingsOptions : kbOnlySettingsOptions;

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

    .set-page {
      min-height: 100vh;
      width: 100%;
      background: var(--bg);
      font-family: 'Lato', sans-serif;
      color: var(--text);
    }

    /* Hero Section */
    .set-hero {
      background: var(--navy);
      position: relative;
      overflow: hidden;
      padding: 48px 48px 44px;
    }
    .set-hero::after {
      content: '';
      position: absolute;
      right: -60px; top: -60px;
      width: 420px; height: 420px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(233,132,4,0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .set-hero-inner {
      position: relative; z-index: 2;
      max-width: 1320px; margin: 0 auto;
      animation: fadeUp 0.55s ease both;
    }
    .set-hero-eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--orange);
      margin-bottom: 14px;
    }
    .set-hero-eyebrow-line {
      width: 28px; height: 2px; background: var(--orange); border-radius: 2px;
    }
    .set-hero h1 {
      font-family: 'Sora', sans-serif;
      font-size: clamp(28px, 3vw, 36px);
      font-weight: 800;
      color: #ffffff;
      line-height: 1.15;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .set-hero h1 em {
      font-style: normal;
      color: var(--orange);
    }
    .set-hero-sub {
      font-size: 15px; color: rgba(255,255,255,0.62);
      font-weight: 400; line-height: 1.6;
    }

    /* Content Area */
    .set-content {
      max-width: 1320px;
      margin: 0 auto;
      padding: 32px 48px 56px;
    }

    .set-back-btn {
      background: none; border: none;
      font-size: 14px; font-weight: 600;
      color: var(--navy); cursor: pointer;
      padding: 0; margin-bottom: 32px; display: inline-flex;
      align-items: center; gap: 6px;
      font-family: 'Sora', sans-serif;
    }
    .set-back-btn:hover { color: var(--orange); }

    /* Section Label */
    .set-section-label {
      font-family: 'Sora', sans-serif;
      font-size: 11px; font-weight: 700;
      letter-spacing: 0.1em; text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 24px;
      display: flex; align-items: center; gap: 10px;
    }
    .set-section-label::after {
      content: '';
      flex: 1; height: 1px; background: var(--border);
    }

    /* Settings Grid */
    .set-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 22px;
      animation: fadeUp 0.5s 0.1s ease both;
    }

    /* Settings Card */
    .set-card {
      background: var(--white);
      border: 1.5px solid var(--border);
      border-radius: 18px;
      padding: 32px 28px;
      cursor: pointer;
      transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
      display: flex; flex-direction: column;
      position: relative; overflow: hidden;
    }
    .set-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      border-radius: 18px 18px 0 0;
      transition: opacity 0.22s;
      opacity: 0;
    }
    .set-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 16px 40px rgba(0,32,96,0.1);
      border-color: #c8d4e4;
    }
    .set-card:hover::before { opacity: 1; }

    .set-card-icon {
      width: 56px; height: 56px; border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
      font-size: 28px;
      margin-bottom: 22px;
    }

    .set-card-title {
      font-family: 'Sora', sans-serif;
      font-size: 18px; font-weight: 700;
      color: var(--navy);
      margin-bottom: 10px;
    }

    .set-card-desc {
      font-size: 13.5px; color: var(--muted);
      line-height: 1.6; font-weight: 400;
      flex: 1;
      margin-bottom: 20px;
    }

    .set-card-arrow {
      display: flex; align-items: center; gap: 6px;
      font-size: 12.5px; font-weight: 700; letter-spacing: 0.04em;
      opacity: 0;
      transition: opacity 0.18s;
    }
    .set-card:hover .set-card-arrow { opacity: 1; }

    /* Non-admin message banner */
    .non-admin-info {
      background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
      border-left: 4px solid #8b5cf6;
      border-radius: 12px;
      padding: 16px 24px;
      margin-bottom: 32px;
      display: flex;
      align-items: center;
      gap: 12px;
      animation: fadeUp 0.4s ease both;
    }
    .non-admin-info-icon {
      font-size: 24px;
    }
    .non-admin-info-text {
      font-size: 14px;
      color: #1e1b4b;
      font-weight: 500;
    }
    .non-admin-info-text strong {
      color: #8b5cf6;
    }

    @media (max-width: 768px) {
      .set-hero { padding: 40px 24px; }
      .set-content { padding: 24px 20px 40px; }
      .set-grid { grid-template-columns: 1fr; }
    }
  `;

  return (
    <>
      <style>{sharedCSS}</style>

      {/* Hero Section */}
      <div className="set-hero">
        <div className="set-hero-inner">
          <div className="set-hero-eyebrow">
            <div className="set-hero-eyebrow-line" />
            {isAdmin ? 'System Configuration' : 'Knowledge Management'}
          </div>
          <h1>{isAdmin ? 'Admin Settings' : 'Knowledge <em>Base</em>'}</h1>
          <p className="set-hero-sub">
            {isAdmin 
              ? 'Manage users, categories, groups, knowledge base, and system configuration'
              : 'Create and manage knowledge base articles to help your team'}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="set-content">
        <button className="set-back-btn" onClick={() => navigate('/')}>
          ← Back to Dashboard
        </button>

        {/* Show info banner for non-admin users */}
        {!isAdmin && (
          <div className="non-admin-info">
            <div className="non-admin-info-icon">ℹ️</div>
            <div className="non-admin-info-text">
              You have <strong>read/write access</strong> to Knowledge Base articles. 
              Contact your administrator for full settings access.
            </div>
          </div>
        )}

        <div className="set-section-label">
          {isAdmin ? 'Available Settings' : 'Knowledge Base Tools'}
        </div>

        {/* Settings Grid */}
        <div className="set-grid">
          {settingsOptions.map((opt) => (
            <div
              key={opt.id}
              className="set-card"
              onClick={() => navigate(`/settings/${opt.path}`)}
              style={{ '--card-accent': opt.accent }}
            >
              <style>{`
                .set-card[style*="--card-accent"]::before {
                  background: linear-gradient(90deg, ${opt.accent}, ${opt.accent}dd);
                }
              `}</style>

              <div className="set-card-icon" style={{ background: opt.accentBg }}>
                <span style={{ fontSize: '28px' }}>{opt.icon}</span>
              </div>

              <div className="set-card-title">{opt.title}</div>
              <div className="set-card-desc">{opt.description}</div>

              <div className="set-card-arrow" style={{ color: opt.accent }}>
                {isAdmin ? 'Configure' : 'Manage'}
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default function Settings({ isAdmin = false }) {
  const navigate = useNavigate();
  const location = useLocation();

  const pageStyle = {
    minHeight: '100vh',
    background: '#f5f7fa',
    fontFamily: "'Lato', sans-serif",
  };

  return (
    <div style={pageStyle}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Lato:wght@300;400;700&display=swap');
      `}</style>

      <Routes>
        {/* Pass isAdmin to the landing page */}
        <Route index element={<SettingsLanding navigate={navigate} isAdmin={isAdmin} />} />
        
        {/* Always allow KB routes for all users */}
        <Route path="create-kb" element={<CreateKB />} />
        
        {/* Admin-only routes - these won't be accessible to non-admins via UI, but adding protection */}
        {isAdmin && (
          <>
            <Route path="add-admin" element={<AddAdmin />} />
            <Route path="remove-admin" element={<RemoveAdmin />} />
            <Route path="add-field" element={<AddField />} />
            <Route path="edit-field" element={<EditField />} />
            <Route path="remove-field" element={<RemoveField />} />
            <Route path="add-request" element={<AddRequest />} />
            <Route path="assignment-groups" element={<AssignmentGroups />} />
            <Route path="departments" element={<Departments />} />
            <Route path="employee-type" element={<EmployeeType />} />
            <Route path="onboarding-settings" element={<OnboardingSettings />} />
            <Route path="asset-registry" element={<AssetSettings />} />
            <Route path="license-mapping" element={<LicenseMapping />} />
          </>
        )}
        
        {/* Optional: Add a catch-all route for non-admins trying to access admin routes */}
        {!isAdmin && (
          <>
            <Route path="add-admin" element={<AccessDenied />} />
            <Route path="remove-admin" element={<AccessDenied />} />
            <Route path="add-field" element={<AccessDenied />} />
            <Route path="edit-field" element={<AccessDenied />} />
            <Route path="remove-field" element={<AccessDenied />} />
            <Route path="add-request" element={<AccessDenied />} />
            <Route path="assignment-groups" element={<AccessDenied />} />
            <Route path="departments" element={<AccessDenied />} />
            <Route path="employee-type" element={<AccessDenied />} />
            <Route path="onboarding-settings" element={<AccessDenied />} />
            <Route path="asset-registry" element={<AccessDenied />} />
            <Route path="license-mapping" element={<AccessDenied />} />
          </>
        )}
      </Routes>
    </div>
  );
}

// Access denied component for non-admins who try to access admin routes
function AccessDenied() {
  const navigate = useNavigate();
  
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      textAlign: 'center',
      padding: '2rem'
    }}>
      <div style={{
        fontSize: '64px',
        marginBottom: '24px'
      }}>🔒</div>
      <h2 style={{
        fontSize: '24px',
        fontWeight: '700',
        color: '#002060',
        marginBottom: '12px'
      }}>Access Denied</h2>
      <p style={{
        color: '#64748b',
        marginBottom: '24px',
        maxWidth: '400px'
      }}>
        You don't have permission to access this page. This feature is only available to administrators.
      </p>
      <button
        onClick={() => navigate('/settings')}
        style={{
          background: '#e98404',
          color: 'white',
          border: 'none',
          padding: '10px 24px',
          borderRadius: '10px',
          cursor: 'pointer',
          fontWeight: '600',
          fontFamily: 'inherit'
        }}
      >
        Return to Settings
      </button>
    </div>
  );
}