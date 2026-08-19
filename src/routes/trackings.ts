import { Router, Request } from "express";
import { db, EmailAccountRow, TrackingRow } from "../db";
import { requireAuth } from "../middleware/require-auth";
import { scanForShippedMessages } from "../mail/imap-client";
import { extractCandidateLinks, findTrackingInLinks } from "../mail/tracking-links";

const router = Router();
router.use(requireAuth);

function listOwnedAccounts(req: Request): EmailAccountRow[] {
  if (req.user!.role === "admin") {
    return db.prepare("SELECT * FROM email_accounts").all() as unknown as EmailAccountRow[];
  }
  return db
    .prepare("SELECT * FROM email_accounts WHERE user_id = ?")
    .all(req.user!.id) as unknown as EmailAccountRow[];
}

// Los trackings guardan su propio dueño y su propia copia del correo, así que
// no dependen de que la cuenta de correo siga existiendo para listarse.
function listTrackingsFor(req: Request): TrackingRow[] {
  if (req.user!.role === "admin") {
    return db.prepare("SELECT * FROM trackings ORDER BY created_at DESC").all() as unknown as TrackingRow[];
  }
  return db
    .prepare("SELECT * FROM trackings WHERE user_id = ? ORDER BY created_at DESC")
    .all(req.user!.id) as unknown as TrackingRow[];
}

router.get("/trackings", (req, res) => {
  res.render("trackings", { trackings: listTrackingsFor(req), activeNav: "trackings", error: null });
});

router.post("/trackings/scan", async (req, res) => {
  const accounts = listOwnedAccounts(req);
  const results = await Promise.all(
    accounts.map(async (account) => {
      try {
        const { candidates, highestUid } = await scanForShippedMessages(
          account,
          account.tracking_last_uid || 0
        );
        let found = 0;
        for (const candidate of candidates) {
          const links = extractCandidateLinks(candidate.html);
          const tracking = await findTrackingInLinks(links);
          if (tracking) {
            db.prepare(
              `INSERT OR IGNORE INTO trackings
                 (user_id, email_account_id, account_email, message_uid, subject, carrier, tracking_number, tracking_url, message_date)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              account.user_id,
              account.id,
              account.email,
              candidate.uid,
              candidate.subject,
              tracking.carrier,
              tracking.trackingNumber,
              tracking.url,
              candidate.date
            );
            found++;
          }
        }
        db.prepare("UPDATE email_accounts SET tracking_last_uid = ? WHERE id = ?").run(
          highestUid,
          account.id
        );
        return found;
      } catch (err) {
        console.error(`No se pudo escanear trackings de ${account.email}:`, err);
        return 0;
      }
    })
  );
  res.json({ found: results.reduce((a, b) => a + b, 0) });
});

router.post("/trackings/:id/delete", (req, res) => {
  if (req.user!.role === "admin") {
    db.prepare("DELETE FROM trackings WHERE id = ?").run(req.params.id);
  } else {
    db.prepare("DELETE FROM trackings WHERE id = ? AND user_id = ?").run(req.params.id, req.user!.id);
  }
  res.json({ ok: true });
});

export default router;
