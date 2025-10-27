

// const express = require('express');
// const mongoose = require('mongoose');
// const nodemailer = require('nodemailer');
// const cors = require('cors');
// require('dotenv').config();

// const app = express();
// app.use(express.json());

// // ✅ CORS: Allow local frontend ports for development
// app.use(cors({
//   origin: ['http://localhost:3000'], // remove other unused ports
//   credentials: true
// }));

// // --------------------
// // ✅ MongoDB Connection
// // --------------------
// const connectDB = async () => {
//   try {
//     await mongoose.connect(process.env.MONGO_URI, {
//       useNewUrlParser: true,
//       useUnifiedTopology: true,
//     });
//     console.log('✅ MongoDB connected');
//   } catch (err) {
//     console.error('❌ MongoDB connection error:', err);
//     process.exit(1);
//   }
// };
// connectDB();

// // --------------------
// // ✅ Ticket Schema
// // --------------------
// const ticketSchema = new mongoose.Schema({
//   userId: String,
//   category: String,
//   description: String,
//   priority: String,
//   status: String,
// });
// const Ticket = mongoose.model('Ticket', ticketSchema);

// // --------------------
// // ✅ Email Transporter (Gmail for local dev)
// // --------------------
// const transporter = nodemailer.createTransport({
//   service: 'gmail', // Use Gmail SMTP
//   auth: {
//     user: process.env.EMAIL_USER, // must be Gmail account
//     pass: process.env.EMAIL_PASS, // must be App Password
//   },
// });

// // Test email configuration
// transporter.verify((error, success) => {
//   if (error) console.error('❌ Email config error:', error);
//   else console.log('✅ Email config OK');
// });

// // --------------------
// // ✅ Department Emails
// // --------------------
// const deptEmails = {
//   'Password Reset': 'vigneshm@sandeza-inc.com',
//   'Admin Access': 'vigneshm@sandeza-inc.com',
//   'Payroll Issue': 'kishorekumars@sandeza-inc.com',
//   'Expense Reimbursement': 'kishorekumars@sandeza-inc.com',
//   'Leave Request': 'allenj@sandeza-inc.com',
//   'Employee Onboarding': 'allenj@sandeza-inc.com',
// };

// // --------------------
// // ✅ Routes
// // --------------------

// // GET all tickets or filter by userId
// app.get('/tickets', async (req, res) => {
//   try {
//     const { userId } = req.query;
//     const filter = userId ? { userId } : {};
//     const tickets = await Ticket.find(filter);
//     res.json(tickets);
//   } catch (err) {
//     console.error('❌ Error fetching tickets:', err);
//     res.status(500).send('Server error');
//   }
// });

// app.post('/tickets', async (req, res) => {
//   try {
//     console.log('📝 Creating ticket...');
//     const ticket = new Ticket({
//       ...req.body,
//       status: 'Open',
//       createdAt: new Date().toISOString()
//     });
//     await ticket.save();

//     // Send email asynchronously
//     const email = deptEmails[req.body.category] || process.env.EMAIL_USER;
//     transporter.sendMail({
//       from: process.env.EMAIL_USER,
//       to: email,
//       subject: `New Ticket: ${req.body.category} (Priority: ${req.body.priority})`,
//       text: `Description: ${req.body.description}\nFrom User ID: ${req.body.userId || 'N/A'}`,
//     }).then(() => console.log('✅ Email sent'))
//       .catch(err => console.error('⚠️ Email failed to send:', err.message));

//     res.status(201).json(ticket);
//   } catch (err) {
//     console.error('❌ Error creating ticket:', err);
//     res.status(500).send('Server error');
//   }
// });


// // --------------------
// // ✅ Start Server
// // --------------------
// // Listen on all interfaces for local network access
// app.listen(5000, '0.0.0.0', () => console.log('🚀 Backend running on port 5000'));

/********************************************************************
 *  Sandeza Inc – IT Ticket Portal – Production-ready server.js
 *  ------------------------------------------------------------
 *  • Runs on Render (port from env)
 *  • CORS for Vercel front-end
 *  • Optional security middle-wares
 ********************************************************************/

/********************************************************************
 *  Sandeza Inc – IT Ticket Portal – Production-ready server.js
 *  ------------------------------------------------------------
 *  • Runs on Render (port from env)
 *  • CORS for Vercel front-end
 *  • Optional security middle-wares
 ********************************************************************/

const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const cors = require('cors');
const fetch = require('node-fetch');   // Node < 22
require('dotenv').config();

// ---- Optional security -------------------------------------------------
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// ---- App ----------------------------------------------------------------
const app = express();

// Basic JSON body parser
app.use(express.json());

// Helmet (secure HTTP headers)
app.use(helmet());

// Rate-limit (prevent brute-force on /tickets)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,                 // limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/tickets', limiter);

// CORS – allow only your Vercel front-end
app.use(
  cors({
    origin: 'https://ticketing-psi-tawny.vercel.app',
    credentials: true,
  })
);

// ---- MongoDB ------------------------------------------------------------
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};
connectDB();

// ---- Ticket Schema ------------------------------------------------------
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

// ---- Global Ticket Counter -----------------------------------------------
let ticketCounter = 0;
const loadCounter = async () => {
  try {
    const last = await Ticket.findOne().sort({ ticketNumber: -1 });
    ticketCounter = last ? last.ticketNumber : 0;
    console.log('Ticket counter loaded:', ticketCounter);
  } catch (err) {
    console.error('Error loading ticket counter:', err);
  }
};
loadCounter();

// ---- Nodemailer ---------------------------------------------------------
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
transporter.verify((error) => {
  if (error) console.error('Email config error:', error);
  else console.log('Email config OK');
});

// ---- Department Emails ---------------------------------------------------
const deptEmails = {
  'Password Reset': 'allenj@sandeza-inc.com',
  'Admin Access': 'vigneshm@sandeza-inc.com',
  'Payroll Issue': 'kishorekumars@sandeza-inc.com',
  'Expense Reimbursement': 'kishorekumars@sandeza-inc.com',
  'Leave Request': 'allenj@sandeza-inc.com',
  'Employee Onboarding': 'allenj@sandeza-inc.com',
};

// ---- Azure Graph Helpers ------------------------------------------------
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
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Azure reset failed: ${JSON.stringify(err)}`);
  }
  return newPassword;
};

// --------------------- API ROUTES ---------------------------------------

// GET all tickets (optionally filtered by userId)
app.get('/tickets', async (req, res) => {
  try {
    const { userId } = req.query;
    const filter = userId ? { userId } : {};
    const tickets = await Ticket.find(filter).sort({ ticketNumber: 1 });
    res.json(tickets);
  } catch (err) {
    console.error('Error fetching tickets:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET single ticket
app.get('/tickets/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json(ticket);
  } catch (err) {
    console.error('Error fetching ticket:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST – create ticket
app.post('/tickets', async (req, res) => {
  try {
    const { category, description, priority, userId, userName, userEmail } =
      req.body;

    if (!deptEmails[category])
      return res.status(400).json({ error: 'Invalid category' });

    // ---- Increment global counter ------------------------------------
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

    // ---- Confirmation email to creator -------------------------------
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
        .then(() => console.log(`Confirmation email → ${userEmail}`))
        .catch((e) =>
          console.error(`Confirmation email failed → ${userEmail}:`, e.message)
        );
    }

    // ---- Email to department -----------------------------------------
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
      .then(() => console.log(`Dept email → ${toEmail}`))
      .catch((e) => console.error('Dept email failed:', e.message));

    // ---- Password-Reset automation ------------------------------------
    let newPasswordToSend = null;
    if (category === 'Password Reset') {
      try {
        const newPassword = await resetAzurePassword(userId);
        newPasswordToSend = newPassword;

        // Notify user
        if (userEmail) {
          const userMail = {
            from: `"IT Ticket Portal" <${process.env.EMAIL_USER}>`,
            to: userEmail,
            subject: `Your password has been reset`,
            text: `Hello ${userName},\n\nYour password has been reset.\nNew Password: ${newPassword}\nPlease change it on next login.\n\nYour ticket #${ticketCounter} has been closed.\n\nRegards,\nIT Support Team`,
          };
          await transporter.sendMail(userMail);
          console.log(`Password sent → ${userEmail}`);
        }

        // Notify IT
        const itMail = {
          from: `"IT Ticket Portal" <${process.env.EMAIL_USER}>`,
          to: deptEmails[category],
          subject: `Password reset completed for ${userName}`,
          text: `The password for user ${userName} has been successfully reset.\n\nNew Password: ${newPassword}\n\nTicket #${ticketCounter} has been automatically closed.`,
        };
        await transporter.sendMail(itMail);
        console.log(`IT notified for password reset`);

        // Close ticket
        ticket.status = 'Closed';
        await ticket.save();
        console.log(`Ticket #${ticketCounter} auto-closed`);
      } catch (err) {
        console.error(`Password reset failed for ${userId}:`, err.message);
      }
    }

    // ---- Response ----------------------------------------------------
    res.status(201).json({
      ...ticket.toObject(),
      newPassword: newPasswordToSend,
    });
  } catch (err) {
    console.error('Error creating ticket:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- Health check (Render expects /) ------------------------------------
app.get('/', (req, res) => res.send('Sandeza IT Ticket API – OK'));

// ---- Start server --------------------------------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend listening on port ${PORT}`);
});