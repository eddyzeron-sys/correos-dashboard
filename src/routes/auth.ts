import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { db, UserRow, seedDefaultTagsForUser } from "../db";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Demasiados intentos. Espera unos minutos e intenta de nuevo.",
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Demasiados registros desde esta conexión. Espera un rato e intenta de nuevo.",
});

router.get("/login", (req, res) => {
  if (req.session.userId) {
    res.redirect("/inicio");
    return;
  }
  res.render("login", { error: null });
});

router.post("/login", loginLimiter, (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  const user = username
    ? (db.prepare("SELECT * FROM users WHERE username = ?").get(username) as
        | UserRow
        | undefined)
    : undefined;

  if (!user || !password || !bcrypt.compareSync(password, user.password_hash)) {
    res.render("login", { error: "Usuario o contraseña incorrectos." });
    return;
  }

  if (user.status === "pending") {
    res.render("login", { error: "Tu cuenta está pendiente de aprobación por un administrador." });
    return;
  }
  if (user.status === "disabled") {
    res.render("login", { error: "Tu cuenta fue desactivada. Contacta a un administrador." });
    return;
  }

  req.session.regenerate((err) => {
    if (err) {
      res.render("login", { error: "Error de sesión, intenta de nuevo." });
      return;
    }
    req.session.userId = user.id;
    res.redirect("/inicio");
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

router.get("/register", (req, res) => {
  if (req.session.userId) {
    res.redirect("/inicio");
    return;
  }
  res.render("register", { error: null, success: false });
});

router.post("/register", registerLimiter, (req, res) => {
  const { username, password, password2 } = req.body as Record<string, string>;

  if (!username || !password || !password2) {
    res.render("register", { error: "Todos los campos son obligatorios.", success: false });
    return;
  }
  if (password.length < 8) {
    res.render("register", {
      error: "La contraseña debe tener al menos 8 caracteres.",
      success: false,
    });
    return;
  }
  if (password !== password2) {
    res.render("register", { error: "Las contraseñas no coinciden.", success: false });
    return;
  }

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    res.render("register", { error: "Ese usuario ya existe.", success: false });
    return;
  }

  const hash = bcrypt.hashSync(password, 12);
  const info = db
    .prepare(
      "INSERT INTO users (username, password_hash, role, status) VALUES (?, ?, 'user', 'pending')"
    )
    .run(username, hash);
  seedDefaultTagsForUser(Number(info.lastInsertRowid));

  res.render("register", { error: null, success: true });
});

export default router;
