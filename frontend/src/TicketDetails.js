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

  // Modal & reason states
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [confirmModal, setConfirmModal] = useState(false);

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

  // Handle "Submit Reason" → Open final confirmation
  const handleSubmitReason = () => {
    if (!closeReason.trim()) {
      alert("Please provide a reason for closing the ticket.");
      return;
    }
    setShowReasonInput(false);
    setConfirmModal(true);
  };

  // Final close action with reason
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
      console.error("Failed to close ticket:", err);
      alert("Failed to close ticket. Please try again.");
    }
    setLoading(false);
  };

  // Cancel everything
  const cancelClose = () => {
    setShowReasonInput(false);
    setConfirmModal(false);
    setCloseReason('');
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
      `}</style>

      {/* BACK BUTTON */}
      <div style={{ padding: "1rem", maxWidth: 600, margin: "0 auto" }}>
        <button
          onClick={() => navigate('/')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            background: '#fff',
            cursor: 'pointer',
            fontWeight: 600,
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
          }}
        >
          ← Back to Home
        </button>
      </div>

      {/* TICKET CARD */}
      <div style={{
        padding: '2rem',
        maxWidth: '600px',
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

        {/* ADMIN: Close Ticket Button */}
        {authority === 'admin' && ticket.status !== 'Closed' && (
          <button
            onClick={() => setShowReasonInput(true)}
            style={{
              marginTop: '1.5rem',
              background: '#dc2626',
              color: 'white',
              padding: '14px 28px',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(220,38,38,0.3)'
            }}
          >
            Close Ticket
          </button>
        )}

        {/* REVIVE BUTTON (for closed tickets) */}
        {ticket.status === 'Closed' && (
          <button
            onClick={() => {
              if (window.confirm("Are you sure you want to revive this ticket?")) {
                setLoading(true);
                axios.put(`${backendBase}/tickets/${id}/revive`)
                  .then(() => navigate('/', { state: { refresh: true } }))
                  .catch(() => alert("Failed to revive ticket"))
                  .finally(() => setLoading(false));
              }
            }}
            disabled={loading}
            style={{
              marginTop: '1.5rem',
              background: '#16a34a',
              color: 'white',
              padding: '14px 28px',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {loading ? 'Reviving...' : 'Revive Ticket'}
          </button>
        )}
      </div>

      {/* STEP 1: Reason Input Modal */}
      {showReasonInput && (
        <div className="overlay" onClick={cancelClose}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', color: '#1e293b' }}>
              Reason for Closing Ticket #{ticket.ticketNumber}
            </h3>
            <textarea
              className="reason-input"
              rows="5"
              placeholder="Please explain why this ticket is being closed..."
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              autoFocus
            />
            <div style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={handleSubmitReason}
                style={{
                  padding: '10px 20px',
                  background: '#16a34a',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Submit Reason
              </button>
              <button
                onClick={cancelClose}
                style={{
                  padding: '10px 20px',
                  background: '#64748b',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Final Confirmation Modal */}
      {confirmModal && (
        <div className="overlay" onClick={cancelClose}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', color: '#dc2626' }}>
              Close Ticket #{ticket.ticketNumber}?
            </h3>
            <p style={{ color: '#475569', marginBottom: 24 }}>
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button
                onClick={confirmCloseTicket}
                disabled={loading}
                style={{
                  padding: '12px 28px',
                  background: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                {loading ? 'Closing...' : 'Yes, Close It'}
              </button>
              <button
                onClick={cancelClose}
                style={{
                  padding: '12px 28px',
                  background: '#64748b',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer'
                }}
              >
                No, Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default TicketDetails;