import { mailcowClientFor } from "./client";
import { MailcowServerRow } from "../db";

export async function createMailbox(
  server: MailcowServerRow,
  localPart: string,
  domain: string,
  password: string,
  quotaMb: number
): Promise<void> {
  const { apiPost } = mailcowClientFor(server);
  await apiPost("/add/mailbox", {
    local_part: localPart,
    domain,
    name: localPart,
    quota: quotaMb,
    password,
    password2: password,
    active: "1",
  });
}

export async function deleteMailbox(server: MailcowServerRow, email: string): Promise<void> {
  const { apiPost } = mailcowClientFor(server);
  await apiPost("/delete/mailbox", [email]);
}

// Mailcow (rspamd) mandaba los correos de Depop a Junk en vez de la bandeja
// de entrada. Este prefiltro sieve se le agrega a cada buzón nuevo para que
// esos correos entren directo, sin depender de arreglarlo a mano cada vez.
const DEPOP_INBOX_SIEVE =
  'require ["fileinto"];\nif header :contains "from" "depop.com" {\n  fileinto "INBOX";\n  stop;\n}';

export async function addDepopInboxFilter(server: MailcowServerRow, email: string): Promise<void> {
  const { apiPost } = mailcowClientFor(server);
  await apiPost("/add/filter", {
    username: email,
    filter_type: "prefilter",
    script_desc: "Depop siempre a INBOX",
    script_data: DEPOP_INBOX_SIEVE,
    active: "1",
  });
}
