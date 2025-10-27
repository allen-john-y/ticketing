// ---------------------- Imports -------------------------
const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');
const https = require('https');
require('dotenv').config();

// ---------------------- App Setup ------------------------
const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(helmet());

// ---------------------- CORS ------------------------------
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);

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

// ---------------------- Nodemailer (Gmail) ----------------
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // SSL
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify((error) => {
  if (error) console.error('❌ Email config error:', error.message);
  else console.log('📧 Email transport ready');
});

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

// Health check
app.get('/', (req, res) => res.send('✅ Sandeza IT Ticket API – running'));

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

// Create new ticket
app.post('/tickets', async (req, res) => {
  try {
    const { category, description, priority, userId, userName, userEmail } = req.body;

    if (!deptEmails[category])
      return res.status(400).json({ error: 'Invalid category' });

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
      status: 'Open',
    });
    await ticket.save();

    // Confirmation to user
    if (userEmail) {
      const confirmMail = {
        from: `"IT Ticket Portal" <${process.env.EMAIL_USER}>`,
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
      };
      transporter
        .sendMail(confirmMail)
        .then(() => console.log(`📨 Confirmation email sent → ${userEmail}`))
        .catch((e) => console.error(`❌ Confirmation email failed → ${userEmail}:`, e.message));
    }

    // Department notification
    const toEmail = deptEmails[category];
    const deptMail = {
      from: `"IT Ticket Portal" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: `[TICKET #${ticketCounter}] ${category}`,
      text: `
New Support Ticket #${ticketCounter}

Created by: ${userName}
Category: ${category}
Priority: ${priority}
Description: ${description}

Reply to resolve.
      `.trim(),
    };
    transporter
      .sendMail(deptMail)
      .then(() => console.log(`📨 Dept email sent → ${toEmail}`))
      .catch((e) => console.error('❌ Dept email failed:', e.message));

    // Password reset auto-handling
    if (category === 'Password Reset') {
      try {
        const newPassword = await resetAzurePassword(userId);

        const userMail = {
          from: `"IT Ticket Portal" <${process.env.EMAIL_USER}>`,
          to: userEmail,
          subject: `Your password has been reset`,
          text: `Hello ${userName},\n\nYour password has been reset.\nNew Password: ${newPassword}\nPlease change it on next login.\n\nRegards,\nIT Support Team`,
        };
        await transporter.sendMail(userMail);
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
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
