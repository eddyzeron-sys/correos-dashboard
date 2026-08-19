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

type TrackingWithEmail = TrackingRow & { account_email: string };

function listTrackingsFor(req: Request): TrackingWithEmail[] {
  const accounts = listOwnedAccounts(req);
  if (accounts.length === 0) return [];
  const placeholders = accounts.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT t.*, e.email as account_email FROM trackings t
       JOIN email_accounts e ON e.id = t.email_account_id
       WHERE t.email_account_id IN (${placeholders})
       ORDER BY t.created_at DESC`
    )
    .all(...accounts.map((a) => a.id)) as unknown as TrackingWithEmail[];
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
                 (email_account_id, message_uid, subject, carrier, tracking_number, tracking_url, message_date)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).run(
              account.id,
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
  const accountIds = listOwnedAccounts(req).map((a) => a.id);
  if (accountIds.length === 0) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const placeholders = accountIds.map(() => "?").join(",");
  db.prepare(`DELETE FROM trackings WHERE id = ? AND email_account_id IN (${placeholders})`).run(
    req.params.id,
    ...accountIds
  );
  res.json({ ok: true });
});

export default router;
