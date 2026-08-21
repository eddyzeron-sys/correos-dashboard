import { DatabaseSync } from "node:sqlite";
import path from "path";
import bcrypt from "bcryptjs";

export const TAG_COLOR_ENABLED = "#16a34a";
export const TAG_COLOR_BLOCKED = "#dc2626";

export function normalizeTagColor(raw: unknown): string {
  return raw === TAG_COLOR_BLOCKED ? TAG_COLOR_BLOCKED : TAG_COLOR_ENABLED;
}

// DATA_DIR permite apuntar la base de datos a un volumen persistente (Docker/EasyPanel).
// Sin esa variable, se guarda en la raíz del proyecto como hasta ahora.
const dataDir = process.env.DATA_DIR || path.join(__dirname, "..");
const dbPath = path.join(dataDir, "data.sqlite");
export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'disabled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS mailcow_servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    server_url TEXT NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS email_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mailcow_server_id INTEGER NOT NULL REFERENCES mailcow_servers(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    tag_id INTEGER REFERENCES tags(id) ON DELETE SET NULL,
    domain TEXT NOT NULL,
    local_part TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_encrypted TEXT NOT NULL,
    quota_mb INTEGER NOT NULL DEFAULT 100,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '${TAG_COLOR_ENABLED}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, name)
  );

  CREATE TABLE IF NOT EXISTS email_account_tags (
    email_account_id INTEGER NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    color TEXT NOT NULL DEFAULT '${TAG_COLOR_ENABLED}',
    PRIMARY KEY (email_account_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS trackings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_account_id INTEGER REFERENCES email_accounts(id) ON DELETE SET NULL,
    account_email TEXT NOT NULL,
    message_uid INTEGER NOT NULL,
    subject TEXT NOT NULL,
    carrier TEXT NOT NULL,
    tracking_number TEXT NOT NULL,
    tracking_url TEXT NOT NULL,
    message_date TEXT,
    seen INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (email_account_id, message_uid)
  );

  CREATE TABLE IF NOT EXISTS compra_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS compra_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, name)
  );

  CREATE TABLE IF NOT EXISTS compra_registros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    compra_email_id INTEGER NOT NULL REFERENCES compra_emails(id) ON DELETE CASCADE,
    correo TEXT NOT NULL DEFAULT '',
    tarjeta TEXT,
    tag_id INTEGER REFERENCES compra_tags(id) ON DELETE SET NULL,
    monto REAL,
    montos TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

function tableExists(name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name);
  return !!row;
}

function columnExists(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

// email_accounts pudo haberse creado con un esquema anterior (sin user_id o
// sin tag_id) si la DB ya existía antes de estos cambios.
if (!columnExists("email_accounts", "user_id")) {
  db.exec("ALTER TABLE email_accounts ADD COLUMN user_id INTEGER REFERENCES users(id);");
}
if (!columnExists("email_accounts", "tag_id")) {
  db.exec("ALTER TABLE email_accounts ADD COLUMN tag_id INTEGER REFERENCES tags(id);");
}
// Marca hasta qué UID de mensajes ya se buscaron trackings, para no volver a
// revisar correos ya procesados en cada escaneo.
if (!columnExists("email_accounts", "tracking_last_uid")) {
  db.exec("ALTER TABLE email_accounts ADD COLUMN tracking_last_uid INTEGER NOT NULL DEFAULT 0;");
}

// Migración desde el esquema viejo de un solo admin (tabla admin_user) al
// esquema multi-usuario. Idempotente: si admin_user no existe, no hace nada;
// el backfill de user_id solo toca filas que todavía estén en NULL.
function migrateFromSingleAdmin(): void {
  if (!tableExists("admin_user")) return;

  const oldAdmin = db.prepare("SELECT * FROM admin_user WHERE id = 1").get() as
    | { username: string; password_hash: string }
    | undefined;

  if (oldAdmin) {
    const existingUser = db
      .prepare("SELECT id FROM users WHERE username = ?")
      .get(oldAdmin.username) as { id: number } | undefined;

    const adminId = existingUser
      ? existingUser.id
      : Number(
          db
            .prepare(
              "INSERT INTO users (username, password_hash, role, status) VALUES (?, ?, 'admin', 'active')"
            )
            .run(oldAdmin.username, oldAdmin.password_hash).lastInsertRowid
        );

    db.prepare("UPDATE email_accounts SET user_id = ? WHERE user_id IS NULL").run(adminId);

    console.log(`[migración] admin_user -> users (id=${adminId}, '${oldAdmin.username}')`);
  }

  db.exec("DROP TABLE admin_user;");
}

migrateFromSingleAdmin();

// Migración de "un correo, una etiqueta" (columna tag_id) a "un correo, varias
// etiquetas" (tabla email_account_tags). Idempotente: INSERT OR IGNORE + PK.
function migrateSingleTagToMulti(): void {
  if (!columnExists("email_accounts", "tag_id")) return;
  const rows = db
    .prepare("SELECT id, tag_id FROM email_accounts WHERE tag_id IS NOT NULL")
    .all() as { id: number; tag_id: number }[];
  for (const row of rows) {
    db.prepare(
      "INSERT OR IGNORE INTO email_account_tags (email_account_id, tag_id) VALUES (?, ?)"
    ).run(row.id, row.tag_id);
  }
}
migrateSingleTagToMulti();

// El color pasó de ser propiedad de la etiqueta (compartido en todos los
// correos) a ser propiedad de la relación correo↔etiqueta (cada correo puede
// tener la misma etiqueta en un color distinto). Backfill: las relaciones que
// ya existían heredan el color que tenía su etiqueta en ese momento, así no
// cambia nada visualmente para nadie.
function migrateTagColorToAttachment(): void {
  if (columnExists("email_account_tags", "color")) return;
  db.exec(`ALTER TABLE email_account_tags ADD COLUMN color TEXT NOT NULL DEFAULT '${TAG_COLOR_ENABLED}';`);
  db.exec(
    `UPDATE email_account_tags SET color = (SELECT color FROM tags WHERE tags.id = email_account_tags.tag_id)`
  );
}
migrateTagColorToAttachment();

// Los trackings ahora guardan su propio dueño (user_id) y una copia del
// correo (account_email), en vez de depender solo de email_account_id — así
// sobreviven si se borra la cuenta de correo (antes se borraban en cascada).
// Se recrea la tabla porque SQLite no deja cambiar la regla ON DELETE de una
// columna existente.
function migrateTrackingsOwnership(): void {
  if (!tableExists("trackings") || columnExists("trackings", "user_id")) return;

  db.exec(`
    CREATE TABLE trackings_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email_account_id INTEGER REFERENCES email_accounts(id) ON DELETE SET NULL,
      account_email TEXT NOT NULL,
      message_uid INTEGER NOT NULL,
      subject TEXT NOT NULL,
      carrier TEXT NOT NULL,
      tracking_number TEXT NOT NULL,
      tracking_url TEXT NOT NULL,
      message_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (email_account_id, message_uid)
    );
  `);
  db.exec(`
    INSERT INTO trackings_new
      (id, user_id, email_account_id, account_email, message_uid, subject, carrier, tracking_number, tracking_url, message_date, created_at)
    SELECT t.id, e.user_id, t.email_account_id, e.email, t.message_uid, t.subject, t.carrier, t.tracking_number, t.tracking_url, t.message_date, t.created_at
    FROM trackings t
    JOIN email_accounts e ON e.id = t.email_account_id
    WHERE e.user_id IS NOT NULL;
  `);
  db.exec(`DROP TABLE trackings;`);
  db.exec(`ALTER TABLE trackings_new RENAME TO trackings;`);
}
migrateTrackingsOwnership();

// Estado de leído/no leído del tracking, sincronizado con el \Seen real del
// correo (ver src/routes/inbox.ts y src/routes/trackings.ts).
if (tableExists("trackings") && !columnExists("trackings", "seen")) {
  db.exec("ALTER TABLE trackings ADD COLUMN seen INTEGER NOT NULL DEFAULT 0;");
}

// El registro de compra tiene su propio campo de correo (puede ser distinto
// al de la libreta bajo la que está guardado) — las filas viejas heredan el
// correo de su libreta como valor inicial.
if (tableExists("compra_registros") && !columnExists("compra_registros", "correo")) {
  db.exec("ALTER TABLE compra_registros ADD COLUMN correo TEXT NOT NULL DEFAULT '';");
  db.exec(
    `UPDATE compra_registros SET correo = (SELECT email FROM compra_emails WHERE compra_emails.id = compra_registros.compra_email_id) WHERE correo = ''`
  );
}

// El gasto de una compra ya no es un solo número: se guardan los montos tal
// cual se ingresaron, separados por coma (ej. "15,59"), sin sumarlos ni
// partirlos en varias tarjetas — así se listan uno por uno al mostrarlos.
if (tableExists("compra_registros") && !columnExists("compra_registros", "montos")) {
  db.exec("ALTER TABLE compra_registros ADD COLUMN montos TEXT;");
  db.exec(
    `UPDATE compra_registros SET montos = CAST(monto AS TEXT) WHERE monto IS NOT NULL AND montos IS NULL`
  );
}

// Cualquier usuario ya existente que todavía no tenga etiquetas (por ejemplo
// el admin de antes de que existiera esta función) recibe las de ejemplo.
function backfillDefaultTags(): void {
  const usersWithoutTags = db
    .prepare(
      `SELECT id FROM users WHERE id NOT IN (SELECT DISTINCT user_id FROM tags)`
    )
    .all() as { id: number }[];
  for (const u of usersWithoutTags) {
    seedDefaultTagsForUser(u.id);
  }
}
backfillDefaultTags();

export function seedDefaultTagsForUser(userId: number): void {
  db.prepare(
    `INSERT OR IGNORE INTO tags (user_id, name, color) VALUES (?, 'Depop', '${TAG_COLOR_ENABLED}')`
  ).run(userId);
  db.prepare(
    `INSERT OR IGNORE INTO tags (user_id, name, color) VALUES (?, 'Vinted', '${TAG_COLOR_ENABLED}')`
  ).run(userId);
}

export function seedFirstAdminIfMissing(username: string, plainPassword: string): void {
  const anyUser = db.prepare("SELECT id FROM users LIMIT 1").get();
  if (anyUser) return;
  const hash = bcrypt.hashSync(plainPassword, 12);
  const info = db
    .prepare(
      "INSERT INTO users (username, password_hash, role, status) VALUES (?, ?, 'admin', 'active')"
    )
    .run(username, hash);
  seedDefaultTagsForUser(Number(info.lastInsertRowid));
  console.log(`[setup] Usuario admin '${username}' creado.`);
}

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: "admin" | "user";
  status: "pending" | "active" | "disabled";
  created_at: string;
}

export interface MailcowServerRow {
  id: number;
  label: string;
  server_url: string;
  api_key_encrypted: string;
  created_at: string;
}

export interface EmailAccountRow {
  id: number;
  mailcow_server_id: number;
  user_id: number | null;
  domain: string;
  local_part: string;
  email: string;
  password_encrypted: string;
  quota_mb: number;
  tracking_last_uid: number;
  created_at: string;
}

export interface TrackingRow {
  id: number;
  user_id: number;
  email_account_id: number | null;
  account_email: string;
  message_uid: number;
  subject: string;
  carrier: string;
  tracking_number: string;
  tracking_url: string;
  message_date: string | null;
  seen: number;
  created_at: string;
}

export interface CompraEmailRow {
  id: number;
  user_id: number;
  email: string;
  created_at: string;
}

export interface CompraTagRow {
  id: number;
  user_id: number;
  name: string;
  created_at: string;
}

export interface CompraRegistroRow {
  id: number;
  user_id: number;
  compra_email_id: number;
  correo: string;
  tarjeta: string | null;
  tag_id: number | null;
  montos: string | null;
  created_at: string;
}

export interface TagRow {
  id: number;
  user_id: number;
  name: string;
  color: string;
  created_at: string;
}

export const MAX_QUOTA_MB = 100;
