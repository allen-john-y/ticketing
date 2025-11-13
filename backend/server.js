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
    closedAt: Date,
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

// ---------------------- Azure Graph: Token + Mail ----------------------
const getGraphToken = async () => {
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
    throw new Error(`Failed to get token: ${JSON.stringify(data)}`);
  }
  return data.access_token;
};

/**
 * sendEmail
 * @param {string|string[]} to - single email or array of to addresses
 * @param {string} subject
 * @param {string} bodyText - plain text body (you may put HTML if you want and set contentType to "HTML")
 * @param {string|string[]} [cc] - optional cc
 */
const sendEmail = async (to, subject, bodyText, cc) => {
  try {
    const token = await getGraphToken();

    // normalize recipients
    const norm = (addr) => {
      if (!addr) return [];
      if (Array.isArray(addr)) return addr.map(a => ({ emailAddress: { address: a } }));
      return [{ emailAddress: { address: addr } }];
    };

    const mailBody = {
      message: {
        subject: subject,
        body: {
          contentType: "Text",
          content: bodyText.trim(),
        },
        toRecipients: norm(to),
        ccRecipients: norm(cc),
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

    if (res.status === 202) {
      console.log(`✅ SENT via Graph → to: ${Array.isArray(to) ? to.join(",") : to} cc: ${cc || ""}`);
      return { success: true };
    } else {
      const errText = await res.text();
      console.error(`❌ Graph send failed → ${Array.isArray(to) ? to.join(",") : to}:`, errText);
      return { success: false, error: errText };
    }
  } catch (err) {
    console.error(`❌ Failed to send → ${Array.isArray(to) ? to.join(",") : to}:`, err.message);
    return { success: false, error: err.message };
  }
};

// ---------------------- Azure Helpers (Password Reset) ---------------------
const getAccessToken = async () => {
  // kept for other Azure operations (like user update). Uses AZURE_AUTHORITY env.
  const url = `${process.env.AZURE_AUTHORITY || `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`}/oauth2/v2.0/token`;
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

const resetAzurePassword = async (userId) => {
  const token = await getAccessToken();
  const newPassword = Math.random().toString(36).slice(-10) + "A1!"; // simple generator

  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}`, {
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
    const err = await res.json();
    throw new Error(`Azure reset failed: ${JSON.stringify(err)}`);
  }
  return newPassword;
};

// ---------------------- Routes ----------------------------

// Health check
app.get("/", (req, res) => {
  res.send("Sandeza IT Ticket API – Running (Azure Graph Mail)");
});

// Get all tickets
app.get("/tickets", async (req, res) => {
  try {
    const { userId } = req.query;
    const filter = userId ? { userId } : {};
    const tickets = await Ticket.find(filter).sort({ ticketNumber: 1 });
    res.json(tickets);
  } catch (err) {
    console.error("Error fetching tickets:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Close ticket (manual close)
app.put("/tickets/:id/close", async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    const closedBy = req.body.closedBy || "IT Head"; // frontend should send closer's name
    ticket.status = "Closed";
    ticket.closedBy = closedBy;
    ticket.closedAt = new Date();
    await ticket.save();

    // notify creator and closer
    const to = ticket.userEmail;
    const subject = `[Ticket #${ticket.ticketNumber}] Closed by ${closedBy}`;
    const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const body = `Ticket #${ticket.ticketNumber} has been closed by ${closedBy}\nCategory: ${ticket.category}\nClosed On (IST): ${nowIST}`;

    await sendEmail(to, subject, body, ticket.closedByEmail || undefined);

    console.log(`Ticket ${req.params.id} closed`);
    res.json({ message: "Ticket closed successfully" });
  } catch (error) {
    console.error("Error in /tickets/:id/close:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get single ticket
app.get("/tickets/:id", async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    res.json(ticket);
  } catch (err) {
    console.error("Error fetching ticket:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Create new ticket
app.post("/tickets", async (req, res) => {
  try {
    const { category, description, priority, userId, userName, userEmail } = req.body;

    if (!deptEmails[category])
      return res.status(400).json({ error: "Invalid category" });

    // Increment counter
    ticketCounter++;
    const ticket = new Ticket({
      ticketNumber: ticketCounter,
      userId,
      userName,
      userEmail,
      category,
      description,
      priority,
      status: "Open",
    });
    await ticket.save();

    // Prepare common info
    const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const subjectUser = `Your ticket #${ticketCounter} has been created`;
    const bodyUser = `
Hello ${userName},

Your support ticket has been successfully created.

Ticket Details:
- Ticket Number: ${ticketCounter}
- Category: ${category}
- Priority: ${priority}
- Description: ${description}
- Created On (IST): ${nowIST}

Our IT team will get back to you soon.

Regards,
IT Support Team
    `;

    // Send confirmation to user
    if (userEmail) {
      await sendEmail(userEmail, subjectUser, bodyUser);
    }

    // Notify department + CC IT Head
    const deptTo = deptEmails[category];
    const subjectDept = `[TICKET #${ticketCounter}] ${category}`;
    const bodyDept = `
New Support Ticket #${ticketCounter}

Created by: ${userName}
Category: ${category}
Priority: ${priority}
Description: ${description}
Created On (IST): ${nowIST}

Reply to resolve.
    `;

    // If you have an IT head email in env, use it as CC
    const itHeadEmail = process.env.IT_HEAD_EMAIL || undefined;
    await sendEmail(deptTo, subjectDept, bodyDept, itHeadEmail);

    // Auto password reset for specific category
    if (category === "Password Reset") {
      try {
        const newPassword = await resetAzurePassword(userId);

        const subjectPwd = `[TICKET #${ticketCounter}] Password Reset Completed`;
        const bodyPwd = `
Hello ${userName},

Your password has been reset successfully.

Ticket Number: ${ticketCounter}
New Password: ${newPassword}
Reset By: IT Automation System
Timestamp (IST): ${nowIST}

(This ticket will be automatically closed after password reset.)
        `;

        // Send email to user and CC IT head (single call using cc)
        await sendEmail(userEmail, subjectPwd, bodyPwd, itHeadEmail);

        // Also send to dept (IT team) notifying reset
        const bodyDeptPwd = `
Password reset completed for Ticket #${ticketCounter}
User: ${userName} (${userEmail})
New Password: ${newPassword}
Timestamp (IST): ${nowIST}
        `;
        await sendEmail(deptTo, `[TICKET #${ticketCounter}] Password Reset Notification`, bodyDeptPwd, itHeadEmail);

        // Auto-close ticket only after mails sent
        ticket.status = "Closed";
        ticket.closedBy = "IT Automation System";
        ticket.closedAt = new Date();
        await ticket.save();
        console.log(`Ticket #${ticketCounter} auto-closed after password reset`);
      } catch (err) {
        console.error(`Password reset failed for ${userId}:`, err.message);
        // leave ticket open for manual handling
      }
    }

    res.status(201).json(ticket);
  } catch (err) {
    console.error("Error creating ticket:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------------- Start Server ----------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`Server running on port ${PORT} (Azure Graph Mail Enabled)`)
);
