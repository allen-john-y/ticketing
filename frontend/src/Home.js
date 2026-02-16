import React, { useState, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';

function Home() {
  const { accounts, instance } = useMsal();
  const location = useLocation();
  const navigate = useNavigate();

  const [tickets, setTickets] = useState([]);
  const [authority, setAuthority] = useState('basic');
  const [userName, setUserName] = useState('User');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showMyTickets, setShowMyTickets] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState(null);

  useEffect(() => {
    if (location.state?.refresh) {
      setRefreshKey(prev => prev + 1);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  useEffect(() => {
    const fetchData = async () => {
      if (!accounts[0]) return;

      let tokenResponse;
      try {
        tokenResponse = await instance.acquireTokenSilent({
          scopes: ['User.Read', 'GroupMember.Read.All'],
          account: accounts[0]
        });
      } catch (err) {
        tokenResponse = await instance.acquireTokenPopup({
          scopes: ['User.Read', 'GroupMember.Read.All']
        });
      }

      try {
        const userRes = await axios.get(
          'https://graph.microsoft.com/v1.0/me',
          { headers: { Authorization: `Bearer ${tokenResponse.accessToken}` } }
        );

        setUserName(userRes.data.displayName || 'User');

        // Profile photo
        try {
          const photoRes = await axios.get(
            'https://graph.microsoft.com/v1.0/me/photo/$value',
            {
              headers: { Authorization: `Bearer ${tokenResponse.accessToken}` },
              responseType: 'arraybuffer'
            }
          );

          const b64 = btoa(
            new Uint8Array(photoRes.data)
              .reduce((data, byte) => data + String.fromCharCode(byte), '')
          );

          setProfilePhoto(
            `data:${photoRes.headers['content-type']};base64,${b64}`
          );
        } catch {}

        const groupsRes = await axios.get(
          'https://graph.microsoft.com/v1.0/me/memberOf',
          { headers: { Authorization: `Bearer ${tokenResponse.accessToken}` } }
        );

        const groups = groupsRes.data.value.map(g => g.displayName);
        const isAdmin = groups.includes('Helpdesk_Admin');
        setAuthority(isAdmin ? 'admin' : 'basic');

        const backendBase = "https://ticketing-hn59.onrender.com";

        const endpoint = isAdmin
          ? `${backendBase}/tickets`
          : `${backendBase}/tickets?userId=${accounts[0].localAccountId}`;

        const ticketsRes = await axios.get(endpoint);
        setTickets(ticketsRes.data.reverse());

      } catch (err) {
        console.error(err);
      }
    };

    fetchData();

  }, [accounts, instance, refreshKey]);

  const filteredTickets =
    authority === 'admin' && showMyTickets
      ? tickets.filter(t => t.userId === accounts[0]?.localAccountId)
      : tickets;

  const openTickets =
    filteredTickets.filter(t => t.status === 'Open' || t.status === 'Pending');

  const closedTickets =
    filteredTickets.filter(t => t.status === 'Closed');

  const waitingTickets =
    filteredTickets.filter(t => t.status === 'Waiting for approval');

  const highPriority =
    filteredTickets.filter(t => t.priority === 'High' && t.status !== 'Closed');

  const initials =
    (userName || 'U')
      .split(' ')
      .map(x => x[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

  // Pie Chart
  const PieChart = ({ data, colors, size = 180 }) => {

    const total = data.reduce((sum, d) => sum + d.value, 0);

    if (total === 0) return <div>No data</div>;

    let currentAngle = -90;

    const segments = data.map((d, i) => {

      const angle = (d.value / total) * 360;

      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;

      currentAngle = endAngle;

      const radius = size / 2;

      const x1 = radius + radius * Math.cos(startAngle * Math.PI / 180);
      const y1 = radius + radius * Math.sin(startAngle * Math.PI / 180);

      const x2 = radius + radius * Math.cos(endAngle * Math.PI / 180);
      const y2 = radius + radius * Math.sin(endAngle * Math.PI / 180);

      const largeArc = angle > 180 ? 1 : 0;

      return (
        <path
          key={i}
          d={`M${radius},${radius} L${x1},${y1}
          A${radius},${radius} 0 ${largeArc},1 ${x2},${y2} Z`}
          fill={colors[i]}
        />
      );
    });

    return (
      <svg width={size} height={size}>
        {segments}
      </svg>
    );
  };

  const statusData = [
    { label: 'Open', value: openTickets.length },
    { label: 'Waiting', value: waitingTickets.length },
    { label: 'Closed', value: closedTickets.length }
  ];

  const statusColors = ['#e98404', '#002060', '#10b981'];

  return (

    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>

      {/* SIDEBAR */}
      <div className="sidebar">

        <div className="sidebar-profile">

          <div className="avatar">
            {profilePhoto
              ? <img src={profilePhoto} alt="" />
              : initials}
          </div>

          <div className="sidebar-text">
            <div>{userName}</div>
            <div style={{ fontSize: 12 }}>
              {authority}
            </div>
          </div>

        </div>

        <Link to="/create" className="sidebar-item create">
          <span>+</span>
          <span className="sidebar-text">Create Ticket</span>
        </Link>

        <Link to="/tickets" className="sidebar-item">
          <span>📋</span>
          <span className="sidebar-text">View Tickets</span>
        </Link>

      </div>


      {/* MAIN CONTENT */}
      <div className="main-container">

        {authority === 'admin' && (

          <div>
            <label>
              <input
                type="checkbox"
                checked={showMyTickets}
                onChange={() => setShowMyTickets(!showMyTickets)}
              />
              Show My Tickets Only
            </label>
          </div>

        )}

        <div className="stats-grid">

          <div onClick={() => navigate('/tickets')}>
            Open: {openTickets.length}
          </div>

          <div onClick={() => navigate('/tickets')}>
            Waiting: {waitingTickets.length}
          </div>

          <div>
            Closed: {closedTickets.length}
          </div>

          <div>
            High Priority: {highPriority.length}
          </div>

        </div>

        <PieChart data={statusData} colors={statusColors} />

      </div>


      {/* CSS */}
      <style>{`

      .sidebar {
        position: fixed;
        left: 0;
        top: 0;
        width: 70px;
        height: 100vh;
        background: linear-gradient(#002060,#003380);
        transition: width .3s;
        overflow:hidden;
      }

      .sidebar:hover {
        width:240px;
      }

      .sidebar-profile {
        display:flex;
        padding:20px;
        color:white;
        gap:10px;
      }

      .sidebar-item {
        display:flex;
        padding:15px;
        color:white;
        text-decoration:none;
        gap:10px;
      }

      .sidebar-item.create {
        background:#e98404;
      }

      .sidebar-text {
        opacity:0;
        transition:.3s;
      }

      .sidebar:hover .sidebar-text {
        opacity:1;
      }

      .main-container {
        margin-left:70px;
        padding:30px;
      }

      .sidebar:hover ~ .main-container {
        margin-left:240px;
      }

      .avatar img {
        width:40px;
        border-radius:50%;
      }

      `}</style>

    </div>
  );
}

export default Home;
