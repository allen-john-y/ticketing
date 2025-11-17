import React, { useState, useEffect } from "react";
import {
  MsalProvider,
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
  useMsal
} from "@azure/msal-react";
import { PublicClientApplication } from "@azure/msal-browser";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";

import Login from "./Login";
import Home from "./Home";
import CreateTicket from "./CreateTicket";
import TicketDetails from "./TicketDetails";
import Dashboard from "./Dashboard";

const pca = new PublicClientApplication({
  auth: {
    clientId: "6541d73a-dbbd-4f74-9465-38a0eb03ec6b",
    authority:
      "https://login.microsoftonline.com/11909ab3-5ecc-48e0-b898-acf7203a1ad7",
    redirectUri: "https://ticketing-psi-tawny.vercel.app/"
  },
  cache: { cacheLocation: "localStorage" }
});

function Header({ logout }) {
  const { instance, accounts } = useMsal();
  const user = accounts[0];

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showFullProfile, setShowFullProfile] = useState(false);
  const [graphUser, setGraphUser] = useState(null);

  // 🔥 Fetch full Azure AD profile
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = await instance.acquireTokenSilent({
          scopes: ["User.Read"],
          account: accounts[0]
        });

        const res = await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${token.accessToken}` }
        });

        const data = await res.json();
        setGraphUser(data);
      } catch (err) {
        console.error("Graph API Error:", err);
      }
    };

    fetchProfile();
  }, [accounts, instance]);

  return (
    <>
      {/* HEADER */}
      <header
        style={{
          background: "white",
          padding: "1rem 2rem",
          boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <h1 style={{ margin: 0 }}>🏢 SANDEZA INC</h1>
          <h2 style={{ margin: 0, color: "#555", fontSize: "1rem" }}>
            IT Ticket Portal
          </h2>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {/* VIEW PROFILE BUTTON */}
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            style={{
              background: "#3498db",
              color: "white",
              border: "none",
              padding: "0.5rem 1rem",
              borderRadius: "5px",
              cursor: "pointer"
            }}
          >
            👤 View Profile
          </button>

          {/* LOGOUT */}
          <button
            onClick={logout}
            style={{
              background: "#e74c3c",
              color: "white",
              border: "none",
              padding: "0.5rem 1rem",
              borderRadius: "5px",
              cursor: "pointer"
            }}
          >
            🚪 Logout
          </button>
        </div>
      </header>

      {/* SMALL POPUP */}
      {showProfileMenu && graphUser && (
        <div
          style={{
            position: "absolute",
            top: "80px",
            right: "30px",
            background: "white",
            padding: "1rem",
            borderRadius: "10px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            width: "230px",
            zIndex: 999
          }}
        >
          <p style={{ margin: 0, fontWeight: "bold" }}>
            {graphUser.displayName}
          </p>
          <p style={{ margin: "5px 0", fontSize: "0.9rem", color: "#333" }}>
            {graphUser.mail || graphUser.userPrincipalName}
          </p>

          <button
            style={{
              width: "100%",
              padding: "0.5rem",
              background: "#3498db",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer"
            }}
            onClick={() => {
              setShowFullProfile(true);
              setShowProfileMenu(false);
            }}
          >
            View Full Profile
          </button>
        </div>
      )}

      {/* FULL PROFILE MODAL */}
      {showFullProfile && graphUser && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999
          }}
        >
          <div
            style={{
              width: "450px",
              background: "white",
              padding: "2rem",
              borderRadius: "12px",
              position: "relative"
            }}
          >
            <button
              onClick={() => setShowFullProfile(false)}
              style={{
                position: "absolute",
                top: "10px",
                right: "15px",
                fontSize: "1.4rem",
                border: "none",
                background: "transparent",
                cursor: "pointer"
              }}
            >
              ✖
            </button>

            <h2 style={{ marginBottom: "1rem" }}>User Profile</h2>

            <p><strong>Full Name:</strong> {graphUser.displayName}</p>
            <p><strong>Email:</strong> {graphUser.mail || graphUser.userPrincipalName}</p>
            <p><strong>Mobile Phone:</strong> {graphUser.mobilePhone || "N/A"}</p>
            <p><strong>Job Title:</strong> {graphUser.jobTitle || "N/A"}</p>
            <p><strong>Department:</strong> {graphUser.department || "N/A"}</p>
            <p><strong>Employee ID:</strong> {graphUser.employeeId || "N/A"}</p>

            <h3 style={{ marginTop: "1.5rem" }}>Address</h3>
            <p><strong>Street:</strong> {graphUser.streetAddress || "N/A"}</p>
            <p><strong>State:</strong> {graphUser.state || "N/A"}</p>
            <p><strong>Pincode:</strong> {graphUser.postalCode || "N/A"}</p>
          </div>
        </div>
      )}
    </>
  );
}

function AppContent() {
  const { instance } = useMsal();

  const handleLogout = () =>
    instance.logoutRedirect({ postLogoutRedirectUri: "/" });

  const handleLogin = async () => {
    try {
      await instance.loginRedirect({
        scopes: ["User.Read"],
        prompt: "select_account"
      });
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  return (
    <Router>
      <AuthenticatedTemplate>
        <Header logout={handleLogout} />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<CreateTicket />} />
          <Route path="/ticket/:id" element={<TicketDetails />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </AuthenticatedTemplate>

      <UnauthenticatedTemplate>
        <Login login={handleLogin} />
      </UnauthenticatedTemplate>
    </Router>
  );
}

function App() {
  return (
    <MsalProvider instance={pca}>
      <AppContent />
    </MsalProvider>
  );
}

export default App;
