// Minimal typings for the slice of nodemailer we use (the package ships none; no @types dependency is added).
declare module "nodemailer" {
  export interface SendMailOptions {
    from?: string; to?: string | string[]; cc?: string | string[]; bcc?: string | string[]; subject?: string; text?: string; html?: string;
    inReplyTo?: string; references?: string | string[]; headers?: Record<string, string>; messageId?: string;
  }
  export interface SentMessageInfo { messageId: string; accepted?: unknown[]; rejected?: unknown[]; response?: string }
  export interface Transporter { sendMail(opts: SendMailOptions): Promise<SentMessageInfo>; close(): void }
  export interface TransportOptions {
    host: string; port: number; secure: boolean; auth?: { user: string; pass: string };
    connectionTimeout?: number; greetingTimeout?: number; socketTimeout?: number; requireTLS?: boolean;
  }
  export function createTransport(opts: TransportOptions): Transporter;
  const nodemailer: { createTransport: typeof createTransport };
  export default nodemailer;
}
