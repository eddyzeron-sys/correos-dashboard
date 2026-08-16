import { Request, Response, NextFunction } from "express";
import { db, UserRow } from "../db";

function sendUnauthenticated(req: Request, res: Response): void {
  if (req.xhr || req.get("Accept")?.includes("application/json")) {
    res.status(401).json({ error: "Tu sesión expiró. Vuelve a iniciar sesión." });
    return;
  }
  res.redirect("/login");
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    sendUnauthenticated(req, res);
    return;
  }

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.userId) as
    | UserRow
    | undefined;

  if (!user || user.status !== "active") {
    req.session.destroy(() => {
      sendUnauthenticated(req, res);
    });
    return;
  }

  req.user = user;
  res.locals.user = user;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== "admin") {
    res.status(403).send("Acceso denegado: se requiere ser administrador.");
    return;
  }
  next();
}
