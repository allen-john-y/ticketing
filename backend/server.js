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
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
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
    reopenedBy: String,
    reopenedAt: Date,
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

// ---------------------- Send Email ----------------------
const sendEmail = async (to, subject, bodyText, cc) => {
  try {
    const token = await getGraphToken();
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

    if (res.status === 202) {
      console.log(`📧 Sent to: ${Array.isArray(to) ? to.join(", ") : to} | CC: ${cc || "-"}`);
      return true;
    } else {
      console.error("❌ Graph send failed:", await res.text());
      return false;
    }
  } catch (err) {
    console.error("❌ Failed to send mail:", err.message);
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

const resetAzurePassword = async (userId) => {
  const token = await getAccessToken();
  const newPassword = Math.random().toString(36).slice(-10) + "A1!";
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
  if (!res.ok) throw new Error(`Azure reset failed: ${await res.text()}`);
  return newPassword;
};

// ---------------------- Routes ----------------------------

// Health Check
app.get("/", (req, res) => res.send("✅ Sandeza Helpdesk API Running"));

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

// Get Ticket by ID (Needed for TicketDetails page)
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


// Get Ticket by Ticket Number (clean URL support)
app.get("/tickets/number/:ticketNumber", async (req, res) => {
  try {
    const ticket = await Ticket.findOne({ ticketNumber: req.params.ticketNumber });
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    res.json(ticket);
  } catch (err) {
    console.error("Error fetching ticket by number:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});



// Create Ticket
app.post("/tickets", async (req, res) => {
  try {
    const { category, description, priority, userId, userName, userEmail } = req.body;
    if (!deptEmails[category]) return res.status(400).json({ error: "Invalid category" });

    ticketCounter++;
    const ticket = await Ticket.create({
      ticketNumber: ticketCounter,
      userId,
      userName,
      userEmail,
      category,
      description,
      priority,
      status: "Open",
    });

    const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const itHead = process.env.IT_HEAD_EMAIL;

    // Notify Ticket Creator
    await sendEmail(
      userEmail,
      `Ticket #${ticketCounter} Created`,
      `Hi ${userName},\n\nYour ticket has been created.\nTicket No: ${ticketCounter}\nCategory: ${category}\nPriority: ${priority}\nDescription: ${description}\nTime: ${nowIST}`
    );

    // Notify Department
    await sendEmail(
      deptEmails[category],
      `[TICKET #${ticketCounter}] ${category}`,
      `New Ticket #${ticketCounter}\nCreated By: ${userName}\nCategory: ${category}\nPriority: ${priority}\nDescription: ${description}\nTime: ${nowIST}`,
      itHead
    );

    // Auto Password Reset Handling
    if (category === "Password Reset") {
      try {
        const newPassword = await resetAzurePassword(userId);

        await sendEmail(
          userEmail,
          `[TICKET #${ticketCounter}] Password Reset Completed`,
          `Hi ${userName},\n\nYour password has been reset.\nNew Password: ${newPassword}\nTicket: ${ticketCounter}\nTime: ${nowIST}`,
          itHead
        );

        await sendEmail(
          deptEmails[category],
          `[TICKET #${ticketCounter}] Password Reset Completed`,
          `Password reset completed for ${userName} (${userEmail}).\nNew Password: ${newPassword}\nTime: ${nowIST}`,
          itHead
        );

        ticket.status = "Closed";
        ticket.closedBy = "IT Automation System";
        ticket.closedAt = new Date();
        await ticket.save();
      } catch (err) {
        console.error("Password reset failed:", err.message);
      }
    }

    res.status(201).json(ticket);
  } catch (err) {
    console.error("Error creating ticket:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Close Ticket
app.put("/tickets/:id/close", async (req, res) => {
  try {
    const { closedBy } = req.body;
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    ticket.status = "Closed";
    ticket.closedBy = closedBy || "IT Head";
    ticket.closedAt = new Date();
    await ticket.save();

    const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const itHead = process.env.IT_HEAD_EMAIL;

    await sendEmail(
      ticket.userEmail,
      `[TICKET #${ticket.ticketNumber}] Closed`,
      `Ticket #${ticket.ticketNumber} has been closed by ${closedBy}\nCategory: ${ticket.category}\nClosed On: ${nowIST}`,
      itHead
    );

    res.json({ message: "Ticket closed successfully" });
  } catch (err) {
    console.error("Error closing ticket:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Revive Ticket (instead of reopen)
app.put("/tickets/:id/revive", async (req, res) => {
  try {
    const { revivedBy } = req.body;
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    ticket.status = "Open";  // Revived means open again
    ticket.reopenedBy = revivedBy;
    ticket.reopenedAt = new Date();
    await ticket.save();

    const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const dept = deptEmails[ticket.category];
    const itHead = process.env.IT_HEAD_EMAIL;

    const body = `Ticket #${ticket.ticketNumber} (${ticket.category}) has been revived by ${revivedBy}\nTime: ${nowIST}`;

    await sendEmail(ticket.userEmail, `[TICKET #${ticket.ticketNumber}] Revived`, body, itHead);
    await sendEmail(dept, `[TICKET #${ticket.ticketNumber}] Revived`, body, itHead);

    res.json({ message: "Ticket revived successfully" });
  } catch (err) {
    console.error("Error reviving ticket:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});


// ---------------------- Start Server ----------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Server running on port ${PORT} (Graph Mail Enabled)`)
);
