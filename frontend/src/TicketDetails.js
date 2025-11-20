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

  // Modal states
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [confirmModal, setConfirmModal] = useState(false);
  const [showReviveReasonInput, setShowReviveReasonInput] = useState(false);
  const [reviveReason, setReviveReason] = useState('');
  const [confirmReviveModal, setConfirmReviveModal] = useState(false);

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

  // Format date: 20 Nov 2025, 3:45 PM
  const formatDate = (dateString) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  // === CLOSE FUNCTIONS ===
  const handleSubmitReason = () => {
    if (!closeReason.trim()) return alert("Please provide a reason.");
    setShowReasonInput(false);
    setConfirmModal(true);
  };

  const confirmCloseTicket = async () => {
    setLoading(true);
    try {
      await axios.put(`${backendBase}/tickets/${id}/close`, {
        closeReason: closeReason.trim(),
        closedBy: accounts[0]?.name || accounts[0]?.username
      });
      setConfirmModal(false);
      setCloseReason('');
      navigate('/', { state: { refresh: true } });
    } catch (err) {
      alert("Failed to close ticket.");
    }
    setLoading(false);
  };

  const cancelClose = () => {
    setShowReasonInput(false);
    setConfirmModal(false);
    setCloseReason('');
  };

  // === REVIVE FUNCTIONS ===
  const handleSubmitReviveReason = () => {
    if (!reviveReason.trim()) return alert("Please provide a reason.");
    setShowReviveReasonInput(false);
    setConfirmReviveModal(true);
  };

  const confirmReviveTicket = async () => {
    setLoading(true);
    try {
      await axios.put(`${backendBase}/tickets/${id}/revive`, {
        revivedBy: accounts[0]?.name || accounts[0]?.username || "User",
        reviveReason: reviveReason.trim()
      });
      setConfirmReviveModal(false);
      setReviveReason('');
      navigate('/', { state: { refresh: true } });
    } catch (err) {
      alert("Failed to revive ticket.");
    }
    setLoading(false);
  };

  const cancelRevive = () => {
    setShowReviveReasonInput(false);
    setConfirmReviveModal(false);
    setReviveReason('');
  };

  if (!ticket) return <p style={{ textAlign: 'center', padding: '2rem' }}>Loading ticket...</p>;

  const statusDot = {
    width: 12, height: 12, borderRadius: "50%", marginRight: 8,
    background: ticket.status === "Closed" ? "#e74c3c" : "#27ae60",
    boxShadow: "0 0 6px rgba(0,0,0,0.2)", display: "inline-block"
  };

  // === BUILD FULL TIMELINE (Supports multiple close/revive cycles) ===
  const timelineEvents = [];

  // 1. Created
  timelineEvents.push({
    type: "created",
    date: ticket.createdAt,
    by: ticket.userName,
    reason: null
  });

  // 2. Closed (only if ever closed)
  if (ticket.closedAt) {
    timelineEvents.push({
      type: "closed",
      date: ticket.closedAt,
      by: ticket.closedBy || "Unknown",
      reason: ticket.closeReason
    });
  }

  // 3. Revived (only if ever revived)
  if (ticket.reopenedAt) {
    timelineEvents.push({
      type: "revived",
      date: ticket.reopenedAt,
      by: ticket.reopenedBy || "Unknown",
      reason: ticket.reviveReason
    });
  }

  // 4. Current Status
  timelineEvents.push({
    type: "current",
    date: new Date(),
    status: ticket.status
  });

  return (
    <>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoomIn { from { transform: scale(0.8); } to { transform: scale(1); } }
        .overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.65); display: flex; justify-content: center; align-items: center; z-index: 9999; animation: fadeIn 0.3s; }
        .modal-box { background: white; padding: 30px; border-radius: 12px; width: 90%; max-width: 420px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.2); animation: zoomIn 0.3s; }
        .reason-input { width: 100%; padding: 12px; margin: 12px 0; border: 1px solid #ddd; border-radius: 8px; font-size: 15px; }
        .timeline { position: relative; padding-left: 36px; }
        .timeline::before { content: ''; position: absolute; left: 10px; top: 0; bottom: 0; width: 4px; background: #e2e8f0; border-radius: 2px; }
        .tl-item { position: relative; margin-bottom: 28px; }
        .tl-dot { position: absolute; left: -36px; top: 6px; width: 20px; height: 20px; border-radius: 50%; border: 5px solid white; box-shadow: 0 0 0 5px #e2e8f0; }
        .tl-created .tl-dot { background: #3b82f6; box-shadow: 0 0 0 5px #dbeafe; }
        .tl-closed .tl-dot { background: #dc2626; box-shadow: 0 0 0 5px #fecaca; }
        .tl-revived .tl-dot { background: #16a34a; box-shadow: 0 0 0 5px #bbf7d0; }
        .tl-current .tl-dot { background: ${ticket.status === "Closed" ? "#dc2626" : "#16a34a"}; box-shadow: 0 0 0 5px ${ticket.status === "Closed" ? "#fecaca" : "#bbf7d0"}; }
      `}</style>

      {/* BACK BUTTON */}
      <div style={{ padding: "1rem", maxWidth: 720, margin: "0 auto" }}>
        <button onClick={() => navigate('/')} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px',
          borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
          fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
        }}>
          ← Back to Home
        </button>
      </div>

      {/* MAIN CARD */}
      <div style={{
        padding: '2rem', maxWidth: '720px', margin: '0 auto', background: 'white',
        borderRadius: '12px', borderLeft: `6px solid ${ticket.status === "Closed" ? "#e74c3c" : "#27ae60"}`,
        boxShadow: '0 8px 30px rgba(0,0,0,0.1)',
      }}>
        <h1 style={{ margin: '0 0 8px', fontSize: '1.8rem', color: '#1e293b' }}>{ticket.category}</h1>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
          <div style={statusDot}></div>
          <span style={{ fontSize: 18, fontWeight: 600, color: "#1e293b" }}>{ticket.status}</span>
        </div>
        <div style={{ lineHeight: 1.7, color: '#475569' }}>
          <p><strong>Ticket #:</strong> {ticket.ticketNumber}</p>
          <p><strong>Created by:</strong> {ticket.userName}</p>
          <p><strong>Email:</strong> {ticket.userEmail}</p>
          <p><strong>Priority:</strong> <span style={{ color: '#f59e0b', fontWeight: 600 }}>{ticket.priority}</span></p>
          <p style={{ marginTop: 16 }}><strong>Description:</strong><br />{ticket.description}</p>
        </div>

        {authority === 'admin' && ticket.status !== 'Closed' && (
          <button onClick={() => setShowReasonInput(true)} style={{
            marginTop: '1.5rem', background: '#dc2626', color: 'white', padding: '14px 28px',
            border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600,
            boxShadow: '0 4px 12px rgba(220,38,38,0.3)'
          }}>Close Ticket</button>
        )}

        {ticket.status === 'Closed' && (
          <button onClick={() => setShowReviveReasonInput(true)} style={{
            marginTop: '1.5rem', background: '#16a34a', color: 'white', padding: '14px 28px',
            border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600,
          }}>Revive Ticket</button>
        )}
      </div>

      {/* FULL LIFECYCLE TIMELINE */}
      <div style={{ maxWidth: '720px', margin: '2.5rem auto', padding: '0 1rem' }}>
        <h2 style={{ fontSize: '1.6rem', color: '#1e293b', marginBottom: '2rem', textAlign: 'center' }}>
          Ticket Lifecycle History
        </h2>

        <div className="timeline">
          {timelineEvents.map((event, index) => (
            <div key={index} className={`tl-item tl-${event.type}`}>
              <div className="tl-dot"></div>
              <div style={{
                background: event.type === "created" ? "#eff6ff" :
                            event.type === "closed" ? "#fee2e2" :
                            event.type === "revived" ? "#f0fdf4" : "#f8fafc",
                padding: '16px 20px', borderRadius: '14px',
                borderLeft: `6px solid ${
                  event.type === "created" ? "#3b82f6" :
                  event.type === "closed" ? "#dc2626" :
                  event.type === "revived" ? "#16a34a" :
                  ticket.status === "Closed" ? "#dc2626" : "#16a34a"
                }`,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
              }}>
                <strong style={{
                  fontSize: '1.15rem',
                  color: event.type === "created" ? "#1e40af" :
                         event.type === "closed" ? "#991b1b" :
                         event.type === "revived" ? "#166534" :
                         ticket.status === "Closed" ? "#991b1b" : "#166534"
                }}>
                  {event.type === "created" && "Ticket Created"}
                  {event.type === "closed" && "Ticket Closed"}
                  {event.type === "revived" && "Ticket Revived (Reopened)"}
                  {event.type === "current" && `Current Status: ${event.status}`}
                </strong><br />
                <small style={{ color: '#475569', fontWeight: 500 }}>
                  {formatDate(event.date)}
                  {event.by && ` by `}
                  {event.by && <strong>{event.by}</strong>}
                </small>
                {event.reason && (
                  <p style={{
                    margin: '10px 0 0', padding: '10px', background: 'rgba(0,0,0,0.05)',
                    borderRadius: '8px', fontStyle: 'italic', color: '#555'
                  }}>
                    <strong>Reason:</strong> {event.reason}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ALL MODALS */}
      {showReasonInput && (
        <div className="overlay" onClick={cancelClose}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', color: '#1e293b' }}>Reason for Closing Ticket #{ticket.ticketNumber}</h3>
            <textarea className="reason-input" rows="5" placeholder="Please explain why..." value={closeReason} onChange={(e) => setCloseReason(e.target.value)} autoFocus />
            <div style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={handleSubmitReason} style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Submit</button>
              <button onClick={cancelClose} style={{ padding: '10px 20px', background: '#64748b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="overlay" onClick={cancelClose}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', color: '#dc2626' }}>Close Ticket #{ticket.ticketNumber}?</h3>
            <p style={{ color: '#475569', marginBottom: 24 }}>This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button onClick={confirmCloseTicket} disabled={loading} style={{ padding: '12px 28px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                {loading ? 'Closing...' : 'Yes, Close It'}
              </button>
              <button onClick={cancelClose} style={{ padding: '12px 28px', background: '#64748b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showReviveReasonInput && (
        <div className="overlay" onClick={cancelRevive}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', color: '#1e293b' }}>Reason for Reviving Ticket #{ticket.ticketNumber}</h3>
            <textarea className="reason-input" rows="5" placeholder="Why reopen this ticket?" value={reviveReason} onChange={(e) => setReviveReason(e.target.value)} autoFocus />
            <div style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={handleSubmitReviveReason} style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Submit</button>
              <button onClick={cancelRevive} style={{ padding: '10px 20px', background: '#64748b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {confirmReviveModal && (
        <div className="overlay" onClick={cancelRevive}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', color: '#16a34a' }}>Revive Ticket #{ticket.ticketNumber}?</h3>
            <p style={{ color: '#475569', marginBottom: 24 }}>This ticket will be reopened.</p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button onClick={confirmReviveTicket} disabled={loading} style={{ padding: '12px 28px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                {loading ? 'Reviving...' : 'Yes, Revive It'}
              </button>
              <button onClick={cancelRevive} style={{ padding: '12px 28px', background: '#64748b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default TicketDetails;