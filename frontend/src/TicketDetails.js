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

  // Close states
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [confirmModal, setConfirmModal] = useState(false);

  // Revive states
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

  // Format date like: 20 Nov 2025, 3:45 PM
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
    if (!closeReason.trim()) {
      alert("Please provide a reason for closing the ticket.");
      return;
    }
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
    if (!reviveReason.trim()) {
      alert("Please provide a reason for reviving the ticket.");
      return;
    }
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
    width: 12,
    height: 12,
    borderRadius: "50%",
    marginRight: 8,
    background: ticket.status === "Closed" ? "#e74c3c" : "#27ae60",
    boxShadow: "0 0 6px rgba(0,0,0,0.2)",
    display: "inline-block"
  };

  return (
    <>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoomIn { from { transform: scale(0.8); } to { transform: scale(1); } }
        .overlay { 
          position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; 
          background: rgba(0,0,0,0.65); display: flex; justify-content: center; 
          align-items: center; z-index: 9999; animation: fadeIn 0.3s;
        }
        .modal-box { 
          background: white; padding: 30px; border-radius: 12px; 
          width: 90%; max-width: 420px; text-align: center; 
          box-shadow: 0 10px 40px rgba(0,0,0,0.2); animation: zoomIn 0.3s;
        }
        .reason-input { 
          width: 100%; padding: 12px; margin: 12px 0; 
          border: 1px solid #ddd; border-radius: 8px; font-size: 15px;
        }
        .timeline { position: relative; padding-left: 30px; }
        .timeline::before { content: ''; position: absolute; left: 6px; top: 0; bottom: 0; width: 4px; background: #e2e8f0; border-radius: 2px; }
        .tl-item { position: relative; margin-bottom: 24px; padding-left: 30px; }
        .tl-dot { position: absolute; left: -28px; top: 4px; width: 16px; height: 16px; border-radius: 50%; background: #3b82f6; border: 4px solid white; box-shadow: 0 0 0 4px #dbeafe; }
        .tl-closed .tl-dot { background: #dc2626; box-shadow: 0 0 0 4px #fecaca; }
        .tl-revived .tl-dot { background: #16a34a; box-shadow: 0 0 0 4px #bbf7d0; }
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
        padding: '2rem',
        maxWidth: '720px',
        margin: '0 auto',
        background: 'white',
        borderRadius: '12px',
        borderLeft: `6px solid ${ticket.status === "Closed" ? "#e74c3c" : "#27ae60"}`,
        boxShadow: '0 8px 30px rgba(0,0,0,0.1)',
      }}>
        <h1 style={{ margin: '0 0 8px', fontSize: '1.8rem', color: '#1e293b' }}>
          {ticket.category}
        </h1>

        <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
          <div style={statusDot}></div>
          <span style={{ fontSize: 18, fontWeight: 600, color: "#1e293b" }}>
            {ticket.status}
          </span>
        </div>

        <div style={{ lineHeight: 1.7, color: '#475569' }}>
          <p><strong>Ticket #:</strong> {ticket.ticketNumber}</p>
          <p><strong>Created by:</strong> {ticket.userName}</p>
          <p><strong>Email:</strong> {ticket.userEmail}</p>
          <p><strong>Priority:</strong> <span style={{ color: '#f59e0b', fontWeight: 600 }}>{ticket.priority}</span></p>
          <p style={{ marginTop: 16 }}><strong>Description:</strong><br />{ticket.description}</p>
        </div>

        {/* ACTION BUTTONS */}
        {authority === 'admin' && ticket.status !== 'Closed' && (
          <button onClick={() => setShowReasonInput(true)} style={{
            marginTop: '1.5rem', background: '#dc2626', color: 'white',
            padding: '14px 28px', border: 'none', borderRadius: '10px', cursor: 'pointer',
            fontSize: '1rem', fontWeight: 600, boxShadow: '0 4px 12px rgba(220,38,38,0.3)'
          }}>
            Close Ticket
          </button>
        )}

        {ticket.status === 'Closed' && (
          <button onClick={() => setShowReviveReasonInput(true)} style={{
            marginTop: '1.5rem', background: '#16a34a', color: 'white',
            padding: '14px 28px', border: 'none', borderRadius: '10px', cursor: 'pointer',
            fontWeight: 600,
          }}>
            Revive Ticket
          </button>
        )}
      </div>

      {/* TIMELINE / HISTORY SECTION */}
      <div style={{ maxWidth: '720px', margin: '2rem auto', padding: '0 1rem' }}>
        <h2 style={{ fontSize: '1.5rem', color: '#1e293b', marginBottom: '1.5rem' }}>
          Ticket History
        </h2>

        <div className="timeline">
          {/* Created */}
          <div className="tl-item">
            <div className="tl-dot" style={{ background: '#3b82f6' }}></div>
            <div style={{ background: '#eff6ff', padding: '12px 16px', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
              <strong style={{ color: '#1e40af' }}>Ticket Created</strong><br />
              <small style={{ color: '#64748b' }}>
                {formatDate(ticket.createdAt)} by {ticket.userName}
              </small>
            </div>
          </div>

          {/* Closed */}
          {ticket.status === 'Closed' && ticket.closedAt && (
            <div className="tl-item tl-closed">
              <div className="tl-dot"></div>
              <div style={{ background: '#fee2e2', padding: '12px 16px', borderRadius: '8px', borderLeft: '4px solid #dc2626' }}>
                <strong style={{ color: '#991b1b' }}>Ticket Closed</strong><br />
                <small style={{ color: '#991b1b' }}>
                  {formatDate(ticket.closedAt)} by <strong>{ticket.closedBy}</strong>
                </small>
                {ticket.closeReason && (
                  <p style={{ margin: '8px 0 0', fontStyle: 'italic', color: '#7f1d1d' }}>
                    Reason: {ticket.closeReason}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Revived */}
          {ticket.reopenedAt && (
            <div className="tl-item tl-revived">
              <div className="tl-dot"></div>
              <div style={{ background: '#f0fdf4', padding: '12px 16px', borderRadius: '8px', borderLeft: '4px solid #16a34a' }}>
                <strong style={{ color: '#166534' }}>Ticket Revived (Reopened)</strong><br />
                <small style={{ color: '#166534' }}>
                  {formatDate(ticket.reopenedAt)} by <strong>{ticket.reopenedBy}</strong>
                </small>
                {ticket.reviveReason && (
                  <p style={{ margin: '8px 0 0', fontStyle: 'italic', color: '#166534' }}>
                    Reason: {ticket.reviveReason}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Current Status */}
          <div className="tl-item">
            <div className="tl-dot" style={{ background: ticket.status === "Closed" ? "#dc2626" : "#16a34a" }}></div>
            <div style={{ background: ticket.status === "Closed" ? '#fee2e2' : '#f0fdf4', padding: '12px 16px', borderRadius: '8px', borderLeft: `4px solid ${ticket.status === "Closed" ? "#dc2626" : "#16a34a"}` }}>
              <strong style={{ color: ticket.status === "Closed" ? '#991b1b' : '#166534' }}>
                Current Status: {ticket.status}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* ALL MODALS (Close + Revive) - SAME AS BEFORE */}
      {showReasonInput && (
        <div className="overlay" onClick={cancelClose}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', color: '#1e293b' }}>
              Reason for Closing Ticket #{ticket.ticketNumber}
            </h3>
            <textarea className="reason-input" rows="5" placeholder="Please explain why this ticket is being closed..." value={closeReason} onChange={(e) => setCloseReason(e.target.value)} autoFocus />
            <div style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={handleSubmitReason} style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                Submit Reason
              </button>
              <button onClick={cancelClose} style={{ padding: '10px 20px', background: '#64748b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                Cancel
              </button>
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
              <button onClick={cancelClose} style={{ padding: '12px 28px', background: '#64748b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>No, Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showReviveReasonInput && (
        <div className="overlay" onClick={cancelRevive}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', color: '#1e293b' }}>
              Reason for Reviving Ticket #{ticket.ticketNumber}
            </h3>
            <textarea className="reason-input" rows="5" placeholder="Why are you reopening this ticket?" value={reviveReason} onChange={(e) => setReviveReason(e.target.value)} autoFocus />
            <div style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={handleSubmitReviveReason} style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                Submit Reason
              </button>
              <button onClick={cancelRevive} style={{ padding: '10px 20px', background: '#64748b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                Cancel
              </button>
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
              <button onClick={cancelRevive} style={{ padding: '12px 28px', background: '#64748b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>No, Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default TicketDetails;