import { Router, Request } from "express";
import { db, SecondaryEmailRow } from "../db";
import { requireAuth } from "../middleware/require-auth";

const router = Router();
router.use(requireAuth);

export function listOwnSecondaryEmails(req: Request): SecondaryEmailRow[] {
  return db
    .prepare("SELECT * FROM secondary_emails WHERE user_id = ? ORDER BY created_at DESC")
    .all(req.user!.id) as unknown as SecondaryEmailRow[];
}

function getOwnSecondaryEmail(req: Request, id: string): SecondaryEmailRow | undefined {
  return db
    .prepare("SELECT * FROM secondary_emails WHERE id = ? AND user_id = ?")
    .get(id, req.user!.id) as SecondaryEmailRow | undefined;
}

router.get("/emails", (req, res) => {
  res.render("emails", { emails: listOwnSecondaryEmails(req), activeNav: "emails" });
});

router.post("/emails", (req, res) => {
  const email = ((req.body as Record<string, string>).email || "").trim();
  if (!email) {
    res.status(400).json({ error: "El correo es obligatorio." });
    return;
  }
  try {
    const info = db
      .prepare("INSERT INTO secondary_emails (user_id, email) VALUES (?, ?)")
      .run(req.user!.id, email);
    res.json({ id: Number(info.lastInsertRowid), email });
  } catch {
    res.status(400).json({ error: "Ya tienes ese correo guardado." });
  }
});

router.post("/emails/:id", (req, res) => {
  const existing = getOwnSecondaryEmail(req, req.params.id);
  if (!existing) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const email = ((req.body as Record<string, string>).email || "").trim();
  if (!email) {
    res.status(400).json({ error: "El correo es obligatorio." });
    return;
  }
  try {
    db.prepare("UPDATE secondary_emails SET email = ? WHERE id = ?").run(email, existing.id);
    res.json({ id: existing.id, email });
  } catch {
    res.status(400).json({ error: "Ya tienes ese correo guardado." });
  }
});

router.post("/emails/:id/delete", (req, res) => {
  const existing = getOwnSecondaryEmail(req, req.params.id);
  if (!existing) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  db.prepare("DELETE FROM secondary_emails WHERE id = ?").run(existing.id);
  res.json({ ok: true });
});

export default router;
