

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

const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());

// CORS
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

// --------------------
// MongoDB Connection
// --------------------
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

// --------------------
// Ticket Schema — WITH ticketNumber
// --------------------
const ticketSchema = new mongoose.Schema({
  ticketNumber: { type: Number, unique: true },
  userId: String,
  userName: String,
  category: String,
  description: String,
  priority: String,
  status: String
},{ timestamps: true });
const Ticket = mongoose.model('Ticket', ticketSchema);

// --------------------
// TICKET COUNTER (GLOBAL)
// --------------------
let ticketCounter = 0;
const loadCounter = async () => {
  try {
    const lastTicket = await Ticket.findOne().sort({ ticketNumber: -1 });
    ticketCounter = lastTicket ? lastTicket.ticketNumber : 0;
    console.log('Ticket counter loaded:', ticketCounter);
  } catch (err) {
    console.error('Error loading ticket counter:', err);
  }
};
loadCounter();

// --------------------
// Email Transporter
// --------------------
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

// --------------------
// Department Emails
// --------------------
const deptEmails = {
  'Password Reset': 'allenj@sandeza-inc.com',
  'Admin Access': 'vigneshm@sandeza-inc.com',
  'Payroll Issue': 'kishorekumars@sandeza-inc.com',
  'Expense Reimbursement': 'kishorekumars@sandeza-inc.com',
  'Leave Request': 'allenj@sandeza-inc.com',
  'Employee Onboarding': 'allenj@sandeza-inc.com',
};

// --------------------
// API ROUTES
// --------------------

// GET all tickets or filter by userId
app.get('/tickets', async (req, res) => {
  try {
    const { userId } = req.query;
    const filter = userId ? { userId } : {};
    const tickets = await Ticket.find(filter).sort({ ticketNumber: 1 });
    res.json(tickets);
  } catch (err) {
    console.error('Error fetching tickets:', err);
    res.status(500).send('Server error');
  }
});

// GET single ticket
app.get('/tickets/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json(ticket);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('Server error');
  }
});

// POST: Create ticket + increment number
app.post('/tickets', async (req, res) => {
  try {
    const { category, description, priority, userId, userName } = req.body;

    if (!deptEmails[category]) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    ticketCounter++; // GLOBAL INCREMENT

    const ticket = new Ticket({
      ticketNumber: ticketCounter,
      userId,
      userName,
      category,
      description,
      priority,
      status: 'Open'
    });

    await ticket.save();

    const toEmail = deptEmails[category];
    const mailOptions = {
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

    transporter.sendMail(mailOptions)
      .then(() => console.log(`Email sent to ${toEmail}`))
      .catch(err => console.error('Email failed:', err.message));

    res.status(201).json(ticket);
  } catch (err) {
    console.error('Error creating ticket:', err);
    res.status(500).send('Server error');
  }
});

// PUT: Close ticket
app.put('/tickets/:id/close', async (req, res) => {
  try {
    const ticket = await Ticket.findByIdAndUpdate(
      req.params.id,
      { status: 'Closed' },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ error: 'Not found' });
    res.json(ticket);
  } catch (err) {
    console.error('Error closing ticket:', err);
    res.status(500).send('Server error');
  }
});

// --------------------
// Start Server
// --------------------
const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
