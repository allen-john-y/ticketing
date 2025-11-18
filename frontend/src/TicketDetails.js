import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useMsal } from '@azure/msal-react';

function TicketDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { accounts, instance } = useMsal();
  const [ticket, setTicket] = useState(null);
  const [authority, setAuthority] = useState('basic');
  const [loading, setLoading] = useState(false);

  // modal state
  const [modal, setModal] = useState({ open: false, action: null });

  const backendBase = "https://ticketing-production-5334.up.railway.app";

  useEffect(() => {
    const fetchAuthority = async () => {
      if (!accounts[0]) return;
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: ['User.Read', 'GroupMember.Read.All'],
          account: accounts[0]
        });

        const groupsRes = await axios.get('https://graph.microsoft.com/v1.0/me/memberOf', {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });
        const groups = groupsRes.data.value.map(g => g.displayName);
        const isAdmin = groups.includes('GS_Fortingate_VPN');
        setAuthority(isAdmin ? 'admin' : 'basic');
      } catch (err) {
        console.error(err);
      }
    };

    fetchAuthority();
  }, [accounts, instance]);

  useEffect(() => {
    const fetchTicket = async () => {
      try {
        const res = await axios.get(`${backendBase}/tickets/${id}`);
        setTicket(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchTicket();
  }, [id]);

  // ACTION HANDLERS (logic unchanged)
  const confirmAction = async () => {
    if (!modal.action) return;
    setLoading(true);

    try {
      if (modal.action === "close") {
        await axios.put(`${backendBase}/tickets/${id}/close`);
      } else if (modal.action === "revive") {
        await axios.put(`${backendBase}/tickets/${id}/revive`);
      }

      setModal({ open: false, action: null });
      navigate('/', { state: { refresh: true } });

    } catch (err) {
      console.error(err);
      setModal({ open: false, action: null });
    }
    setLoading(false);
  };

  const categoryColor = (category) => {
    if (!category) return '#3498db';
    const c = category.toLowerCase();
    if (c.includes('password') || c.includes('admin access') || c.includes('admin')) return '#f39c12';
    if (c.includes('payroll') || c.includes('expense')) return '#27ae60';
    if (c.includes('leave') || c.includes('onboard') || c.includes('onboarding')) return '#e74c3c';
    return '#3498db';
  };

  const statusColor = (status) => {
    if (!status) return '#6b7280';
    const s = status.toLowerCase();
    if (s === 'open') return '#10b981';
    if (s === 'in progress' || s === 'pending') return '#f59e0b';
    if (s === 'closed' || s === 'resolved') return '#6b7280';
    return '#6b7280';
  };

  const initials = (nameOrEmail) => {
    const value = nameOrEmail || '';
    return value.split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase() || 'U';
  };

  // Friendly date formatting helper
  const fmt = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString();
    } catch {
      return d;
    }
  };

  if (!ticket) {
    return (
      <div style={{ padding: '2rem', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ background: 'white', padding: 24, borderRadius: 12, boxShadow: '0 6px 20px rgba(2,6,23,0.06)' }}>
          <p style={{ margin: 0 }}>Loading ticket…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .td-page { padding: 2rem; max-width: 1100px; margin: 0 auto; }
        .td-header {
          display:flex; gap:20px; align-items:center; justify-content:space-between; margin-bottom:18px;
        }
        .td-info { display:flex; gap:16px; align-items:center; }
        .td-avatar {
          width:72px; height:72px; border-radius:12px; background:#eef2ff; display:flex; align-items:center; justify-content:center;
          font-size:22px; font-weight:800; color:#3730a3;
          box-shadow: 0 6px 18px rgba(2,6,23,0.06);
        }
        .td-title { display:flex; flex-direction:column; gap:6px; }
        .td-title h1 { margin:0; font-size:1.4rem; color:#0f172a; }
        .td-sub { font-size:0.95rem; color:#6b7280; display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
        .badge-priority { padding:6px 10px; border-radius:999px; font-weight:800; color:white; font-size:0.88rem; }
        .status-pill {
          display:inline-flex; align-items:center; gap:10px; padding:10px 14px; border-radius:999px;
          background:white; box-shadow: 0 8px 28px rgba(2,6,23,0.06); font-weight:700; color:#0f172a;
        }

        .td-grid { display:grid; grid-template-columns: 1fr 340px; gap:20px; align-items:start; }
        .card { background:white; padding:20px; border-radius:12px; box-shadow: 0 8px 30px rgba(2,6,23,0.04); }
        .card h3 { margin-top:0; color:#0f172a; }
        .meta-row { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:12px; }
        .meta-key { color:#6b7280; }
        .meta-val { font-weight:800; color:#0f172a; }

        .activity { display:flex; flex-direction:column; gap:10px; margin-top:8px; }
        .activity-item { background:#fbfdff; padding:12px; border-radius:8px; border-left:4px solid #e2e8f0; }
        .actions-column { display:flex; flex-direction:column; gap:10px; }

        .btn-primary { width:100%; background:#e74c3c; color:white; padding:12px 14px; border:none; border-radius:8px; font-weight:800; cursor:pointer; }
        .btn-success { width:100%; background:#27ae60; color:white; padding:12px 14px; border:none; border-radius:8px; font-weight:800; cursor:pointer; }
        .btn-ghost { width:100%; background:transparent; border:1px solid rgba(37,99,235,0.12); color:#2563eb; padding:10px 12px; border-radius:8px; font-weight:700; cursor:pointer; }

        /* Modal */
        .td-modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; z-index:2000; }
        .td-modal { background:white; padding:28px; border-radius:12px; width:420px; max-width:92%; box-shadow:0 12px 40px rgba(2,6,23,0.12); text-align:center; }

        @media (max-width: 980px) {
          .td-grid { grid-template-columns: 1fr; }
          .td-header { flex-direction:column; align-items:flex-start; gap:12px; }
          .status-pill { align-self:flex-start; }
        }
      `}</style>

      <div className="td-page">
        {/* Header */}
        <div className="td-header">
          <div className="td-info">
            <button
              onClick={() => navigate(-1)}
              aria-label="Back"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 8, marginRight: 6 }}
            >
              ← Back
            </button>

            <div className="td-avatar" aria-hidden>{initials(ticket.userName || ticket.userEmail)}</div>

            <div className="td-title">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h1>#{ticket.ticketNumber} — {ticket.category}</h1>
                <div className="badge-priority" style={{ background: '#f59e0b' }}>{ticket.priority || 'Medium'}</div>
              </div>
              <div className="td-sub">
                <span>{ticket.userName}</span>
                <span style={{ color: '#cbd5e1' }}>•</span>
                <span>{ticket.userEmail}</span>
              </div>
            </div>
          </div>

          <div>
            <div className="status-pill" role="status" aria-label={`Status ${ticket.status}`}>
              <div style={{ width:10, height:10, borderRadius:999, background: statusColor(ticket.status) }} />
              <div>{ticket.status}</div>
            </div>
          </div>
        </div>

        {/* Main grid */}
        <div className="td-grid">
          {/* Left: description + activity */}
          <div className="card">
            <h3>Description</h3>
            <div style={{ color: '#374151', whiteSpace: 'pre-wrap', minHeight: 80 }}>
              {ticket.description || 'No description provided.'}
            </div>

            {(ticket.history && ticket.history.length > 0) || ticket.notes ? (
              <>
                <h4 style={{ marginTop: 18, marginBottom: 8 }}>Activity</h4>
                <div className="activity">
                  {Array.isArray(ticket.history) && ticket.history.map((h, i) => (
                    <div key={i} className="activity-item" style={{ borderLeftColor: categoryColor(h.category || ticket.category) }}>
                      <div style={{ fontWeight:700, color:'#0f172a' }}>{h.title || h.action || 'Update'}</div>
                      <div style={{ color:'#6b7280', marginTop:6 }}>{h.detail || h.note || ''}</div>
                      {h.when && <div style={{ color:'#9ca3af', marginTop:8, fontSize:13 }}>{h.when}</div>}
                    </div>
                  ))}

                  {ticket.notes && (
                    <div className="activity-item" style={{ borderLeftColor: categoryColor(ticket.category) }}>
                      <div style={{ fontWeight:700, color:'#0f172a' }}>Notes</div>
                      <div style={{ color:'#6b7280', marginTop:6 }}>{ticket.notes}</div>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>

          {/* Right: metadata & actions */}
          <aside style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div className="card">
              <div className="meta-row">
                <div className="meta-key">Category</div>
                <div className="meta-val" style={{ color: categoryColor(ticket.category) }}>{ticket.category}</div>
              </div>

              <div className="meta-row">
                <div className="meta-key">Created</div>
                <div className="meta-val">{fmt(ticket.createdAt)}</div>
              </div>

              <div className="meta-row">
                <div className="meta-key">Last updated</div>
                <div className="meta-val">{fmt(ticket.updatedAt)}</div>
              </div>
            </div>

            <div className="card actions-column">
              {authority === 'admin' && ticket.status !== 'Closed' && (
                <button
                  onClick={() => setModal({ open: true, action: "close" })}
                  disabled={loading}
                  className="btn-primary"
                >
                  {loading ? 'Closing…' : 'Close Ticket'}
                </button>
              )}

              {ticket.status === 'Closed' && (
                <button
                  onClick={() => setModal({ open: true, action: "revive" })}
                  disabled={loading}
                  className="btn-success"
                >
                  {loading ? 'Reviving…' : 'Revive Ticket'}
                </button>
              )}

              <button onClick={() => navigate('/')} className="btn-ghost">← Back to list</button>
            </div>
          </aside>
        </div>
      </div>

      {/* CONFIRMATION MODAL */}
      {modal.open && (
        <div className="td-modal-backdrop" role="dialog" aria-modal="true">
          <div className="td-modal" role="document">
            <h3 style={{ marginBottom: 12, color: '#0f172a' }}>
              {modal.action === "close" ? "Close this ticket?" : "Revive this ticket?"}
            </h3>
            <p style={{ color: '#6b7280', marginBottom: 18 }}>
              {modal.action === "close"
                ? "Closing will mark the ticket as completed. This action can be reversed by reviving."
                : "Reviving will reopen the ticket so it can be worked on again."}
            </p>

            <div style={{ display: "flex", gap: 12, justifyContent: 'center' }}>
              <button
                onClick={confirmAction}
                style={{
                  padding: "10px 20px",
                  background: "#2563eb",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: 800
                }}
              >
                {loading ? 'Working…' : 'Yes'}
              </button>

              <button
                onClick={() => setModal({ open: false, action: null })}
                style={{
                  padding: "10px 20px",
                  background: "#f3f4f6",
                  color: "#374151",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: 700
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default TicketDetails;