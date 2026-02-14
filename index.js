import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from "@whiskeysockets/baileys";

import express from "express";
import qrcode from "qrcode-terminal";

const app = express();
app.use(express.json());

let sock; // global WhatsApp socket

// ============================
// SMALL DELAY FUNCTION
// ============================
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================
// HEALTH CHECK
// ============================
app.get("/", (req, res) => {
  res.send("✅ WhatsApp Certificate Bot Running");
});

// ============================
// SEND CERTIFICATE API (FROM N8N)
// ============================
app.post("/send-certificate", async (req, res) => {
  try {
    const { phone, name, pdfUrl } = req.body;

    if (!sock) {
      return res.status(500).send("WhatsApp not connected");
    }

    const jid = phone.replace(/\D/g, "") + "@s.whatsapp.net";

    console.log("📩 Request received for:", jid);

    // --------------------------
    // HUMAN LIKE DELAY
    // --------------------------
    const randomDelay = 3000 + Math.random() * 4000;
    console.log(`⏳ Waiting ${Math.floor(randomDelay)} ms`);
    await sleep(randomDelay);

    // typing presence (looks human)
    await sock.sendPresenceUpdate("composing", jid);
    await sleep(2000);

    // --------------------------
    // SEND PDF DOCUMENT
    // --------------------------
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

    console.log("✅ Certificate sent to", jid);
    res.send("sent");

  } catch (err) {
    console.error("❌ Send error:", err);
    res.status(500).send("failed");
  }
});

// ============================
// START WHATSAPP BOT
// ============================
async function startBot() {
  const { state, saveCreds } =
    await useMultiFileAuthState("./auth");

  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    auth: state,
    version,
    browser: ["CertificateBot", "Chrome", "1.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, qr, lastDisconnect }) => {

    if (qr) {
      console.log("\n📱 Scan this QR with WhatsApp:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("✅ WhatsApp Connected Successfully");
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log("❌ Disconnected");

      if (shouldReconnect) {
        console.log("🔄 Reconnecting...");
        startBot();
      } else {
        console.log("🚫 Logged out. Delete /auth folder and rescan.");
      }
    }
  });
}

// ============================
// START SERVER
// ============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🌍 Server running on port ${PORT}`);
});

startBot();
