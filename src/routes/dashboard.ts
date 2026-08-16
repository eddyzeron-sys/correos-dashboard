import { Router } from "express";
import crypto from "crypto";
import { db, normalizeTagColor, MailcowServerRow, EmailAccountRow, TagRow, MAX_QUOTA_MB } from "../db";
import { encrypt } from "../crypto";
import { requireAuth } from "../middleware/require-auth";
import { listDomains } from "../mailcow/domains";
import { createMailbox, deleteMailbox } from "../mailcow/mailboxes";
import { getUnseenCount } from "../mail/imap-client";

const router = Router();
router.use(requireAuth);

// El color es un atributo de la relación correo↔etiqueta, no de la etiqueta en
// sí — la misma etiqueta puede estar en verde en un correo y en rojo en otro.
type AttachedTag = { id: number; name: string; color: string };
type EmailAccountWithExtras = EmailAccountRow & {
  owner_username?: string;
  tags: AttachedTag[];
};

function getFirstMailcowServer(): MailcowServerRow | undefined {
  return db.prepare("SELECT * FROM mailcow_servers ORDER BY id LIMIT 1").get() as
    | MailcowServerRow
    | undefined;
}

function attachTags(emails: (EmailAccountRow & { owner_username?: string })[]): EmailAccountWithExtras[] {
  if (emails.length === 0) return [];
  const placeholders = emails.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT eat.email_account_id, eat.color, t.id, t.name FROM email_account_tags eat
       JOIN tags t ON t.id = eat.tag_id
       WHERE eat.email_account_id IN (${placeholders})
       ORDER BY t.name`
    )
    .all(...emails.map((e) => e.id)) as unknown as (AttachedTag & { email_account_id: number })[];

  const byEmail = new Map<number, AttachedTag[]>();
  for (const row of rows) {
    const { email_account_id, ...tag } = row;
    if (!byEmail.has(email_account_id)) byEmail.set(email_account_id, []);
    byEmail.get(email_account_id)!.push(tag);
  }

  return emails.map((e) => ({ ...e, tags: byEmail.get(e.id) || [] }));
}

function listEmailsFor(req: import("express").Request): EmailAccountWithExtras[] {
  if (req.user!.role === "admin") {
    const rows = db
      .prepare(
        `SELECT e.*, u.username as owner_username FROM email_accounts e
         LEFT JOIN users u ON u.id = e.user_id
         ORDER BY e.email`
      )
      .all() as unknown as (EmailAccountRow & { owner_username?: string })[];
    return attachTags(rows);
  }
  const rows = db
    .prepare("SELECT * FROM email_accounts WHERE user_id = ? ORDER BY email")
    .all(req.user!.id) as unknown as EmailAccountRow[];
  return attachTags(rows);
}

// Un usuario normal solo puede tocar sus propios correos; el admin puede tocar cualquiera.
function getOwnedEmailAccount(req: import("express").Request, id: string): EmailAccountRow | undefined {
  if (req.user!.role === "admin") {
    return db.prepare("SELECT * FROM email_accounts WHERE id = ?").get(id) as
      | EmailAccountRow
      | undefined;
  }
  return db
    .prepare("SELECT * FROM email_accounts WHERE id = ? AND user_id = ?")
    .get(id, req.user!.id) as EmailAccountRow | undefined;
}

function getUserTags(req: import("express").Request): TagRow[] {
  return db.prepare("SELECT * FROM tags WHERE user_id = ? ORDER BY name").all(req.user!.id) as unknown as TagRow[];
}

// Una etiqueta solo se puede usar si pertenece a quien está haciendo el cambio
// (evita que alguien le pegue una etiqueta ajena a un correo por ID a mano).
function getOwnedTag(userId: number, tagId: string): { id: number } | undefined {
  return db.prepare("SELECT id FROM tags WHERE id = ? AND user_id = ?").get(tagId, userId) as
    | { id: number }
    | undefined;
}

router.get("/dashboard", async (req, res) => {
  const server = getFirstMailcowServer();
  if (!server) {
    if (req.user!.role === "admin") {
      res.redirect("/setup");
      return;
    }
    res.render("dashboard", { emails: [], tags: getUserTags(req), domain: "", activeNav: "dashboard", error: "Todavía no hay un servidor de Mailcow configurado. Pide a un administrador que lo conecte." });
    return;
  }

  let domain = "";
  try {
    const domains = await listDomains(server);
    domain = domains[0] || "";
  } catch {
    // Si Mailcow no responde, igual mostramos el dashboard; solo no habrá preview de dominio.
  }

  res.render("dashboard", { emails: listEmailsFor(req), tags: getUserTags(req), domain, activeNav: "dashboard", error: null });
});

router.post("/email-accounts/check-new", async (req, res) => {
  const emails = listEmailsFor(req);
  const results = await Promise.all(
    emails.map(async (e) => {
      try {
        const unseen = await getUnseenCount(e);
        return { id: e.id, unseen };
      } catch {
        return { id: e.id, unseen: 0, error: true };
      }
    })
  );
  res.json({ results });
});

router.post("/email-accounts", async (req, res) => {
  const server = getFirstMailcowServer();
  if (!server) {
    res.redirect("/setup");
    return;
  }
  const { local_part } = req.body as { local_part?: string };

  // Único dominio disponible por ahora: el panel no deja elegir, siempre usa el mismo.
  let domain = "";
  try {
    domain = (await listDomains(server))[0] || "";
  } catch {
    // se maneja abajo si local_part también falta / al intentar crear
  }

  if (!local_part) {
    res.render("dashboard", { emails: listEmailsFor(req), tags: getUserTags(req), domain, activeNav: "dashboard", error: "Falta el nombre del correo." });
    return;
  }

  try {
    if (!domain) throw new Error("El servidor de Mailcow no tiene ningún dominio configurado.");

    // La contraseña del buzón la genera y guarda la app; nadie la ve ni la
    // necesita, el correo solo se administra desde este panel.
    const password = crypto.randomBytes(24).toString("base64url");
    const quota = MAX_QUOTA_MB;

    const fullEmail = `${local_part}@${domain}`;

    await createMailbox(server, local_part, domain, password, quota);
    db.prepare(
      `INSERT INTO email_accounts (mailcow_server_id, user_id, domain, local_part, email, password_encrypted, quota_mb)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(server.id, req.user!.id, domain, local_part, fullEmail, encrypt(password), quota);
    res.redirect("/dashboard");
  } catch (err) {
    res.render("dashboard", {
      emails: listEmailsFor(req),
      tags: getUserTags(req),
      domain,
      activeNav: "dashboard",
      error: `No se pudo crear el correo en Mailcow: ${(err as Error).message}`,
    });
  }
});

// Crea la etiqueta si no existe (o reusa la que ya tenga ese nombre) y la
// aplica de una vez al correo con el color elegido.
// Nota: esta ruta literal "/new" debe registrarse ANTES que "/:tagId" — si no,
// Express la interpreta como si "new" fuera un tagId y nunca llega aquí.
router.post("/email-accounts/:id/tags/new", (req, res) => {
  const emailAccount = getOwnedEmailAccount(req, req.params.id);
  if (!emailAccount) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const { name } = req.body as Record<string, string>;
  const trimmedName = (name || "").trim();
  if (!trimmedName) {
    res.status(400).json({ error: "El nombre es obligatorio." });
    return;
  }
  const color = normalizeTagColor((req.body as Record<string, string>).color);

  let tag = db
    .prepare("SELECT id, name FROM tags WHERE user_id = ? AND name = ?")
    .get(req.user!.id, trimmedName) as { id: number; name: string } | undefined;
  if (!tag) {
    const info = db
      .prepare("INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)")
      .run(req.user!.id, trimmedName, color);
    tag = { id: Number(info.lastInsertRowid), name: trimmedName };
  }

  db.prepare(
    `INSERT INTO email_account_tags (email_account_id, tag_id, color) VALUES (?, ?, ?)
     ON CONFLICT(email_account_id, tag_id) DO UPDATE SET color = excluded.color`
  ).run(emailAccount.id, tag.id, color);
  res.json({ id: tag.id, name: tag.name, color });
});

// Aplica una etiqueta (ya existente) a un correo con un color específico, o le
// cambia el color si ya estaba aplicada — el color es propio de esta relación,
// así la misma etiqueta puede verse distinta en cada correo.
router.post("/email-accounts/:id/tags/:tagId", (req, res) => {
  const emailAccount = getOwnedEmailAccount(req, req.params.id);
  const tag = getOwnedTag(req.user!.id, req.params.tagId);
  if (!emailAccount || !tag) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const color = normalizeTagColor((req.body as Record<string, string>).color);
  db.prepare(
    `INSERT INTO email_account_tags (email_account_id, tag_id, color) VALUES (?, ?, ?)
     ON CONFLICT(email_account_id, tag_id) DO UPDATE SET color = excluded.color`
  ).run(emailAccount.id, tag.id, color);
  res.json({ ok: true, color });
});

// Quita la etiqueta de este correo en particular — la etiqueta sigue
// existiendo para usarla en otros correos.
router.post("/email-accounts/:id/tags/:tagId/remove", (req, res) => {
  const emailAccount = getOwnedEmailAccount(req, req.params.id);
  const tag = getOwnedTag(req.user!.id, req.params.tagId);
  if (!emailAccount || !tag) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  db.prepare("DELETE FROM email_account_tags WHERE email_account_id = ? AND tag_id = ?").run(
    emailAccount.id,
    tag.id
  );
  res.json({ ok: true });
});

router.post("/email-accounts/:id/delete", async (req, res) => {
  const server = getFirstMailcowServer();
  const emailAccount = getOwnedEmailAccount(req, req.params.id);
  if (!server || !emailAccount) {
    res.redirect("/dashboard");
    return;
  }
  await deleteMailbox(server, emailAccount.email);
  db.prepare("DELETE FROM email_accounts WHERE id = ?").run(emailAccount.id);
  res.redirect("/dashboard?deleted=1");
});

export default router;
