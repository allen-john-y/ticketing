// server.js
// Full file — Option A (HTML email templates, send to category head on all creations)

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

    // "on behalf" flow
    onBehalf: { type: String }, // 'Self' or 'Other'
    onBehalfEmail: { type: String }, // when onBehalf === 'Other'
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

// ---------------------- Send Email (HTML capable) ----------------------
/*
  sendEmail(to, subject, bodyText, cc, bodyHtmlOptional)
  - to: string or array of strings
  - cc: string or array of strings (optional)
  - bodyText: plain-text fallback
  - bodyHtmlOptional: HTML string (if provided, will be used as HTML body)
*/
const sendEmail = async (to, subject, bodyText, cc, bodyHtmlOptional) => {
  try {
    // normalize recipients for logging
    const norm = (addr) => {
      if (!addr) return [];
      if (Array.isArray(addr)) return addr;
      return [addr];
    };
    const toLog = norm(to).join(", ");
    const ccLog = norm(cc).join(", ") || "(none)";

    console.log("\n📧 [MAIL] Preparing email...");
    console.log("To:", toLog);
    console.log("CC:", ccLog);
    console.log("Subject:", subject);

    const token = await getGraphToken();
    console.log("🔵 [MAIL] Sending email via Microsoft Graph...");

    const normalizeForGraph = (addr) => {
      if (!addr) return [];
      if (Array.isArray(addr)) return addr.map((a) => ({ emailAddress: { address: a } }));
      return [{ emailAddress: { address: addr } }];
    };

    // Build message content; prefer HTML if provided
    const message = {
      subject,
      body: {
        contentType: bodyHtmlOptional ? "HTML" : "Text",
        content: bodyHtmlOptional ? bodyHtmlOptional : bodyText,
      },
      toRecipients: normalizeForGraph(to),
      ccRecipients: normalizeForGraph(cc),
    };

    const mailBody = {
      message,
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
      console.log(`✅ [MAIL] Email sent SUCCESSFULLY to: ${toLog}`);
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

// ---------------------- Helpers for HTML emails ----------------------
const renderTicketHtml = ({ ticket, title, actionButtonText, actionButtonUrl }) => {
  // escape minimal to avoid accidental HTML injection; in practice sanitize better
  const esc = (s) => (s ? String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "");
  const now = new Date(ticket.createdAt || Date.now()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  return `
    <html>
      <body style="font-family:Segoe UI, Roboto, Arial, sans-serif; color:#0f172a; line-height:1.45;">
        <div style="max-width:700px;margin:0 auto;padding:20px;border:1px solid #e6eef9;border-radius:8px;">
          <h2 style="margin:0 0 12px;color:#0b61b5;font-weight:800;">${esc(title)}</h2>
          <div style="padding:12px 14px;background:#f8fafc;border-radius:6px;border:1px solid #e6eef9;">
            <div style="margin-bottom:8px;"><strong>Ticket No:</strong> ${esc(ticket.ticketNumber)}</div>
            <div style="margin-bottom:8px;"><strong>Category:</strong> ${esc(ticket.category)}</div>
            <div style="margin-bottom:8px;"><strong>Priority:</strong> ${esc(ticket.priority)}</div>
            <div style="margin-bottom:8px;"><strong>Created By:</strong> ${esc(ticket.userName)} (${esc(ticket.userEmail)})</div>
            ${ticket.onBehalf ? `<div style="margin-bottom:8px;"><strong>On Behalf:</strong> ${esc(ticket.onBehalf)} ${ticket.onBehalfEmail ? `(${esc(ticket.onBehalfEmail)})` : ""}</div>` : ""}
            ${ticket.deliveryEmail ? `<div style="margin-bottom:8px;"><strong>Delivery Email:</strong> ${esc(ticket.deliveryEmail)}</div>` : ""}
            <div style="margin-bottom:8px;"><strong>Created On:</strong> ${esc(now)}</div>
          </div>

          <h3 style="margin:18px 0 8px;color:#0b61b5;font-weight:700;">Description</h3>
          <div style="padding:12px;background:#ffffff;border-radius:6px;border:1px solid #eef2f7;white-space:pre-wrap;">${esc(ticket.description)}</div>

          ${actionButtonUrl ? `
            <div style="text-align:center;margin-top:18px;">
              <a href="${actionButtonUrl}" style="display:inline-block;background:#0b61b5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700;">
                ${esc(actionButtonText || "Open Ticket")}
              </a>
            </div>
          ` : ""}

          <hr style="margin:20px 0;border:none;border-top:1px solid #eef2f7;" />

          <div style="font-size:13px;color:#475569;">
            <div style="margin-bottom:6px;">This is an auto-generated email. Do not reply to this message.</div>
            <div>If you have questions about this ticket, please sign in at <a href="https://ticketing-psi-tawny.vercel.app">ticketing portal</a>.</div>
          </div>
        </div>
      </body>
    </html>
  `;
};

// ---------------------- Routes ----------------------------

// Health Check
app.get("/", (req, res) => res.send("Sandeza Helpdesk API Running"));

// ---------------------- Verify User ----------------------
app.post("/verify-user", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ message: "Email is required" });
    }

    const token = await getGraphToken();
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

// ---------------------- Tickets: GET ----------------------
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

// ---------------------- Create Ticket ----------------------
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

    // Defensive validation: If Password Reset + Self -> deliveryEmail required
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
      if (!deliveryEmail || !deliveryEmail.trim()) {
        return res.status(400).json({ message: "Delivery email is required when requesting for other user." });
      }
    }

    // Decide initial status: only Password Reset requires "Pending"
    const initialStatus = category === "Password Reset" ? "Pending" : "Open";

    ticketCounter++;
    const ticket = await Ticket.create({
      ticketNumber: ticketCounter,
      userId,
      userName,
      userEmail,
      category,
      description,
      priority,
      status: initialStatus,
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

    // Prepare creator email (HTML)
    const prodUrl = "https://ticketing-psi-tawny.vercel.app";
    const ticketLink = `${prodUrl}/ticket/${ticket._id}`;

    const creatorTitle = initialStatus === "Pending" ? `Ticket #${ticketCounter} Created (Pending Approval)` : `Ticket #${ticketCounter} Created`;
    const creatorHtml = renderTicketHtml({
      ticket,
      title: creatorTitle,
      actionButtonText: "View Ticket",
      actionButtonUrl: ticketLink
    });

    const creatorPlain = initialStatus === "Pending" ?
      `Hi ${userName},\n\nYour ticket has been created and is currently PENDING department approval.\n\nTicket No: ${ticketCounter}\nCategory: ${category}\nPriority: ${priority}\nDescription: ${description}\nTime: ${nowIST}\n\nYou will be notified when the ticket is processed.\n\nThis is an auto-generated email. Do not reply.` :
      `Hi ${userName},\n\nYour ticket has been created.\n\nTicket No: ${ticketCounter}\nCategory: ${category}\nPriority: ${priority}\nDescription: ${description}\nTime: ${nowIST}\n\nThis ticket is now in the queue and will be processed normally.\n\nThis is an auto-generated email. Do not reply.`;

    // Notify the ticket creator
    await sendEmail(
      userEmail,
      `Ticket #${ticketCounter} Created`,
      creatorPlain,
      itHead,
      creatorHtml
    );

    // -------------------------
    // IMPORTANT: Notify category head for ALL categories (your request)
    // -------------------------
    const headEmail = deptEmails[category];
    if (headEmail) {
      // Head email subject and HTML: different wording if Password Reset (action required)
      const headTitle = category === "Password Reset"
        ? `[ACTION REQUIRED] Ticket #${ticketCounter} - ${category}`
        : `New Ticket #${ticketCounter} - ${category}`;

      // For heads, add special instruction when Password Reset (approve/reject)
      const headHtml = renderTicketHtml({
        ticket,
        title: headTitle,
        actionButtonText: category === "Password Reset" ? "Review & Approve" : "Open Ticket",
        actionButtonUrl: ticketLink
      });

      const headPlain = category === "Password Reset" ?
        `New ticket requires action: Ticket #${ticketCounter}\nCategory: ${category}\nCreated By: ${userName} (${userEmail})\nDelivery Email: ${ticket.deliveryEmail || "—"}\n\nOpen: ${ticketLink}\n\nThis is an auto-generated email. Do not reply.` :
        `New ticket created: Ticket #${ticketCounter}\nCategory: ${category}\nCreated By: ${userName} (${userEmail})\n\nOpen: ${ticketLink}\n\nThis is an auto-generated email. Do not reply.`;

      await sendEmail(
        headEmail,
        headTitle,
        headPlain,
        itHead,
        headHtml
      );
    } else {
      console.warn(`⚠️ No department head configured for category: ${category}`);
    }

    res.status(201).json(ticket);
  } catch (err) {
    console.error("Error creating ticket:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------------- Approve endpoint ----------------------
app.post("/tickets/:id/approve", async (req, res) => {
  try {
    const { approvedBy, note } = req.body;
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    if (ticket.status === "Closed") {
      return res.status(400).json({ message: "Ticket is already closed" });
    }

    // SAFETY: Only allow approve flow for Password Reset category
    if (ticket.category !== "Password Reset") {
      return res.status(400).json({ message: "Approval is only allowed for Password Reset tickets." });
    }

    const userIdentifier = ticket.onBehalfEmail || ticket.userId || ticket.userEmail;
    if (!userIdentifier) {
      return res.status(400).json({ message: "No user identifier available to reset password" });
    }

    // Perform Azure password reset
    let newPassword;
    try {
      newPassword = await resetAzurePassword(userIdentifier);
    } catch (err) {
      console.error("Password reset failed during approve:", err.message);
      return res.status(500).json({ message: "Password reset failed", error: err.message });
    }

    // Update ticket history and close it
    const now = new Date();

    ticket.history.push({
      action: "approved",
      by: approvedBy || "Department Head",
      at: now,
      reason: note || "Approved and password reset performed",
    });

    // Mark closed and add close history entry
    ticket.status = "Closed";
    ticket.closedBy = approvedBy || "Department Head";
    ticket.closeReason = note ? `Approved: ${note}` : "Approved by Department Head";
    ticket.closedAt = now;

    ticket.history.push({
      action: "closed",
      by: ticket.closedBy,
      at: now,
      reason: ticket.closeReason,
    });

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

    const userBodyPlain = `Hi ${ticket.userName},

Your password reset request (Ticket #${ticket.ticketNumber}) has been approved by ${ticket.closedBy} on ${nowIST}.
The new temporary password is:

${newPassword}

Please sign in and change your password immediately (the password is set to force change on next sign-in).

Ticket: #${ticket.ticketNumber}
Category: ${ticket.category}

If you did not request this, please contact IT immediately.

This is an auto-generated email. Do not reply.`;

    const userHtml = `
      <html><body style="font-family:Segoe UI, Roboto, Arial, sans-serif;">
        <h2 style="color:#0b61b5;font-weight:800;">Password Reset Approved</h2>
        <p>Hi ${ticket.userName},</p>
        <p>Your password reset request (Ticket #${ticket.ticketNumber}) has been <strong>approved</strong> by ${ticket.closedBy} on ${nowIST}.</p>
        <div style="padding:12px;background:#f1f5f9;border-radius:6px;font-family:monospace;">${newPassword}</div>
        <p>Please sign in and change your password immediately (force change on next sign-in).</p>
        <p>This is an auto-generated email. Do not reply.</p>
      </body></html>
    `;

    // Notify requestor primary email
    await sendEmail(ticket.userEmail, `[TICKET #${ticket.ticketNumber}] Password Reset Approved`, userBodyPlain, itHead, userHtml);

    // Notify deliveryEmail if provided and different
    if (ticket.deliveryEmail && ticket.deliveryEmail.trim() && ticket.deliveryEmail.trim() !== ticket.userEmail.trim()) {
      await sendEmail(ticket.deliveryEmail.trim(), `[TICKET #${ticket.ticketNumber}] Password Reset Approved`, userBodyPlain, itHead, userHtml);
    }

    // Notify department (confirmation)
    const deptBodyPlain = `Ticket #${ticket.ticketNumber} has been approved and password reset performed by ${ticket.closedBy} on ${nowIST}.

Affected user: ${ticket.onBehalfEmail || ticket.userEmail}
Ticket link: https://ticketing-psi-tawny.vercel.app/ticket/${ticket._id}

This is an auto-generated email. Do not reply.`;

    await sendEmail(deptEmails[ticket.category], `[CLOSED] Ticket #${ticket.ticketNumber} - ${ticket.category}`, deptBodyPlain, itHead);

    console.log(`Ticket #${ticket.ticketNumber} approved by ${ticket.closedBy} and auto-closed.`);

    res.json({
      message: "Ticket approved and password reset performed sucessfully",
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

// ---------------------- Reject endpoint ----------------------
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

    ticket.status = "Closed";
    ticket.closedBy = rejectedBy || "Department Head";
    ticket.closeReason = reason ? `Rejected: ${reason}` : "Rejected by Department Head";
    ticket.closedAt = now;

    ticket.history.push({
      action: "closed",
      by: ticket.closedBy,
      at: now,
      reason: ticket.closeReason,
    });

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

    const userBodyPlain = `Hi ${ticket.userName},

Your request (Ticket #${ticket.ticketNumber}) has been reviewed by ${ticket.closedBy} on ${nowIST} and has been rejected.

Reason:
${reason || "No reason provided."}

Ticket: #${ticket.ticketNumber}
Category: ${ticket.category}

If you believe this is in error, please contact the department or raise a new ticket.

This is an auto-generated email. Do not reply.`;

    const userHtml = `
      <html><body style="font-family:Segoe UI, Roboto, Arial, sans-serif;">
        <h2 style="color:#0b61b5;font-weight:800;">Request Rejected</h2>
        <p>Hi ${ticket.userName},</p>
        <p>Your request (Ticket #${ticket.ticketNumber}) has been reviewed by <strong>${ticket.closedBy}</strong> on ${nowIST} and has been <strong>rejected</strong>.</p>
        <p><strong>Reason:</strong><br/>${reason || "No reason provided."}</p>
        <p>This is an auto-generated email. Do not reply.</p>
      </body></html>
    `;

    await sendEmail(ticket.userEmail, `[TICKET #${ticket.ticketNumber}] Request Rejected`, userBodyPlain, itHead, userHtml);

    const deptBodyPlain = `Ticket #${ticket.ticketNumber} has been rejected by ${ticket.closedBy} on ${nowIST}.

Ticket link: https://ticketing-psi-tawny.vercel.app/ticket/${ticket._id}

This is an auto-generated email. Do not reply.`;

    await sendEmail(deptEmails[ticket.category], `[CLOSED] Ticket #${ticket.ticketNumber} - Rejected`, deptBodyPlain, itHead);

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

// ---------------------- Close Ticket ----------------------
app.put("/tickets/:id/close", async (req, res) => {
  try {
    const { closedBy, closeReason } = req.body;

    if (!closeReason || closeReason.trim() === "") {
      return res.status(400).json({ message: "Close reason is required" });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    if (ticket.status === "Closed") {
      return res.status(400).json({ message: "Ticket is already closed" });
    }

    const now = new Date();

    ticket.history.push({
      action: "closed",
      by: closedBy?.trim() || "IT Head",
      at: now,
      reason: closeReason.trim(),
    });

    ticket.status = "Closed";
    ticket.closedBy = closedBy?.trim() || "IT Head";
    ticket.closeReason = closeReason.trim();
    ticket.closedAt = now;

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

    const emailHtml = `
      <html><body style="font-family:Segoe UI, Roboto, Arial, sans-serif;">
        <h2 style="color:#0b61b5;font-weight:800;">TICKET #${ticket.ticketNumber} - Closed</h2>
        <div style="padding:12px;background:#f8fafc;border-radius:6px;">
          <div><strong>Category:</strong> ${ticket.category}</div>
          <div><strong>Priority:</strong> ${ticket.priority}</div>
          <div><strong>Created by:</strong> ${ticket.userName} (${ticket.userEmail})</div>
          <div><strong>Closed by:</strong> ${ticket.closedBy}</div>
          <div><strong>Closed on:</strong> ${nowIST}</div>
          <div style="margin-top:8px;"><strong>Reason:</strong><br/>${ticket.closeReason}</div>
        </div>
        <p style="font-size:13px;color:#475569;">This is an auto-generated email. Do not reply.</p>
      </body></html>
    `;

    const emailPlain = `TICKET #${ticket.ticketNumber} HAS BEEN CLOSED

Category: ${ticket.category}
Priority: ${ticket.priority}
Created by: ${ticket.userName} (${ticket.userEmail})
Closed by: ${ticket.closedBy}
Closed on: ${nowIST}

Reason:
${ticket.closeReason}

This is an auto-generated email. Do not reply.`;

    await sendEmail(ticket.userEmail, `[TICKET #${ticket.ticketNumber}] Closed`, emailPlain, itHead, emailHtml);
    await sendEmail(deptEmails[ticket.category], `[CLOSED] Ticket #${ticket.ticketNumber} - ${ticket.category}`, emailPlain, itHead, emailHtml);

    console.log(`Ticket #${ticket.ticketNumber} closed by ${ticket.closedBy}`);

    res.json({
      message: "Ticket closed successfully",
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
    console.error("Close ticket error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ---------------------- Revive Ticket ----------------------
app.put("/tickets/:id/revive", async (req, res) => {
  try {
    const { revivedBy, reviveReason } = req.body;

    if (!reviveReason || reviveReason.trim() === "") {
      return res.status(400).json({ message: "Revive reason is required" });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (ticket.status !== "Closed") {
      return res.status(400).json({ message: "Only closed tickets can be revived" });
    }

    const now = new Date();

    ticket.history.push({
      action: "revived",
      by: revivedBy?.trim() || "Unknown User",
      at: now,
      reason: reviveReason.trim(),
    });

    ticket.status = "Open";
    ticket.reopenedBy = revivedBy?.trim() || "Unknown User";
    ticket.reopenedAt = now;
    ticket.reviveReason = reviveReason.trim();

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

    const dept = deptEmails[ticket.category] || "helpdesk@sandeza-inc.com";
    const itHead = process.env.IT_HEAD_EMAIL;

    const emailHtml = `
      <html><body style="font-family:Segoe UI, Roboto, Arial, sans-serif;">
        <h2 style="color:#0b61b5;font-weight:800;">TICKET #${ticket.ticketNumber} - Revived</h2>
        <div style="padding:12px;background:#f8fafc;border-radius:6px;">
          <div><strong>Category:</strong> ${ticket.category}</div>
          <div><strong>Priority:</strong> ${ticket.priority}</div>
          <div><strong>Created by:</strong> ${ticket.userName} (${ticket.userEmail})</div>
          <div><strong>Revived by:</strong> ${ticket.reopenedBy}</div>
          <div><strong>Revived on:</strong> ${nowIST}</div>
          <div style="margin-top:8px;"><strong>Reason:</strong><br/>${ticket.reviveReason}</div>
        </div>
        <p style="font-size:13px;color:#475569;">This is an auto-generated email. Do not reply.</p>
      </body></html>
    `;

    const emailPlain = `TICKET #${ticket.ticketNumber} HAS BEEN REVIVED (Reopened)

Category: ${ticket.category}
Priority: ${ticket.priority}
Created by: ${ticket.userName} (${ticket.userEmail})
Revived by: ${ticket.reopenedBy}
Revived on: ${nowIST}

Reason:
${ticket.reviveReason}

This is an auto-generated email. Do not reply.`;

    await sendEmail(ticket.userEmail, `[TICKET #${ticket.ticketNumber}] Revived`, emailPlain, itHead, emailHtml);
    await sendEmail(dept, `[REVIVED] Ticket #${ticket.ticketNumber} - ${ticket.category}`, emailPlain, itHead, emailHtml);

    console.log(`Ticket #${ticket.ticketNumber} revived by ${ticket.reopenedBy}`);

    res.json({
      message: "Ticket revived successfully",
      ticket: {
        _id: ticket._id,
        status: "Open",
        reopenedBy: ticket.reopenedBy,
        reviveReason: ticket.reviveReason,
        reopenedAt: ticket.reopenedAt,
        history: ticket.history,
      },
    });
  } catch (err) {
    console.error("Revive ticket error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// ---------------------- Start Server ----------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`Server running on port ${PORT} (Full History Enabled)`)
);
