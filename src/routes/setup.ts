import { Router } from "express";
import { db, MailcowServerRow } from "../db";
import { encrypt } from "../crypto";
import { requireAuth, requireAdmin } from "../middleware/require-auth";
import { listDomains } from "../mailcow/domains";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/", (req, res) => {
  const servers = db.prepare("SELECT * FROM mailcow_servers").all() as unknown as MailcowServerRow[];
  res.render("setup", { servers, activeNav: "setup", error: null });
});

router.post("/", async (req, res) => {
  const { label, server_url, api_key } = req.body as Record<string, string>;
  if (!label || !server_url || !api_key) {
    const servers = db.prepare("SELECT * FROM mailcow_servers").all() as unknown as MailcowServerRow[];
    res.render("setup", { servers, activeNav: "setup", error: "Todos los campos son obligatorios." });
    return;
  }

  const api_key_encrypted = encrypt(api_key);
  const info = db
    .prepare(
      "INSERT INTO mailcow_servers (label, server_url, api_key_encrypted) VALUES (?, ?, ?)"
    )
    .run(label, server_url, api_key_encrypted);

  const newServer = db
    .prepare("SELECT * FROM mailcow_servers WHERE id = ?")
    .get(info.lastInsertRowid) as unknown as MailcowServerRow;

  try {
    await listDomains(newServer);
  } catch (err) {
    db.prepare("DELETE FROM mailcow_servers WHERE id = ?").run(info.lastInsertRowid);
    const servers = db.prepare("SELECT * FROM mailcow_servers").all() as unknown as MailcowServerRow[];
    res.render("setup", {
      servers,
      activeNav: "setup",
      error: `No se pudo conectar a Mailcow: ${(err as Error).message}`,
    });
    return;
  }

  res.redirect("/dashboard");
});

router.post("/:id/delete", (req, res) => {
  db.prepare("DELETE FROM mailcow_servers WHERE id = ?").run(req.params.id);
  res.redirect("/setup");
});

export default router;
