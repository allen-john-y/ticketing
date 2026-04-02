import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { exec } from "child_process";

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.post("/create-dl", (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: "Name and email required" });
  }

  console.log("Creating DL:", name, email);

  const command = `
  powershell -Command "
  Import-Module ExchangeOnlineManagement;
  Connect-ExchangeOnline -UserPrincipalName YOUR_ADMIN_EMAIL;
  New-DistributionGroup -Name '${name}' -PrimarySmtpAddress '${email}';
  "
  `;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error("❌ Error:", stderr);
      return res.status(500).json({ error: stderr });
    }

    console.log("✅ Success:", stdout);
    res.json({ message: "DL Created Successfully", output: stdout });
  });
});

app.listen(5000, () => console.log("🚀 Server running on port 5000"));