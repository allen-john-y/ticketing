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
  const [closeError, setCloseError] = useState(''); // NEW: Professional error

  // Revive states
  const [showReviveReasonInput, setShowReviveReasonInput] = useState(false);
  const [reviveReason, setReviveReason] = useState('');
  const [reviveError, setReviveError] = useState(''); // NEW: Professional error

  const [confirmModal, setConfirmModal] = useState(false);
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

  // PROFESSIONAL CLOSE HANDLING
  const handleSubmitReason = () => {
    if (!closeReason.trim()) {
      setCloseError("Please provide a reason for closing this ticket.");
      return;
    }
    setCloseError('');
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
      setCloseError("Failed to close ticket. Please try again.");
    }
    setLoading(false);
  };

  const cancelClose = () => {
    setShowReasonInput(false);
    setConfirmModal(false);
    setCloseReason('');
    setCloseError('');
  };

  // PROFESSIONAL REVIVE HANDLING
  const handleSubmitReviveReason = () => {
    if (!reviveReason.trim()) {
      setReviveError("Please provide a reason for reviving this ticket.");
      return;
    }
    setReviveError('');
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
      setReviveError("Failed to revive ticket. Please try again.");
    }
    setLoading(false);
  };

  const cancelRevive = () => {
    setShowReviveReasonInput(false);
    setConfirmReviveModal(false);
    setReviveReason('');
    setReviveError('');
  };

  if (!ticket) return <p style={{ textAlign: 'center', padding: '2rem' }}>Loading ticket...</p>;

  const statusColor = ticket.status === "Closed" ? "#dc2626" : "#16a34a";
  const priorityColor = {
    'High': { bg: '#fef2f2', text: '#ef4444' }, // Red
    'Medium': { bg: '#fff7ed', text: '#f97316' }, // Orange
    'Low': { bg: '#eff6ff', text: '#2563eb' } // Blue
  }[ticket.priority] || { bg: '#f8fafc', text: '#475569' };

  const statusDot = {
    width: 12, height: 12, borderRadius: "50%", marginRight: 8,
    background: statusColor,
    boxShadow: "0 0 8px rgba(0,0,0,0.2)", display: "inline-block"
  };

  const historyEvents = ticket.history && ticket.history.length > 0
    ? ticket.history
    : [
        { action: "created", by: ticket.userName, at: ticket.createdAt, reason: null },
        ...(ticket.closedAt ? [{ action: "closed", by: ticket.closedBy || "Unknown", at: ticket.closedAt, reason: ticket.closeReason }] : []),
        ...(ticket.reopenedAt ? [{ action: "revived", by: ticket.reopenedBy || "Unknown", at: ticket.reopenedAt, reason: ticket.reviveReason }] : [])
      ];

  return (
    <>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoomIn { from { transform: scale(0.8); } to { transform: scale(1); } }
        .overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.65); display: flex; justify-content: center; align-items: center; z-index: 9999; animation: fadeIn 0.3s; }
        .modal-box { background: white; padding: 30px; border-radius: 16px; width: 90%; max-width: 460px; text-align: center; box-shadow: 0 15px 50px rgba(0,0,0,0.25); animation: zoomIn 0.3s; }
        .reason-input { width: 433px; padding: 14px; margin: 12px 0; border: 2px solid #e2e8f0; border-radius: 12px; font-size: 15px; transition: border 0.2s; }
        .reason-input:focus { outline: none; border-color: #3b82f6; }
        .error-text { color: #dc2626; font-size: 14px; margin-top: 8px; font-weight: 500; }
        .timeline { position: relative; padding-left: 40px; }
        .timeline::before { content: ''; position: absolute; left: 14px; top: 0; bottom: 0; width: 4px; background: #e2e8f0; border-radius: 2px; }
        .tl-item { position: relative; margin-bottom: 32px; }
        .tl-dot { position: absolute; left: -40px; top: 8px; width: 24px; height: 24px; border-radius: 50%; border: 5px solid white; box-shadow: 0 0 0 5px #e2e8f0; }
        .tl-created .tl-dot { background: #3b82f6; box-shadow: 0 0 0 5px #dbeafe; }
        .tl-closed .tl-dot { background: #dc2626; box-shadow: 0 0 0 5px #fecaca; }
        .tl-revived .tl-dot { background: #16a34a; box-shadow: 0 0 0 5px #bbf7d0; }
        .tl-current .tl-dot { background: ${statusColor}; box-shadow: 0 0 0 5px ${statusColor === "#dc2626" ? "#fecaca" : "#bbf7d0"}; }
      `}</style>

      {/* BACK BUTTON */}
      <div style={{ padding: "1rem", maxWidth: 720, margin: "0 auto" }}>
        <button onClick={() => navigate('/')} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px',
          borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
          fontWeight: 600, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', fontSize: '15px', color: '#334155'
        }}>
            ← Back to Tickets
        </button>
      </div>

      {/* MAIN CARD - ENHANCED */}
      <div style={{
        padding: '3rem', maxWidth: '720px', margin: '1.5rem auto 3rem', background: 'white',
        borderRadius: '20px', borderTop: `8px solid ${statusColor}`,
        boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
      }}>
        
        {/* Header: Category and Ticket ID */}
        <div style={{ marginBottom: '24px', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px' }}>
          <span style={{ fontSize: '1rem', fontWeight: 600, color: '#64748b' }}>Ticket #{ticket.ticketNumber}</span>
          <h1 style={{ margin: '4px 0 0', fontSize: '2.5rem', color: '#1e293b', fontWeight: 800 }}>
            {ticket.category}
          </h1>
        </div>

        {/* Key Metadata - Grid Layout */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(2, 1fr)', 
          gap: '20px', 
          marginBottom: '30px',
          padding: '10px 0',
          borderBottom: '1px solid #f1f5f9'
        }}>
          <div style={{ fontSize: '15px' }}>
            <p style={{ margin: 0, fontWeight: 700, color: '#475569' }}>Created By</p>
            <p style={{ margin: '4px 0 0', color: '#1e293b', fontWeight: 500 }}>{ticket.userName}</p>
          </div>
          <div style={{ fontSize: '15px' }}>
            <p style={{ margin: 0, fontWeight: 700, color: '#475569' }}>User Email</p>
            <p style={{ margin: '4px 0 0', color: '#1e293b', fontWeight: 500 }}>{ticket.userEmail}</p>
          </div>
          <div style={{ fontSize: '15px' }}>
            <p style={{ margin: 0, fontWeight: 700, color: '#475569' }}>Current Status</p>
            <div style={{ display: "flex", alignItems: "center", marginTop: 4 }}>
              <div style={statusDot}></div>
              <span style={{ fontSize: 16, fontWeight: 700, color: statusColor }}>{ticket.status}</span>
            </div>
          </div>
          <div style={{ fontSize: '15px' }}>
            <p style={{ margin: 0, fontWeight: 700, color: '#475569' }}>Priority</p>
            <span style={{ 
              color: priorityColor.text, 
              fontWeight: 700, 
              background: priorityColor.bg, 
              padding: '4px 12px', 
              borderRadius: 8, 
              display: 'inline-block',
              marginTop: 4
            }}>{ticket.priority}</span>
          </div>
        </div>

        {/* Description */}
        <div>
          <p style={{ margin: '0 0 10px', fontWeight: 700, color: '#475569', fontSize: '15px' }}>Description:</p>
          <div style={{ 
            background: '#f8fafc', 
            padding: 20, 
            borderRadius: 12, 
            border: '1px solid #e2e8f0',
            whiteSpace: 'pre-wrap', 
            lineHeight: 1.6, 
            color: '#334155',
            minHeight: 100 
          }}>
            {ticket.description}
          </div>
        </div>

        {/* Actions */}
        {(authority === 'admin' && ticket.status !== 'Closed') && (
          <button onClick={() => setShowReasonInput(true)} style={{
            marginTop: '3rem', background: '#dc2626', color: 'white', padding: '16px 32px',
            border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 700, fontSize: '16px',
            boxShadow: '0 6px 20px rgba(220,38,38,0.3)', transition: 'background-color 0.2s'
          }}>
            Close Ticket
          </button>
        )}

        {ticket.status === 'Closed' && (
          <button onClick={() => setShowReviveReasonInput(true)} style={{
            marginTop: '3rem', background: '#16a34a', color: 'white', padding: '16px 32px',
            border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 700, fontSize: '16px',
            boxShadow: '0 6px 20px rgba(22,163,74,0.3)', transition: 'background-color 0.2s'
          }}>
            Revive Ticket
          </button>
        )}
      </div>

      {/* FULL HISTORY TIMELINE */}
      <div style={{ maxWidth: '720px', margin: '3rem auto', padding: '0 1rem' }}>
        <h2 style={{ fontSize: '1.9rem', color: '#1e293b', marginBottom: '2.5rem', textAlign: 'center', fontWeight: 700 }}>
          Ticket History
        </h2>
        <div className="timeline">
          {historyEvents.map((event, index) => (
            <div key={index} className={`tl-item tl-${event.action}`}>
              <div className="tl-dot"></div>
              <div style={{
                background: event.action === "created" ? "#eff6ff" :
                            event.action === "closed" ? "#fee2e2" : "#f0fdf4",
                padding: '22px 26px', borderRadius: '20px',
                borderLeft: `8px solid ${
                  event.action === "created" ? "#3b82f6" :
                  event.action === "closed" ? "#dc2626" : "#16a34a"
                }`,
                boxShadow: '0 10px 30px rgba(0,0,0,0.12)'
              }}>
                <strong style={{
                  fontSize: '1.3rem',
                  color: event.action === "created" ? "#1e40af" :
                         event.action === "closed" ? "#991b1b" : "#166534"
                }}>
                  {event.action === "created" && "Ticket Created"}
                  {event.action === "closed" && "Ticket Closed"}
                  {event.action === "revived" && "Ticket Revived (Reopened)"}
                </strong><br />
                <small style={{ color: '#475569', fontWeight: 600, fontSize: '15px' }}>
                  {formatDate(event.at)} by <strong>{event.by || "Unknown"}</strong>
                </small>
                {event.reason && (
                  <div style={{
                    marginTop: 16, padding: 16, background: 'rgba(0,0,0,0.08)',
                    borderRadius: 14, fontStyle: 'italic', color: '#333',
                    borderLeft: '5px solid #999'
                  }}>
                    <strong>Reason:</strong> {event.reason}
                  </div>
                )}
              </div>
            </div>
          ))}

          <div className="tl-item tl-current">
            <div className="tl-dot"></div>
            <div style={{
              background: ticket.status === "Closed" ? "#fee2e2" : "#f0fdf4",
              padding: '22px 26px', borderRadius: '20px',
              borderLeft: `8px solid ${ticket.status === "Closed" ? "#dc2626" : "#16a34a"}`,
              boxShadow: '0 10px 30px rgba(0,0,0,0.12)'
            }}>
              <strong style={{ fontSize: '1.5rem', color: ticket.status === "Closed" ? "#991b1b" : "#166534" }}>
                Current Status: {ticket.status}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* PROFESSIONAL CLOSE MODAL */}
      {showReasonInput && (
        <div className="overlay" onClick={cancelClose}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', color: '#1e293b', fontSize: '1.5rem', fontWeight: 700 }}>
              Close Ticket #{ticket.ticketNumber}
            </h3>
            <p style={{ color: '#475569', marginBottom: 20 }}>Please provide a reason for closing this ticket.</p>
            <textarea
              className="reason-input"
              rows="6"
              placeholder="Explain why this ticket is being closed..."
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              autoFocus
            />
            {closeError && <div className="error-text">{closeError}</div>}
            <div style={{ marginTop: 24, display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button onClick={handleSubmitReason} style={{ padding: '14px 28px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 700 }}>
                Continue to Close
              </button>
              <button onClick={cancelClose} style={{ padding: '14px 28px', background: '#64748b', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 600 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM CLOSE */}
      {confirmModal && (
        <div className="overlay" onClick={cancelClose}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', color: '#dc2626', fontSize: '1.6rem', fontWeight: 700 }}>Permanently Close Ticket?</h3>
            <p style={{ color: '#475569', marginBottom: 30, fontSize: '15px' }}>This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
              <button onClick={confirmCloseTicket} disabled={loading} style={{ padding: '16px 36px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 700 }}>
                {loading ? 'Closing...' : 'Yes, Close It'}
              </button>
              <button onClick={cancelClose} style={{ padding: '16px 36px', background: '#64748b', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* PROFESSIONAL REVIVE MODAL */}
      {showReviveReasonInput && (
        <div className="overlay" onClick={cancelRevive}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', color: '#1e293b', fontSize: '1.5rem', fontWeight: 700 }}>
              Revive Ticket #{ticket.ticketNumber}
            </h3>
            <p style={{ color: '#475569', marginBottom: 20 }}>Please explain why this ticket needs to be reopened.</p>
            <textarea
              className="reason-input"
              rows="6"
              placeholder="Why is this ticket being revived?"
              value={reviveReason}
              onChange={(e) => setReviveReason(e.target.value)}
              autoFocus
            />
            {reviveError && <div className="error-text">{reviveError}</div>}
            <div style={{ marginTop: 24, display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button onClick={handleSubmitReviveReason} style={{ padding: '14px 28px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 700 }}>
                Continue to Revive
              </button>
              <button onClick={cancelRevive} style={{ padding: '14px 28px', background: '#64748b', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 600 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM REVIVE */}
      {confirmReviveModal && (
        <div className="overlay" onClick={cancelRevive}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', color: '#16a34a', fontSize: '1.6rem', fontWeight: 700 }}>Revive This Ticket?</h3>
            <p style={{ color: '#475569', marginBottom: 30, fontSize: '15px' }}>The ticket will be reopened and require attention.</p>
            <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
              <button onClick={confirmReviveTicket} disabled={loading} style={{ padding: '16px 36px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 700 }}>
                {loading ? 'Reviving...' : 'Yes, Revive It'}
              </button>
              <button onClick={cancelRevive} style={{ padding: '16px 36px', background: '#64748b', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default TicketDetails;