import React from 'react';
import { useNavigate, Routes, Route, useLocation } from 'react-router-dom';
import AddAdmin from './AddAdmin';
import RemoveAdmin from './RemoveAdmin';
import AddField from './AddField';
import EditField from './EditField';
import RemoveField from './RemoveField';

// Image icons
import addUserIcon from './add-user.jpg';
import removeUserIcon from './remove-user.jpg';
import addFieldIcon from './add-field.jpg';
import editFieldIcon from './edit-field.jpg';
import removeFieldIcon from './remove-field.jpg';

const settingsOptions = [
  {
    id: 'add-admin',
    path: 'add-admin',
    title: 'Add Admin User',
    description: 'Grant admin rights to a user by adding them to the Helpdesk_Admin group.',
    iconSrc: addUserIcon,
    accent: '#3b82f6',
    accentBg: 'rgba(59, 130, 246, 0.1)',
  },
  {
    id: 'remove-admin',
    path: 'remove-admin',
    title: 'Remove Admin User',
    description: 'Revoke admin rights by removing a user from the Helpdesk_Admin group.',
    iconSrc: removeUserIcon,
    accent: '#ef4444',
    accentBg: 'rgba(239, 68, 68, 0.1)',
  },
  {
    id: 'add-field',
    path: 'add-field',
    title: 'Add Category',
    description: 'Create a new ticket category with custom fields, heads, approval flow and CC list.',
    iconSrc: addFieldIcon,
    accent: '#10b981',
    accentBg: 'rgba(16, 185, 129, 0.1)',
  },
  {
    id: 'edit-field',
    path: 'edit-field',
    title: 'Edit Category',
    description: 'Modify an existing category — update heads, sub-categories, approval config and more.',
    iconSrc: editFieldIcon,
    accent: '#f59e0b',
    accentBg: 'rgba(245, 158, 11, 0.1)',
  },
  {
    id: 'remove-field',
    path: 'remove-field',
    title: 'Remove Category',
    description: 'Permanently delete a category. This may impact existing tickets in that category.',
    iconSrc: removeFieldIcon,
    accent: '#ec4899',
    accentBg: 'rgba(236, 72, 153, 0.1)',
  },
];

// Main settings landing page
function SettingsLanding({ navigate }) {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        /* ── Header ── */
        .settings-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1.5rem;
          margin-bottom: 2.5rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          flex-wrap: wrap;
        }

        .settings-header-left h1 {
          font-size: 28px;
          font-weight: 700;
          color: #f3f4f6;
          letter-spacing: -0.02em;
          margin-bottom: 4px;
        }

        .settings-header-left p {
          font-size: 13px;
          color: #9ca3af;
          font-weight: 500;
        }

        .settings-back-btn {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #d1d5db;
          padding: 9px 16px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: 'Inter', sans-serif;
          flex-shrink: 0;
        }

        .settings-back-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #f3f4f6;
          transform: translateY(-1px);
        }

        /* ── Grid ── */
        .settings-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        /* ── Cards ── */
        .settings-card {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 1.5rem;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          flex-direction: column;
          gap: 12px;
          backdrop-filter: blur(10px);
        }

        .settings-card:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.2);
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        }

        .settings-card-icon {
          width: 48px;
          height: 48px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          overflow: hidden;
        }

        .settings-card-icon img {
          width: 32px;
          height: 32px;
          object-fit: cover;
          border-radius: 6px;
          display: block;
        }

        .settings-card-content h3 {
          font-size: 15px;
          font-weight: 700;
          color: #f3f4f6;
          margin-bottom: 4px;
          letter-spacing: -0.01em;
        }

        .settings-card-content p {
          font-size: 12px;
          color: #d1d5db;
          line-height: 1.6;
        }

        .settings-card-cta {
          margin-top: auto;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          transition: gap 0.2s;
        }

        .settings-card:hover .settings-card-cta {
          gap: 10px;
        }

        /* ── Responsive ── */
        @media (max-width: 768px) {
          .settings-grid {
            grid-template-columns: 1fr;
          }
          
          .settings-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .settings-header-left h1 {
            font-size: 24px;
          }
        }

        @media (max-width: 640px) {
          .settings-header {
            padding-bottom: 1rem;
            gap: 1rem;
            margin-bottom: 1.5rem;
          }

          .settings-header-left h1 {
            font-size: 20px;
          }

          .settings-grid {
            gap: 1rem;
          }

          .settings-card {
            padding: 1.25rem;
          }
        }
      `}</style>

      {/* Header */}
      <div className="settings-header">
        <div className="settings-header-left">
          <h1>⚙️ Admin Settings</h1>
          <p>Manage users, categories, and system configuration</p>
        </div>
        <button className="settings-back-btn" onClick={() => navigate('/')}>
          ← Back
        </button>
      </div>

      {/* Settings Grid */}
      <div className="settings-grid">
        {settingsOptions.map((opt) => (
          <div
            key={opt.id}
            className="settings-card"
            onClick={() => navigate(`/settings/${opt.path}`)}
          >
            <div className="settings-card-icon" style={{ background: opt.accentBg }}>
              <img src={opt.iconSrc} alt={opt.title} />
            </div>

            <div className="settings-card-content">
              <h3>{opt.title}</h3>
              <p>{opt.description}</p>
            </div>

            <div className="settings-card-cta" style={{ color: opt.accent }}>
              Open <span>→</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();

  console.log('Settings rendered, pathname:', location.pathname);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1a1f35 100%)',
        fontFamily: "'Inter', sans-serif",
        padding: '2rem',
        color: '#f3f4f6',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
      `}</style>

      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <Routes>
          <Route index element={<SettingsLanding navigate={navigate} />} />

          <Route path="add-admin" element={<AddAdmin />} />
          <Route path="remove-admin" element={<RemoveAdmin />} />
          <Route path="add-field" element={<AddField />} />
          <Route path="edit-field" element={<EditField />} />
          <Route path="remove-field" element={<RemoveField />} />
        </Routes>
      </div>
    </div>
  );
}