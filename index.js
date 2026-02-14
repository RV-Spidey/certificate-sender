import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";

import express from "express";
import qrcode from "qrcode-terminal";

const app = express();
app.use(express.json());

/* ===============================
   GLOBAL STATE
================================ */
let sock = null;
let isWhatsAppReady = false;

/* ===============================
   HEALTH CHECK
================================ */
app.get("/", (req, res) => {
  res.send(
    isWhatsAppReady
      ? "✅ WhatsApp Certificate Bot Running"
      : "⏳ WhatsApp connecting..."
  );
});

/* ===============================
   DEBUG ENDPOINT (IMPORTANT)
================================ */
app.get("/status", (req, res) => {
  res.json({
    whatsappReady: isWhatsAppReady,
    socketExists: !!sock
  });
});

/* ===============================
   SEND CERTIFICATE (FROM N8N)
================================ */
app.post("/send-certificate", async (req, res) => {
  console.log("\n==============================");
  console.log("📥 REQUEST RECEIVED");
  console.log("BODY:", req.body);
  console.log("==============================");

  try {
    const { phone, name, pdfUrl } = req.body;

    // ---- VALIDATIONS ----
    if (!sock) {
      console.log("❌ Socket not initialized");
      return res.status(500).send("Socket not ready");
    }

    if (!isWhatsAppReady) {
      console.log("❌ WhatsApp not connected");
      return res.status(500).send("WhatsApp not connected");
    }

    if (!phone || !pdfUrl) {
      console.log("❌ Missing parameters");
      return res.status(400).send("Missing phone or pdfUrl");
    }

    const jid = phone.replace(/\D/g, "") + "@s.whatsapp.net";

    console.log("📄 Target JID:", jid);
    console.log("📄 PDF URL:", pdfUrl);

    // simulate typing
    console.log("⌨️ Sending composing presence...");
    await sock.sendPresenceUpdate("composing", jid);

    await new Promise(r => setTimeout(r, 2500));

    console.log("📤 Sending PDF...");

    const result = await sock.sendMessage(jid, {
      document: { url: pdfUrl },
      mimetype: "application/pdf",
      fileName: `${name || "certificate"}.pdf`,
      caption:
        `🎉 Hello ${name || ""}!\n\n` +
        `Your certificate is ready ✅`
    });

    console.log("✅ WhatsApp response:", result);

    await sock.sendPresenceUpdate("paused", jid);

    console.log("✅ CERTIFICATE SENT SUCCESSFULLY");

    res.send({ success: true });

  } catch (err) {
    console.error("\n🔥 SEND ERROR START 🔥");
    console.error(err);
    console.error("🔥 SEND ERROR END 🔥\n");

    res.status(500).send({
      error: err.message,
      stack: err.stack
    });
  }
});

/* ===============================
   WHATSAPP START
================================ */
async function startWhatsApp() {
  console.log("🚀 Starting WhatsApp...");

  const { state, saveCreds } =
    await useMultiFileAuthState("./auth");

  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    auth: state,
    version,
    browser: ["CertificateBot", "Chrome", "1.0"],
    printQRInTerminal: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({
    connection,
    qr,
    lastDisconnect
  }) => {

    if (qr) {
      console.log("\n📱 SCAN THIS QR:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("✅ WhatsApp Connected");
      isWhatsAppReady = true;
    }

    if (connection === "close") {
      isWhatsAppReady = false;

      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log("❌ Connection closed");

      if (shouldReconnect) {
        console.log("🔄 Reconnecting in 5s...");
        setTimeout(startWhatsApp, 5000);
      } else {
        console.log("🚫 Logged out — delete /auth");
      }
    }
  });
}

/* ===============================
   START SERVER (RENDER SAFE)
================================ */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🌍 Server running on port ${PORT}`);
});

/* ===============================
   START BOT
================================ */
startWhatsApp();
