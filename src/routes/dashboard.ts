import { Router } from "express";
import crypto from "crypto";
import { db, MailcowServerRow, EmailAccountRow, TagRow, MAX_QUOTA_MB } from "../db";
import { encrypt } from "../crypto";
import { requireAuth } from "../middleware/require-auth";
import { listDomains } from "../mailcow/domains";
import { createMailbox, deleteMailbox } from "../mailcow/mailboxes";
import { getUnseenCount } from "../mail/imap-client";

const router = Router();
router.use(requireAuth);

type EmailAccountWithExtras = EmailAccountRow & {
  owner_username?: string;
  tags: TagRow[];
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
      `SELECT eat.email_account_id, t.* FROM email_account_tags eat
       JOIN tags t ON t.id = eat.tag_id
       WHERE eat.email_account_id IN (${placeholders})
       ORDER BY t.name`
    )
    .all(...emails.map((e) => e.id)) as unknown as (TagRow & { email_account_id: number })[];

  const byEmail = new Map<number, TagRow[]>();
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

// Filtra una lista de tag_id a solo los que pertenecen al propio usuario
// (evita que alguien le pegue etiquetas ajenas a un correo por ID a mano).
function filterOwnTagIds(userId: number, rawTagIds: unknown): number[] {
  const ids = (Array.isArray(rawTagIds) ? rawTagIds : rawTagIds ? [rawTagIds] : []) as string[];
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT id FROM tags WHERE user_id = ? AND id IN (${placeholders})`)
    .all(userId, ...ids) as { id: number }[];
  return rows.map((r) => r.id);
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
  const { local_part, tag_ids } = req.body as { local_part?: string; tag_ids?: unknown };

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
    const ownTagIds = filterOwnTagIds(req.user!.id, tag_ids);

    await createMailbox(server, local_part, domain, password, quota);
    const info = db
      .prepare(
        `INSERT INTO email_accounts (mailcow_server_id, user_id, domain, local_part, email, password_encrypted, quota_mb)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(server.id, req.user!.id, domain, local_part, fullEmail, encrypt(password), quota);
    const newId = Number(info.lastInsertRowid);
    for (const tagId of ownTagIds) {
      db.prepare("INSERT OR IGNORE INTO email_account_tags (email_account_id, tag_id) VALUES (?, ?)").run(
        newId,
        tagId
      );
    }
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

router.post("/email-accounts/:id/tags", async (req, res) => {
  const emailAccount = getOwnedEmailAccount(req, req.params.id);
  if (!emailAccount) {
    res.redirect("/dashboard");
    return;
  }
  // Las etiquetas se resuelven contra las de quien hace el cambio (si un admin
  // etiqueta el correo de otro usuario, usa sus propias etiquetas).
  const tagIds = filterOwnTagIds(req.user!.id, (req.body as Record<string, unknown>).tag_ids);
  db.prepare("DELETE FROM email_account_tags WHERE email_account_id = ?").run(emailAccount.id);
  for (const tagId of tagIds) {
    db.prepare("INSERT OR IGNORE INTO email_account_tags (email_account_id, tag_id) VALUES (?, ?)").run(
      emailAccount.id,
      tagId
    );
  }
  res.redirect("/dashboard");
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
