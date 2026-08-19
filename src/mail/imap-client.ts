import { ImapFlow } from "imapflow";
import { simpleParser, Attachment } from "mailparser";
import { decrypt } from "../crypto";
import { EmailAccountRow } from "../db";

export interface MessageSummary {
  uid: number;
  subject: string;
  from: string;
  date: string | null;
  seen: boolean;
}

export interface AttachmentInfo {
  index: number;
  filename: string;
  contentType: string;
  size: number;
  inline: boolean;
}

export interface MessageDetail extends MessageSummary {
  text: string;
  html: string | false;
  attachments: AttachmentInfo[];
}

function clientFor(account: EmailAccountRow): ImapFlow {
  const password = decrypt(account.password_encrypted);
  return new ImapFlow({
    host: `mail.${account.domain}`,
    port: 993,
    secure: true,
    // Certificado autofirmado hasta que el hostname tenga Let's Encrypt válido.
    tls: { rejectUnauthorized: false },
    auth: { user: account.email, pass: password },
    logger: false,
  });
}

// Las imágenes referenciadas inline (cid:...) se incrustan como data URI en el
// HTML para que se vean directo, sin depender de una petición aparte.
function embedInlineImages(html: string, attachments: Attachment[]): string {
  let out = html;
  for (const att of attachments) {
    if (!att.cid) continue;
    const dataUri = `data:${att.contentType};base64,${att.content.toString("base64")}`;
    out = out.split(`cid:${att.cid}`).join(dataUri);
  }
  return out;
}

function toAttachmentInfoList(attachments: Attachment[]): AttachmentInfo[] {
  return attachments.map((att, index) => ({
    index,
    filename: att.filename || `adjunto-${index + 1}`,
    contentType: att.contentType,
    size: att.size,
    inline: Boolean(att.cid),
  }));
}

export async function listMessages(
  account: EmailAccountRow,
  page = 1,
  pageSize = 25
): Promise<{ messages: MessageSummary[]; total: number }> {
  const client = clientFor(account);
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const total = client.mailbox && typeof client.mailbox !== "boolean" ? client.mailbox.exists : 0;
      if (total === 0) return { messages: [], total: 0 };

      const end = total - (page - 1) * pageSize;
      const start = Math.max(1, end - pageSize + 1);
      if (end < 1) return { messages: [], total };

      const messages: MessageSummary[] = [];
      for await (const msg of client.fetch(`${start}:${end}`, {
        envelope: true,
        uid: true,
        flags: true,
      })) {
        messages.push({
          uid: msg.uid,
          subject: msg.envelope?.subject || "(sin asunto)",
          from: msg.envelope?.from?.[0]
            ? `${msg.envelope.from[0].name || ""} <${msg.envelope.from[0].address}>`.trim()
            : "(desconocido)",
          date: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null,
          seen: msg.flags ? msg.flags.has("\\Seen") : false,
        });
      }
      messages.reverse(); // más recientes primero
      return { messages, total };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

export async function getMessage(account: EmailAccountRow, uid: number): Promise<MessageDetail | null> {
  const client = clientFor(account);
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const raw = await client.download(String(uid), undefined, { uid: true });
      if (!raw) return null;
      // Marcar como leído al abrirlo, igual que cualquier cliente de correo normal.
      await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      const parsed = await simpleParser(raw.content);
      const html = parsed.html ? embedInlineImages(parsed.html, parsed.attachments) : false;
      return {
        uid,
        subject: parsed.subject || "(sin asunto)",
        from: parsed.from?.text || "(desconocido)",
        date: parsed.date ? parsed.date.toISOString() : null,
        seen: true,
        text: parsed.text || "",
        html,
        attachments: toAttachmentInfoList(parsed.attachments),
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

export async function getAttachment(
  account: EmailAccountRow,
  uid: number,
  index: number
): Promise<Attachment | null> {
  const client = clientFor(account);
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const raw = await client.download(String(uid), undefined, { uid: true });
      if (!raw) return null;
      const parsed = await simpleParser(raw.content);
      return parsed.attachments[index] || null;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

export async function getUnseenCount(account: EmailAccountRow): Promise<number> {
  const client = clientFor(account);
  await client.connect();
  try {
    const status = await client.status("INBOX", { unseen: true });
    return status.unseen || 0;
  } finally {
    await client.logout();
  }
}

export async function setMessageSeen(account: EmailAccountRow, uid: number, seen: boolean): Promise<void> {
  const client = clientFor(account);
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      if (seen) {
        await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      } else {
        await client.messageFlagsRemove(String(uid), ["\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

export interface ShippedCandidate {
  uid: number;
  subject: string;
  date: string | null;
  html: string;
}

// Revisa los mensajes nuevos desde el último UID escaneado en busca de
// notificaciones de "shipped" (envío), y devuelve su HTML para que se les
// busque el link de rastreo aparte. sinceUid=0 revisa todo el buzón.
export async function scanForShippedMessages(
  account: EmailAccountRow,
  sinceUid: number
): Promise<{ candidates: ShippedCandidate[]; highestUid: number }> {
  const client = clientFor(account);
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      let highestUid = sinceUid;
      const matches: { uid: number; subject: string; date: string | null }[] = [];
      const range = `${sinceUid + 1}:*`;
      for await (const msg of client.fetch(range, { envelope: true, uid: true }, { uid: true })) {
        if (msg.uid > highestUid) highestUid = msg.uid;
        const subject = msg.envelope?.subject || "";
        if (/shipped/i.test(subject)) {
          matches.push({
            uid: msg.uid,
            subject,
            date: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null,
          });
        }
      }

      const candidates: ShippedCandidate[] = [];
      for (const match of matches) {
        const raw = await client.download(String(match.uid), undefined, { uid: true });
        if (!raw) continue;
        const parsed = await simpleParser(raw.content);
        if (parsed.html) {
          candidates.push({ ...match, html: parsed.html });
        }
      }
      return { candidates, highestUid };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

export async function deleteMessage(account: EmailAccountRow, uid: number): Promise<void> {
  const client = clientFor(account);
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      await client.messageDelete(String(uid), { uid: true });
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}
