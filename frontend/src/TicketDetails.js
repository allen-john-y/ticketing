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
      navigate('/', { state: { refresh: true } });

    } catch (err) {
      console.error(err);
      setModal({ open: false, action: null });
    }
    setLoading(false);
  };

  if (!ticket) return <p>Loading...</p>;

  return (
    <>
      {/* TICKET DETAILS UI */}
      <div style={{
        padding: '2rem',
        maxWidth: '600px',
        margin: '0 auto',
        background: 'white',
        borderRadius: '10px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        <h1>{ticket.category}</h1>
        <p><strong>Ticket Number:</strong> {ticket.ticketNumber}</p>
        <p><strong>Created by:</strong> {ticket.userName}</p>
        <p><strong>Email:</strong> {ticket.userEmail}</p>
        <p><strong>Description:</strong> {ticket.description}</p>
        <p><strong>Priority:</strong> {ticket.priority}</p>
        <p><strong>Status:</strong> {ticket.status}</p>

        {/* ADMIN CLOSE BUTTON */}
        {authority === 'admin' && ticket.status !== 'Closed' && (
          <button
            onClick={() => setModal({ open: true, action: "close" })}
            disabled={loading}
            style={{
              marginTop: '1rem',
              background: '#e74c3c',
              color: 'white',
              padding: '12px 24px',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
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
              marginTop: '1rem',
              background: '#27ae60',
              color: 'white',
              padding: '12px 24px',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              marginLeft: authority === 'admin' ? '10px' : '0'
            }}
          >
            {loading ? 'Reviving...' : 'Revive Ticket'}
          </button>
        )}
      </div>

      {/* CONFIRMATION MODAL */}
      {modal.open && (
        <div style={{
          position: "fixed",
          top: 0, left: 0,
          width: "100vw", height: "100vh",
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center"
        }}>
          <div style={{
            background: "white",
            padding: "30px",
            borderRadius: "10px",
            width: "350px",
            textAlign: "center",
            boxShadow: "0 4px 20px rgba(0,0,0,0.2)"
          }}>
            <h3 style={{ marginBottom: "20px" }}>
              {modal.action === "close"
                ? "Close this ticket?"
                : "Revive this ticket?"}
            </h3>

            <div style={{ display: "flex", justifyContent: "space-around" }}>
              <button
                onClick={confirmAction}
                style={{
                  padding: "10px 20px",
                  background: "#27ae60",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer"
                }}
              >
                Yes
              </button>

              <button
                onClick={() => setModal({ open: false, action: null })}
                style={{
                  padding: "10px 20px",
                  background: "#e74c3c",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer"
                }}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default TicketDetails;
