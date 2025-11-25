// ---------------------- Imports -------------------------
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fetch = require("node-fetch");
const https = require("https");
require("dotenv").config();

// ---------------------- App Setup ------------------------
const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(helmet());

// ---------------------- CORS ------------------------------
const allowedOrigins = [
  "https://ticketing-psi-tawny.vercel.app",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log(`Blocked by CORS: ${origin}`);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);
app.options("*", cors());

// ---------------------- Rate Limiter ----------------------
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use("/tickets", limiter);

// ---------------------- MongoDB ---------------------------
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
};
connectDB();

// ---------------------- Schema ----------------------------
// (keep your existing schema; I assume it already has deliveryEmail/onBehalf fields)
const ticketSchema = new mongoose.Schema(
  {
    ticketNumber: { type: Number, unique: true },
    userId: String,
    userName: String,
    userEmail: String,
    category: String,
    description: String,
    priority: String,
    status: String,
    closedBy: String,
    closeReason: String,
    reviveReason: String,
    closedAt: Date,
    reopenedBy: String,
    reopenedAt: Date,
    onBehalf: { type: String },
    onBehalfEmail: { type: String },
    deliveryEmail: { type: String },
    history: [
      {
        action: { type: String, enum: ["created", "closed", "revived", "approved", "rejected"] },
        by: String,
        at: { type: Date, default: Date.now },
        reason: String,
      },
    ],
  },
  { timestamps: true }
);
const Ticket = mongoose.model("Ticket", ticketSchema);

// ---------------------- Counter ---------------------------
let ticketCounter = 0;
const loadCounter = async () => {
  try {
    const last = await Ticket.findOne().sort({ ticketNumber: -1 });
    ticketCounter = last ? last.ticketNumber : 0;
    console.log("Ticket counter loaded:", ticketCounter);
  } catch (err) {
    console.error("Error loading counter:", err.message);
  }
};
loadCounter();

// ---------------------- Department Emails -----------------
const deptEmails = {
  "Password Reset": "allenj@sandeza-inc.com",
  "Admin Access": "vigneshm@sandeza-inc.com",
  "Payroll Issue": "kishorekumars@sandeza-inc.com",
  "Expense Reimbursement": "kishorekumars@sandeza-inc.com",
  "Leave Request": "allenj@sandeza-inc.com",
  "Employee Onboarding": "allenj@sandeza-inc.com",
};

// ---------------------- Azure Graph Token ----------------------
const getGraphToken = async () => {
  console.log("🔵 [MAIL] Getting Microsoft Graph token...");

  const tenantId = process.env.AZURE_TENANT_ID;
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams();
  params.append("client_id", process.env.AZURE_CLIENT_ID);
  params.append("scope", "https://graph.microsoft.com/.default");
  params.append("client_secret", process.env.AZURE_CLIENT_SECRET);
  params.append("grant_type", "client_credentials");

  const res = await fetch(url, { method: "POST", body: params });
  const data = await res.json();

  if (!res.ok || !data.access_token) {
    console.log("❌ [MAIL] Token FAILED:", data);
    throw new Error(`Token failed: ${JSON.stringify(data)}`);
  }

  console.log("✅ [MAIL] Token received");
  return data.access_token;
};

// ---------------------- Send Email ----------------------
const sendEmail = async (to, subject, bodyText, cc) => {
  try {
    console.log(`\n📧 [MAIL] Preparing email...`);
    console.log("To:", to);
    console.log("CC:", cc);
    console.log("Subject:", subject);

    const token = await getGraphToken();
    console.log("🔵 [MAIL] Sending email via Microsoft Graph...");

    const normalize = (addr) => {
      if (!addr) return [];
      if (Array.isArray(addr))
        return addr.map((a) => ({ emailAddress: { address: a } }));
      return [{ emailAddress: { address: addr } }];
    };

    const mailBody = {
      message: {
        subject,
        body: { contentType: "Text", content: bodyText.trim() },
        toRecipients: normalize(to),
        ccRecipients: normalize(cc),
      },
      saveToSentItems: "true",
    };

    const sender = process.env.AZURE_SENDER_EMAIL || "helpdesk@sandeza-inc.com";

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(mailBody),
      }
    );

    const responseText = await res.text();

    console.log("🔍 [MAIL] Graph Response Status:", res.status);
    console.log("🔍 [MAIL] Graph Response Body:", responseText);

    if (res.status === 202) {
      console.log(`✅ [MAIL] Email sent SUCCESSFULLY to: ${Array.isArray(to) ? to.join(", ") : to}`);
      return true;
    } else {
      console.log("❌ [MAIL] Email FAILED");
      return false;
    }
  } catch (err) {
    console.error("❌ [MAIL] Error sending email:", err.message);
    return false;
  }
};

// ---------------------- Azure Password Reset ----------------------
const getAccessToken = async () => {
  const url = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`;
  const params = new URLSearchParams();
  params.append("client_id", process.env.AZURE_CLIENT_ID);
  params.append("scope", "https://graph.microsoft.com/.default");
  params.append("client_secret", process.env.AZURE_CLIENT_SECRET);
  params.append("grant_type", "client_credentials");
  const res = await fetch(url, { method: "POST", body: params });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data.access_token;
};

const resetAzurePassword = async (userIdentifier) => {
  const token = await getAccessToken();
  const newPassword = Math.random().toString(36).slice(-10) + "A1!";
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userIdentifier)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      passwordProfile: {
        forceChangePasswordNextSignIn: true,
        password: newPassword,
      },
    }),
    agent: new https.Agent({ rejectUnauthorized: false }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Azure reset failed: ${body}`);
  }
  return newPassword;
};

// ---------------------- Routes ----------------------------

// Health Check
app.get("/", (req, res) => res.send("Sandeza Helpdesk API Running"));

// ---------------------- NEW: Verify User endpoint ----------------------
// POST /verify-user
// body: { email: "target@company.com" }
// returns: { exists: true/false, displayName?: string, mail?: string }
app.post("/verify-user", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ message: "Email is required" });
    }

    const token = await getGraphToken();

    // Query Graph for user by UPN (email). If not found, Graph returns 404.
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}?$select=displayName,mail,userPrincipalName`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (resp.status === 404) {
      return res.json({ exists: false });
    }

    if (!resp.ok) {
      const text = await resp.text();
      console.error('Graph verify error:', resp.status, text);
      return res.status(500).json({ message: 'Graph lookup failed' });
    }

    const data = await resp.json();
    const canonicalMail = data.mail || data.userPrincipalName || email;
    const displayName = data.displayName || null;

    return res.json({ exists: true, displayName, mail: canonicalMail });
  } catch (err) {
    console.error('Verify-user error:', err);
    return res.status(500).json({ message: 'Server error during verification' });
  }
});

// ---------------------- (rest of your existing routes) ----------------------
// Get Tickets, Get Ticket by ID, Create Ticket, Approve, Reject, Close, Revive
// (You already have these routes implemented; keep them as-is.)
// Make sure your existing code for /tickets POST sets status: "Pending" as per previous change.


// Get Tickets
app.get("/tickets", async (req, res) => {
  try {
    const filter = req.query.userId ? { userId: req.query.userId } : {};
    const tickets = await Ticket.find(filter).sort({ ticketNumber: 1 });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Get Ticket by ID
app.get("/tickets/:id", async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    res.json(ticket);
  } catch (err) {
    console.error("Error fetching ticket:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Create Ticket (ensure this uses status: "Pending" and accepts deliveryEmail/onBehalfEmail)
app.post("/tickets", async (req, res) => {
  try {
    const {
      category,
      description,
      priority,
      userId,
      userName,
      userEmail,
      onBehalf,
      onBehalfEmail,
      deliveryEmail,
    } = req.body;
    if (!deptEmails[category]) return res.status(400).json({ error: "Invalid category" });

    // Defensive validation: If Password Reset + Self -> deliveryEmail (alternative) is required
    if (category === "Password Reset" && (onBehalf === "Self" || !onBehalf) ) {
      if (!deliveryEmail || !deliveryEmail.trim()) {
        return res.status(400).json({ message: "Alternative delivery email is required for self password reset." });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(deliveryEmail.trim())) {
        return res.status(400).json({ message: "Alternative delivery email is not valid." });
      }
    }

    // If Password Reset + Other -> ensure onBehalfEmail present (frontend verifies existence)
    if (category === "Password Reset" && onBehalf === "Other") {
      if (!onBehalfEmail || !onBehalfEmail.trim()) {
        return res.status(400).json({ message: "On-behalf email is required for other password reset." });
      }
      // deliveryEmail still required
      if (!deliveryEmail || !deliveryEmail.trim()) {
        return res.status(400).json({ message: "Delivery email is required when requesting for other user." });
      }
    }

    ticketCounter++;
    const ticket = await Ticket.create({
      ticketNumber: ticketCounter,
      userId,
      userName,
      userEmail,
      category,
      description,
      priority,
      status: "Pending",
      onBehalf: onBehalf || "Self",
      onBehalfEmail: onBehalfEmail || "",
      deliveryEmail: deliveryEmail || "",
      history: [
        {
          action: "created",
          by: userName,
          at: new Date(),
          reason: null,
        },
      ],
    });

    const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const itHead = process.env.IT_HEAD_EMAIL;

    await sendEmail(
      userEmail,
      `Ticket #${ticketCounter} Created`,
      `Hi ${userName},\n\nYour ticket has been created and is currently PENDING department approval.\n\nTicket No: ${ticketCounter}\nCategory: ${category}\nPriority: ${priority}\nDescription: ${description}\nTime: ${nowIST}\n\nIf approved, the new password (for password reset) will be delivered to both your primary email and the alternative email you provided.\n\nYou will be notified when the ticket is processed.`,
      itHead
    );

    const prodUrl = "https://ticketing-psi-tawny.vercel.app";
    const ticketLink = `${prodUrl}/ticket/${ticket._id}`;

    const deptMessage = `
New Ticket #${ticketCounter}
Created By: ${userName} (${userEmail})
Category: ${category}
Priority: ${priority}
Description: ${description}
Time: ${nowIST}
Delivery Email: ${ticket.deliveryEmail || '—'}

To review and take action, open this link in your browser (please sign in with your admin account):
${ticketLink}

If you click Approve, the requested password reset will be performed and the new password will be sent to both the requester and the alternative email provided. The ticket will be closed automatically.
If you click Reject, the requester will be notified and the ticket will be closed.
    `.trim();

    await sendEmail(
      deptEmails[category],
      `[TICKET #${ticketCounter}] ${category} - Action Required`,
      deptMessage,
      itHead
    );

    res.status(201).json(ticket);
  } catch (err) {
    console.error("Error creating ticket:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Approve endpoint (unchanged; ensure new behavior same as before)
app.post("/tickets/:id/approve", async (req, res) => {
  try {
    const { approvedBy, note } = req.body;
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    if (ticket.status === "Closed") {
      return res.status(400).json({ message: "Ticket is already closed" });
    }

    const userIdentifier = ticket.onBehalfEmail || ticket.userId || ticket.userEmail;
    if (!userIdentifier) {
      return res.status(400).json({ message: "No user identifier available to reset password" });
    }

    let newPassword;
    try {
      newPassword = await resetAzurePassword(userIdentifier);
    } catch (err) {
      console.error("Password reset failed during approve:", err.message);
      return res.status(500).json({ message: "Password reset failed", error: err.message });
    }

    const now = new Date();

    ticket.history.push({
      action: "approved",
      by: approvedBy || "Department Head",
      at: now,
      reason: note || "Approved and password reset performed",
    });

    ticket.status = "Approved";
    ticket.closedBy = approvedBy || "Department Head";
    ticket.closeReason = note ? `Approved: ${note}` : "Approved by Department Head";
    ticket.closedAt = now;

    ticket.history.push({
      action: "closed",
      by: approvedBy || "Department Head",
      at: now,
      reason: ticket.closeReason,
    });
    ticket.status = "Closed";

    await ticket.save();

    const nowIST = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const itHead = process.env.IT_HEAD_EMAIL;

    const userBody = `
Hi ${ticket.userName},

Your password reset request (Ticket #${ticket.ticketNumber}) has been approved by ${ticket.closedBy} on ${nowIST}.
The new temporary password is:

${newPassword}

Please sign in and change your password immediately (the password is set to force change on next sign-in).

Ticket: #${ticket.ticketNumber}
Category: ${ticket.category}

If you did not request this, please contact IT immediately.
    `.trim();

    await sendEmail(ticket.userEmail, `[TICKET #${ticket.ticketNumber}] Password Reset Approved`, userBody, itHead);

    if (ticket.deliveryEmail && ticket.deliveryEmail.trim() && ticket.deliveryEmail.trim() !== ticket.userEmail.trim()) {
      await sendEmail(ticket.deliveryEmail.trim(), `[TICKET #${ticket.ticketNumber}] Password Reset Approved`, userBody, itHead);
    }

    const deptBody = `
Ticket #${ticket.ticketNumber} has been approved and password reset performed by ${ticket.closedBy} on ${nowIST}.

Affected user: ${ticket.onBehalfEmail || ticket.userEmail}
Ticket link: https://ticketing-psi-tawny.vercel.app/ticket/${ticket._id}
    `.trim();

    await sendEmail(deptEmails[ticket.category], `[CLOSED] Ticket #${ticket.ticketNumber} - ${ticket.category}`, deptBody, itHead);

    console.log(`Ticket #${ticket.ticketNumber} approved by ${ticket.closedBy} and auto-closed.`);

    res.json({
      message: "Ticket approved and password reset performed",
      ticket: {
        _id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        closedBy: ticket.closedBy,
        closeReason: ticket.closeReason,
        closedAt: ticket.closedAt,
        history: ticket.history,
      },
      newPassword,
    });
  } catch (err) {
    console.error("Approve error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Reject endpoint (unchanged)
app.post("/tickets/:id/reject", async (req, res) => {
  try {
    const { rejectedBy, reason } = req.body;
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    if (ticket.status === "Closed") {
      return res.status(400).json({ message: "Ticket is already closed" });
    }

    const now = new Date();

    ticket.history.push({
      action: "rejected",
      by: rejectedBy || "Department Head",
      at: now,
      reason: reason || "Rejected by Department Head",
    });

    ticket.status = "Rejected";
    ticket.closedBy = rejectedBy || "Department Head";
    ticket.closeReason = reason ? `Rejected: ${reason}` : "Rejected by Department Head";
    ticket.closedAt = now;

    ticket.history.push({
      action: "closed",
      by: ticket.closedBy,
      at: now,
      reason: ticket.closeReason,
    });
    ticket.status = "Closed";

    await ticket.save();

    const nowIST = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const itHead = process.env.IT_HEAD_EMAIL;

    const userBody = `
Hi ${ticket.userName},

Your request (Ticket #${ticket.ticketNumber}) has been reviewed by ${ticket.closedBy} on ${nowIST} and has been rejected.

Reason:
${reason || "No reason provided."}

Ticket: #${ticket.ticketNumber}
Category: ${ticket.category}

If you believe this is in error, please contact the department or raise a new ticket.
    `.trim();

    await sendEmail(ticket.userEmail, `[TICKET #${ticket.ticketNumber}] Request Rejected`, userBody, itHead);

    const deptBody = `
Ticket #${ticket.ticketNumber} has been rejected by ${ticket.closedBy} on ${nowIST}.

Ticket link: https://ticketing-psi-tawny.vercel.app/ticket/${ticket._id}
    `.trim();

    await sendEmail(deptEmails[ticket.category], `[CLOSED] Ticket #${ticket.ticketNumber} - Rejected`, deptBody, itHead);

    console.log(`Ticket #${ticket.ticketNumber} rejected by ${ticket.closedBy} and closed.`);

    res.json({
      message: "Ticket rejected and closed",
      ticket: {
        _id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        closedBy: ticket.closedBy,
        closeReason: ticket.closeReason,
        closedAt: ticket.closedAt,
        history: ticket.history,
      },
    });
  } catch (err) {
    console.error("Reject error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// (keep your close/revive endpoints unchanged as in your existing server.js)

// ---------------------- Start Server ----------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`Server running on port ${PORT} (Full History Enabled)`)
);
