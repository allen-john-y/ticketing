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

  // ACTION HANDLERS WITHOUT ALERTS
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
      // refresh list on home
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
      <div style={{ padding: '2rem', maxWidth: 980, margin: '0 auto' }}>
        <div style={{
          display: 'flex',
          gap: 20,
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16
        }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={() => navigate(-1)}
              aria-label="Back"
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: 8,
                borderRadius: 8
              }}
            >
              ← Back
            </button>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{
                width: 64, height: 64, borderRadius: 12,
                background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 800, color: '#3730a3'
              }}>
                {initials(ticket.userName || ticket.userEmail)}
              </div>

              <div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                  <h2 style={{ margin: 0, color: '#0f172a' }}>#{ticket.ticketNumber} — {ticket.category}</h2>
                  <div style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: '#f3f4f6',
                    fontWeight: 700,
                    color: '#374151',
                    fontSize: 13
                  }}>{ticket.priority || 'Medium'}</div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>{ticket.userName}</div>
                  <div style={{ fontSize: 13, color: '#9ca3af' }}>•</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>{ticket.userEmail}</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{
              padding: '8px 12px',
              borderRadius: 999,
              background: '#ffffff',
              boxShadow: '0 6px 18px rgba(2,6,23,0.06)',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: statusColor(ticket.status) }} aria-hidden />
              <div style={{ fontWeight: 700, color: '#0f172a' }}>{ticket.status}</div>
            </div>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 320px',
          gap: 20,
          alignItems: 'start'
        }}>
          {/* Main content */}
          <div style={{ background: 'white', padding: 20, borderRadius: 12, boxShadow: '0 8px 30px rgba(2,6,23,0.04)' }}>
            <h3 style={{ marginTop: 0, color: '#0f172a' }}>Description</h3>
            <div style={{ color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {ticket.description || 'No description provided.'}
            </div>

            {ticket.notes || ticket.history ? (
              <>
                <h4 style={{ marginTop: 18 }}>Activity</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Array.isArray(ticket.history) && ticket.history.length > 0 && ticket.history.map((h, i) => (
                    <div key={i} style={{ background: '#fbfdff', padding: 10, borderRadius: 8, borderLeft: `4px solid ${categoryColor(h.category || ticket.category)}` }}>
                      <div style={{ fontSize: 13, color: '#374151', fontWeight: 700 }}>{h.title || h.action || 'Update'}</div>
                      <div style={{ fontSize: 13, color: '#6b7280' }}>{h.detail || h.note || ''}</div>
                      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>{h.when}</div>
                    </div>
                  ))}

                  {ticket.notes && (
                    <div style={{ background: '#fbfbfb', padding: 10, borderRadius: 8 }}>
                      <div style={{ fontSize: 13, color: '#374151', fontWeight: 700 }}>Notes</div>
                      <div style={{ marginTop: 6, color: '#6b7280' }}>{ticket.notes}</div>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>

          {/* Right column: metadata & actions */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'white', padding: 16, borderRadius: 12, boxShadow: '0 8px 30px rgba(2,6,23,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 13, color: '#6b7280' }}>Category</div>
                <div style={{ fontWeight: 800, color: categoryColor(ticket.category), textTransform: 'capitalize' }}>{ticket.category}</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 13, color: '#6b7280' }}>Created</div>
                <div style={{ fontWeight: 700, color: '#374151' }}>{ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : '—'}</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, color: '#6b7280' }}>Last updated</div>
                <div style={{ fontWeight: 700, color: '#374151' }}>{ticket.updatedAt ? new Date(ticket.updatedAt).toLocaleString() : '—'}</div>
              </div>
            </div>

            {/* Actions card */}
            <div style={{ background: 'white', padding: 16, borderRadius: 12, boxShadow: '0 8px 30px rgba(2,6,23,0.04)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* ADMIN CLOSE BUTTON */}
                {authority === 'admin' && ticket.status !== 'Closed' && (
                  <button
                    onClick={() => setModal({ open: true, action: "close" })}
                    disabled={loading}
                    style={{
                      width: '100%',
                      background: '#e74c3c',
                      color: 'white',
                      padding: '12px 14px',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 800
                    }}
                  >
                    {loading ? 'Closing...' : 'Close Ticket'}
                  </button>
                )}

                {/* REVIVE BUTTON */}
                {ticket.status === 'Closed' && (
                  <button
                    onClick={() => setModal({ open: true, action: "revive" })}
                    disabled={loading}
                    style={{
                      width: '100%',
                      background: '#27ae60',
                      color: 'white',
                      padding: '12px 14px',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 800
                    }}
                  >
                    {loading ? 'Reviving...' : 'Revive Ticket'}
                  </button>
                )}

                <button
                  onClick={() => navigate('/')}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    color: '#2563eb',
                    padding: '10px 12px',
                    border: '1px solid rgba(37,99,235,0.12)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 700
                  }}
                >
                  ← Back to list
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* CONFIRMATION MODAL */}
      {modal.open && (
        <div style={{
          position: "fixed",
          top: 0, left: 0,
          width: "100vw", height: "100vh",
          background: "rgba(0,0,0,0.45)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 2000
        }}>
          <div style={{
            background: "white",
            padding: "28px",
            borderRadius: "12px",
            width: "400px",
            maxWidth: "92%",
            textAlign: "center",
            boxShadow: "0 8px 30px rgba(2,6,23,0.12)"
          }}>
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