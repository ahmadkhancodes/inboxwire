// Unified search syntax: from: to: subject: after: before: has:attachment, bare words. Quotes group.
export interface ParsedQuery {
  from: string[]; to: string[]; subject: string[]; text: string[];
  after?: string; before?: string; hasAttachment?: boolean;
}
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseQuery(input: string): ParsedQuery {
  const q: ParsedQuery = { from: [], to: [], subject: [], text: [] };
  const re = /(?:(\w+):)?(?:"([^"]*)"|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    const key = m[1]?.toLowerCase();
    const val = m[2] ?? m[3] ?? '';
    if (!val) continue;
    switch (key) {
      case 'from': q.from.push(val); break;
      case 'to': q.to.push(val); break;
      case 'subject': q.subject.push(val); break;
      case 'after': if (!DATE.test(val)) throw new Error(`after: expects YYYY-MM-DD, got "${val}"`); q.after = val; break;
      case 'before': if (!DATE.test(val)) throw new Error(`before: expects YYYY-MM-DD, got "${val}"`); q.before = val; break;
      case 'has': if (val === 'attachment') q.hasAttachment = true; else throw new Error(`has: supports only "attachment", got "${val}"`); break;
      case undefined: q.text.push(val); break;
      default: q.text.push(`${key}:${val}`);
    }
  }
  return q;
}

const quote = (s: string) => (/[\s"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);

export function toGmail(q: ParsedQuery): string {
  const p: string[] = [];
  q.from.forEach((v) => p.push(`from:${quote(v)}`));
  q.to.forEach((v) => p.push(`to:${quote(v)}`));
  q.subject.forEach((v) => p.push(`subject:${quote(v)}`));
  q.text.forEach((v) => p.push(quote(v)));
  if (q.after) p.push(`after:${q.after.replace(/-/g, '/')}`);
  if (q.before) p.push(`before:${q.before.replace(/-/g, '/')}`);
  if (q.hasAttachment) p.push('has:attachment');
  return p.join(' ');
}

/** Returns IMAP SEARCH criteria in ImapFlow object form. */
export function toImap(q: ParsedQuery): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  if (q.from.length) c.from = q.from[0];
  if (q.to.length) c.to = q.to[0];
  if (q.subject.length) c.subject = q.subject[0];
  if (q.text.length) c.body = q.text.join(' ');
  if (q.after) c.since = q.after;
  if (q.before) c.before = q.before;
  if (q.hasAttachment) c.header = { 'content-type': 'multipart/mixed' };
  return c;
}

const odata = (s: string) => s.replace(/'/g, "''");
/** Graph: $filter for structured parts, $search for free text. They cannot be combined on messages, so $search wins when text exists and structured parts become KQL. */
export function toGraph(q: ParsedQuery): { $filter?: string; $search?: string } {
  if (q.text.length || q.subject.length > 1 || q.from.length > 1) {
    const kql: string[] = [];
    q.from.forEach((v) => kql.push(`from:${quote(v)}`));
    q.to.forEach((v) => kql.push(`to:${quote(v)}`));
    q.subject.forEach((v) => kql.push(`subject:${quote(v)}`));
    q.text.forEach((v) => kql.push(quote(v)));
    if (q.after) kql.push(`received>=${q.after}`);
    if (q.before) kql.push(`received<${q.before}`);
    if (q.hasAttachment) kql.push('hasattachments:true');
    return { $search: `"${kql.join(' ').replace(/"/g, '')}"` };
  }
  const f: string[] = [];
  if (q.from[0]) f.push(`from/emailAddress/address eq '${odata(q.from[0])}'`);
  if (q.subject[0]) f.push(`contains(subject,'${odata(q.subject[0])}')`);
  if (q.after) f.push(`receivedDateTime ge ${q.after}T00:00:00Z`);
  if (q.before) f.push(`receivedDateTime lt ${q.before}T00:00:00Z`);
  if (q.hasAttachment) f.push('hasAttachments eq true');
  return f.length ? { $filter: f.join(' and ') } : {};
}
