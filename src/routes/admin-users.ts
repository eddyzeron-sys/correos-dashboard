import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, UserRow } from "../db";
import { requireAuth, requireAdmin } from "../middleware/require-auth";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/", (req, res) => {
  const users = db.prepare("SELECT * FROM users ORDER BY created_at DESC").all() as unknown as UserRow[];
  res.render("admin-users", { users, activeNav: "users", error: null });
});

router.post("/:id/approve", (req, res) => {
  db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(req.params.id);
  res.redirect("/admin/users");
});

router.post("/:id/disable", (req, res) => {
  db.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(req.params.id);
  res.redirect("/admin/users");
});

router.post("/:id/password", (req, res) => {
  const { password } = req.body as Record<string, string>;
  if (!password || password.length < 8) {
    const users = db.prepare("SELECT * FROM users ORDER BY created_at DESC").all() as unknown as UserRow[];
    res.render("admin-users", {
      users,
      activeNav: "users",
      error: "La contraseña debe tener al menos 8 caracteres.",
    });
    return;
  }
  const hash = bcrypt.hashSync(password, 12);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, req.params.id);
  res.redirect("/admin/users");
});

router.post("/:id/delete", (req, res) => {
  const userId = req.params.id;

  if (Number(userId) === req.user!.id) {
    const users = db.prepare("SELECT * FROM users ORDER BY created_at DESC").all() as unknown as UserRow[];
    res.render("admin-users", { users, activeNav: "users", error: "No puedes eliminarte a ti mismo." });
    return;
  }

  const ownedEmails = db
    .prepare("SELECT COUNT(*) as count FROM email_accounts WHERE user_id = ?")
    .get(userId) as { count: number };

  if (ownedEmails.count > 0) {
    const users = db.prepare("SELECT * FROM users ORDER BY created_at DESC").all() as unknown as UserRow[];
    res.render("admin-users", {
      users,
      activeNav: "users",
      error: `Este usuario tiene ${ownedEmails.count} correo(s) asignado(s). Reasígnalos o bórralos primero desde el dashboard.`,
    });
    return;
  }

  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  res.redirect("/admin/users");
});

export default router;
