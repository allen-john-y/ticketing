// ---------------------- Imports -------------------------
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');
const https = require('https');
const { Resend } = require('resend');
require('dotenv').config();

// ---------------------- App Setup ------------------------
const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(helmet());

// ---------------------- CORS ------------------------------
const allowedOrigins = [
  'https://ticketing-psi-tawny.vercel.app', // production frontend
  'http://localhost:3000', // local testing
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log(`❌ Blocked by CORS: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  })
);

app.options('*', cors());

// ---------------------- Rate Limiter ----------------------
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use('/tickets', limiter);

// ---------------------- MongoDB ---------------------------
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
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
  },
  { timestamps: true }
);
const Ticket = mongoose.model('Ticket', ticketSchema);

// ---------------------- Counter ---------------------------
let ticketCounter = 0;
const loadCounter = async () => {
  try {
    const last = await Ticket.findOne().sort({ ticketNumber: -1 });
    ticketCounter = last ? last.ticketNumber : 0;
    console.log('🎫 Ticket counter loaded:', ticketCounter);
  } catch (err) {
    console.error('Error loading counter:', err.message);
  }
};
loadCounter();

// ---------------------- Resend Setup ----------------------
const resend = new Resend(process.env.RESEND_API_KEY);

// ---------------------- Department Emails -----------------
const deptEmails = {
  'Password Reset': 'allenj@sandeza-inc.com',
  'Admin Access': 'vigneshm@sandeza-inc.com',
  'Payroll Issue': 'kishorekumars@sandeza-inc.com',
  'Expense Reimbursement': 'kishorekumars@sandeza-inc.com',
  'Leave Request': 'allenj@sandeza-inc.com',
  'Employee Onboarding': 'allenj@sandeza-inc.com',
};

// ---------------------- Azure Helpers ---------------------
const getAccessToken = async () => {
  const url = `${process.env.AZURE_AUTHORITY}/oauth2/v2.0/token`;
  const params = new URLSearchParams();
  params.append('client_id', process.env.AZURE_CLIENT_ID);
  params.append('scope', 'https://graph.microsoft.com/.default');
  params.append('client_secret', process.env.AZURE_CLIENT_SECRET);
  params.append('grant_type', 'client_credentials');

  const res = await fetch(url, { method: 'POST', body: params });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data.access_token;
};

const resetAzurePassword = async (userId) => {
  const token = await getAccessToken();
  const newPassword = Math.random().toString(36).slice(-10) + 'A1!';

  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${userId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
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
app.get('/', (req, res) => {
  res.send('✅ Sandeza IT Ticket API – Running on Railway (Resend Email)');
});

// Get all tickets
app.get('/tickets', async (req, res) => {
  try {
    const { userId } = req.query;
    const filter = userId ? { userId } : {};
    const tickets = await Ticket.find(filter).sort({ ticketNumber: 1 });
    res.json(tickets);
  } catch (err) {
    console.error('Error fetching tickets:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single ticket
app.get('/tickets/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json(ticket);
  } catch (err) {
    console.error('Error fetching ticket:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new ticket
app.post('/tickets', async (req, res) => {
  try {
    const { category, description, priority, userId, userName, userEmail } = req.body;

    if (!deptEmails[category])
      return res.status(400).json({ error: 'Invalid category' });

    ticketCounter++;
    const ticket = new Ticket({
      ticketNumber: ticketCounter,
      userId,
      userName,
      userEmail,
      category,
      description,
      priority,
      status: 'Open',
    });
    await ticket.save();

    // ---------------------- Email Logic (Resend) ----------------------
    const fromEmail = process.env.EMAIL_USER;

    // Confirmation email to user
    if (userEmail) {
      await resend.emails.send({
        from: `"IT Ticket Portal" <${fromEmail}>`,
        to: userEmail,
        subject: `Your ticket #${ticketCounter} has been created`,
        text: `
Hello ${userName},

Your support ticket has been successfully created.

Ticket Details:
- Ticket Number: ${ticketCounter}
- Category: ${category}
- Priority: ${priority}
- Description: ${description}

Our IT team will get back to you soon.

Regards,
IT Support Team
        `.trim(),
      });
      console.log(`📨 Confirmation email sent → ${userEmail}`);
    }

    // Department notification
    const deptTo = deptEmails[category];
    await resend.emails.send({
      from: `"IT Ticket Portal" <${fromEmail}>`,
      to: deptTo,
      subject: `[TICKET #${ticketCounter}] ${category}`,
      text: `
New Support Ticket #${ticketCounter}

Created by: ${userName}
Category: ${category}
Priority: ${priority}
Description: ${description}

Reply to resolve.
      `.trim(),
    });
    console.log(`📨 Dept email sent → ${deptTo}`);

    // Auto password reset (if needed)
    if (category === 'Password Reset') {
      try {
        const newPassword = await resetAzurePassword(userId);
        await resend.emails.send({
          from: `"IT Ticket Portal" <${fromEmail}>`,
          to: userEmail,
          subject: `Your password has been reset`,
          text: `
Hello ${userName},

Your password has been reset.
New Password: ${newPassword}
Please change it on next login.

Regards,
IT Support Team
          `.trim(),
        });
        console.log(`✅ Password mail sent → ${userEmail}`);

        ticket.status = 'Closed';
        await ticket.save();
        console.log(`Ticket #${ticketCounter} auto-closed`);
      } catch (err) {
        console.error(`❌ Password reset failed for ${userId}:`, err.message);
      }
    }

    res.status(201).json(ticket);
  } catch (err) {
    console.error('❌ Error creating ticket:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------- Start Server ----------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () =>
  console.log(`🚀 Server running on port ${PORT} (Railway + Resend)`)
);
