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

  const [showReasonInput, setShowReasonInput] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [closeError, setCloseError] = useState('');

  const [showReviveReasonInput, setShowReviveReasonInput] = useState(false);
  const [reviveReason, setReviveReason] = useState('');
  const [reviveError, setReviveError] = useState('');

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

  const statusDot = {
    width: 14,
    height: 14,
    borderRadius: "50%",
    marginRight: 10,
    background: ticket.status === "Closed" ? "#dc2626" : "#16a34a",
    boxShadow: "0 0 6px rgba(0,0,0,0.25)"
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
        .ticket-card-title {
          font-size: 2.4rem;
          font-weight: 800;
          margin-bottom: 12px;
          color: #0f172a;
        }

        .ticket-status-row {
          font-size: 1.25rem;
          font-weight: 700;
          margin-bottom: 28px;
          display: flex;
          align-items: center;
        }

        .ticket-details p {
          font-size: 1.08rem;
          margin: 10px 0;
          color: #1e293b;
          line-height: 1.7;
        }

        .priority-badge {
          padding: 6px 14px;
          border-radius: 10px;
          font-size: 0.95rem;
          font-weight: 700;
          background: #fff4e6;
          color: #d97706;
          border: 1px solid #fcd9b6;
        }

        .ticket-description-box {
          background: #f1f5f9;
          padding: 20px;
          border-radius: 14px;
          font-size: 1.05rem;
          color: #334155;
          line-height: 1.7;
          margin-top: 12px;
          display: block;
        }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoomIn { from { transform: scale(0.85); } to { transform: scale(1); } }

        .overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
          background: rgba(0,0,0,0.65); display: flex; justify-content: center; 
          align-items: center; z-index: 9999; animation: fadeIn 0.3s; }

        .modal-box { background: white; padding: 30px; border-radius: 16px; width: 90%;
          max-width: 460px; text-align: center; 
          box-shadow: 0 15px 50px rgba(0,0,0,0.25); animation: zoomIn 0.25s; }
      `}</style>

      {/* BACK BUTTON */}
      <div style={{ padding: "1rem", maxWidth: 720, margin: "0 auto" }}>
        <button onClick={() => navigate('/')} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px',
          borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff',
          cursor: 'pointer', fontWeight: 600, fontSize: '15px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.06)'
        }}>
          Back to Tickets
        </button>
      </div>

      {/* MAIN CARD */}
      <div style={{
        padding: '2.5rem',
        maxWidth: '720px',
        margin: '0 auto',
        background: 'white',
        borderRadius: '16px',
        borderLeft: `8px solid ${ticket.status === "Closed" ? "#dc2626" : "#16a34a"}`,
        boxShadow: '0 10px 40px rgba(0,0,0,0.12)'
      }}>
        <h1 className="ticket-card-title">{ticket.category}</h1>

        <div className="ticket-status-row">
          <div style={statusDot}></div>
          {ticket.status}
        </div>

        <div className="ticket-details">
          <p><strong>Ticket #:</strong> {ticket.ticketNumber}</p>
          <p><strong>Created by:</strong> {ticket.userName}</p>
          <p><strong>Email:</strong> {ticket.userEmail}</p>

          <p><strong>Priority:</strong> 
            <span className="priority-badge"> {ticket.priority}</span>
          </p>

          <p><strong>Description:</strong></p>
          <span className="ticket-description-box">{ticket.description}</span>
        </div>

        {authority === 'admin' && ticket.status !== 'Closed' && (
          <button onClick={() => setShowReasonInput(true)} style={{
            marginTop: '2rem', background: '#dc2626',
            color: 'white', padding: '16px 32px',
            border: 'none', borderRadius: '12px',
            cursor: 'pointer', fontWeight: 700, fontSize: '16px'
          }}>
            Close Ticket
          </button>
        )}

        {ticket.status === 'Closed' && (
          <button onClick={() => setShowReviveReasonInput(true)} style={{
            marginTop: '2rem', background: '#16a34a',
            color: 'white', padding: '16px 32px',
            border: 'none', borderRadius: '12px',
            cursor: 'pointer', fontWeight: 700, fontSize: '16px'
          }}>
            Revive Ticket
          </button>
        )}
      </div>

      {/* HISTORY */}
      <div style={{ maxWidth: '720px', margin: '3rem auto', padding: '0 1rem' }}>
        <h2 style={{
          fontSize: '1.9rem',
          color: '#1e293b',
          marginBottom: '2.5rem',
          textAlign: 'center',
          fontWeight: 700
        }}>Ticket History</h2>

        <div>
          {historyEvents.map((event, i) => (
            <div key={i} style={{
              background: '#f8fafc',
              padding: '20px',
              borderRadius: '16px',
              marginBottom: '20px',
              borderLeft: `6px solid ${
                event.action === "created" ? "#2563eb" :
                event.action === "closed" ? "#dc2626" :
                "#16a34a"
              }`,
              boxShadow: "0 4px 16px rgba(0,0,0,0.08)"
            }}>
              <strong style={{ fontSize: '1.25rem' }}>
                {event.action === "created" && "Ticket Created"}
                {event.action === "closed" && "Ticket Closed"}
                {event.action === "revived" && "Ticket Revived (Reopened)"}
              </strong>

              <p style={{ marginTop: 6, color: '#475569', fontSize: '0.95rem' }}>
                {formatDate(event.at)} — <strong>{event.by}</strong>
              </p>

              {event.reason && (
                <div style={{
                  background: "#eef2f7",
                  padding: "14px",
                  marginTop: "10px",
                  borderRadius: "10px",
                  fontStyle: "italic"
                }}>
                  <strong>Reason:</strong> {event.reason}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* MODALS — unchanged logic */}

      {showReasonInput && (
        <div className="overlay" onClick={cancelClose}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{
              margin: '0 0 20px',
              color: '#1e293b',
              fontSize: '1.5rem',
              fontWeight: 700
            }}>
              Close Ticket #{ticket.ticketNumber}
            </h3>

            <textarea
              style={{
                width: '100%', padding: '14px', borderRadius: '12px',
                border: '2px solid #e2e8f0', fontSize: '15px'
              }}
              rows="5"
              placeholder="Explain why this ticket is being closed..."
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
            />

            {closeError && <p style={{ color: 'red', marginTop: 10 }}>{closeError}</p>}

            <div style={{ marginTop: 22, display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button onClick={handleSubmitReason} style={{
                padding: '14px 28px', background: '#dc2626',
                color: 'white', border: 'none', borderRadius: 12, fontWeight: 700
              }}>Continue</button>

              <button onClick={cancelClose} style={{
                padding: '14px 28px', background: '#64748b',
                color: 'white', border: 'none', borderRadius: 12
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="overlay" onClick={cancelClose}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: 20 }}>Confirm Close</h3>
            <p>This action cannot be undone.</p>
            <div style={{ marginTop: 20, display: 'flex', gap: 20, justifyContent: 'center' }}>
              <button onClick={confirmCloseTicket} style={{
                padding: '12px 30px',
                background: '#dc2626', borderRadius: '10px', color: 'white'
              }}>{loading ? "Closing..." : "Yes, Close"}</button>

              <button onClick={cancelClose} style={{
                padding: '12px 30px',
                background: '#64748b', borderRadius: '10px', color: 'white'
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showReviveReasonInput && (
        <div className="overlay" onClick={cancelRevive}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{
              margin: '0 0 20px',
              color: '#1e293b',
              fontSize: '1.5rem',
              fontWeight: 700
            }}>
              Revive Ticket #{ticket.ticketNumber}
            </h3>

            <textarea
              style={{
                width: '100%', padding: '14px', borderRadius: '12px',
                border: '2px solid #e2e8f0', fontSize: '15px'
              }}
              rows="5"
              placeholder="Why is this ticket being revived?"
              value={reviveReason}
              onChange={(e) => setReviveReason(e.target.value)}
            />

            {reviveError && <p style={{ color: 'red', marginTop: 10 }}>{reviveError}</p>}

            <div style={{ marginTop: 22, display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button onClick={handleSubmitReviveReason} style={{
                padding: '14px 28px', background: '#16a34a',
                color: 'white', border: 'none', borderRadius: 12, fontWeight: 700
              }}>Continue</button>

              <button onClick={cancelRevive} style={{
                padding: '14px 28px', background: '#64748b',
                color: 'white', border: 'none', borderRadius: 12
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {confirmReviveModal && (
        <div className="overlay" onClick={cancelRevive}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: 20 }}>Confirm Revive</h3>
            <p>The ticket will be reopened.</p>

            <div style={{ marginTop: 20, display: 'flex', gap: 20, justifyContent: 'center' }}>
              <button onClick={confirmReviveTicket} style={{
                padding: '12px 30px',
                background: '#16a34a', borderRadius: '10px', color: 'white'
              }}>{loading ? "Reviving..." : "Yes, Revive"}</button>

              <button onClick={cancelRevive} style={{
                padding: '12px 30px',
                background: '#64748b', borderRadius: '10px', color: 'white'
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default TicketDetails;
