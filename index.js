import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from "@whiskeysockets/baileys";

import express from "express";
import qrcode from "qrcode-terminal";

const app = express();
app.use(express.json());

let sock;
let isReady = false;
let starting = false; // ✅ prevents duplicate reconnects

// ============================
// HELPERS
// ============================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const randomHumanDelay = async () => {
  const delay = 4000 + Math.random() * 6000;
  console.log(`⏳ Human delay: ${Math.floor(delay)} ms`);
  await sleep(delay);
};

// ============================
// HEALTH CHECK
// ============================
app.get("/", (req, res) => {
  res.send("✅ WhatsApp Certificate Bot Running");
});

// ============================
// SEND CERTIFICATE API
// ============================
app.post("/send-certificate", async (req, res) => {
  try {
    console.log("📥 Incoming request:", req.body);

    const { phone, name, pdfUrl } = req.body;

    if (!isReady || !sock) {
      console.log("⚠️ WhatsApp not ready");
      return res.status(500).send("WhatsApp not connected yet");
    }

    if (!phone || !pdfUrl) {
      return res.status(400).send("Missing parameters");
    }

    const cleanPhone = phone.replace(/\D/g, "");
    const jid = cleanPhone + "@s.whatsapp.net";

    console.log("📩 Sending certificate to:", jid);

    // ---- Human behaviour ----
    await randomHumanDelay();

    await sock.sendPresenceUpdate("composing", jid);
    await sleep(2500);

    // ---- Send PDF ----
    await sock.sendMessage(jid, {
      document: { url: pdfUrl },
      mimetype: "application/pdf",
      fileName: `${name}_certificate.pdf`,
      caption:
        `🎉 Hello ${name}!\n\n` +
        `Your certificate is ready ✅\n\n` +
        `Thank you for participating!`
    });

    await sock.sendPresenceUpdate("paused", jid);

    console.log("✅ Sent successfully:", jid);

    res.send({ success: true });

  } catch (err) {
    console.error("❌ Send error:", err);
    res.status(500).send("Failed to send");
  }
});

// ============================
// START WHATSAPP BOT
// ============================
async function startBot() {

  if (starting) return;
  starting = true;

  console.log("🚀 Starting WhatsApp bot...");

  const { state, saveCreds } =
    await useMultiFileAuthState("./auth");

  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    auth: state,
    version,
    browser: ["CertificateBot", "Chrome", "1.0"],
    markOnlineOnConnect: true,
    syncFullHistory: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, qr, lastDisconnect }) => {

    if (qr) {
      console.log("\n📱 Scan this QR:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("✅ WhatsApp Connected");

      // small stabilization delay
      await sleep(3000);

      isReady = true;
      starting = false;
    }

    if (connection === "close") {
      isReady = false;
      starting = false;

      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log("❌ Connection closed");

      if (shouldReconnect) {
        console.log("🔄 Reconnecting in 5s...");
        await sleep(5000);
        startBot();
      } else {
        console.log("🚫 Logged out — delete /auth and rescan");
      }
    }
  });
}

// ============================
// START SERVER
// ============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🌍 Server running on ${PORT}`);
});

startBot();
