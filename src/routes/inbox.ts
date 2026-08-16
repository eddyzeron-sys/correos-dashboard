import { Router, Request } from "express";
import { db, EmailAccountRow } from "../db";
import { requireAuth } from "../middleware/require-auth";
import { listMessages, getMessage, deleteMessage, getAttachment, setMessageSeen } from "../mail/imap-client";

const router = Router();
router.use(requireAuth);

// Un usuario normal solo puede abrir sus propios correos; el admin puede abrir cualquiera.
function getOwnedEmailAccount(req: Request, id: string): EmailAccountRow | undefined {
  if (req.user!.role === "admin") {
    return db.prepare("SELECT * FROM email_accounts WHERE id = ?").get(id) as
      | EmailAccountRow
      | undefined;
  }
  return db
    .prepare("SELECT * FROM email_accounts WHERE id = ? AND user_id = ?")
    .get(id, req.user!.id) as EmailAccountRow | undefined;
}

router.get("/inbox/:id", async (req, res) => {
  const emailAccount = getOwnedEmailAccount(req, req.params.id);
  if (!emailAccount) {
    res.redirect("/dashboard");
    return;
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  try {
    const { messages, total } = await listMessages(emailAccount, page, 20);
    res.render("inbox", {
      emailAccount,
      messages,
      total,
      page,
      pageSize: 20,
      error: null,
    });
  } catch (err) {
    res.render("inbox", {
      emailAccount,
      messages: [],
      total: 0,
      page: 1,
      pageSize: 20,
      error: `No se pudo conectar al buzón por IMAP: ${(err as Error).message}`,
    });
  }
});

router.get("/inbox/:id/message/:uid", async (req, res) => {
  const emailAccount = getOwnedEmailAccount(req, req.params.id);
  if (!emailAccount) {
    res.redirect("/dashboard");
    return;
  }
  const message = await getMessage(emailAccount, Number(req.params.uid));
  res.render("message", { emailAccount, message });
});

router.get("/inbox/:id/message/:uid/attachment/:index", async (req, res) => {
  const emailAccount = getOwnedEmailAccount(req, req.params.id);
  if (!emailAccount) {
    res.redirect("/dashboard");
    return;
  }
  const attachment = await getAttachment(
    emailAccount,
    Number(req.params.uid),
    Number(req.params.index)
  );
  if (!attachment) {
    res.status(404).send("Adjunto no encontrado.");
    return;
  }
  res.setHeader("Content-Type", attachment.contentType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(attachment.filename || "adjunto")}"`
  );
  res.send(attachment.content);
});

router.post("/inbox/:id/message/:uid/seen", async (req, res) => {
  const emailAccount = getOwnedEmailAccount(req, req.params.id);
  if (!emailAccount) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const seen = (req.body as Record<string, string>).seen === "1";
  await setMessageSeen(emailAccount, Number(req.params.uid), seen);
  res.json({ ok: true, seen });
});

router.post("/inbox/:id/message/:uid/delete", async (req, res) => {
  const emailAccount = getOwnedEmailAccount(req, req.params.id);
  if (!emailAccount) {
    res.redirect("/dashboard");
    return;
  }
  await deleteMessage(emailAccount, Number(req.params.uid));
  res.redirect(`/inbox/${emailAccount.id}`);
});

export default router;
