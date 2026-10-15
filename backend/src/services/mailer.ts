import nodemailer, { Transporter } from 'nodemailer';
import type { Sender } from '../db/schema';

const transporters = new Map<string, Transporter>();

function getTransporter(sender: Sender): Transporter {
  let t = transporters.get(sender.id);
  if (!t) {
    t = nodemailer.createTransport({
      host: sender.smtpHost,
      port: sender.smtpPort,
      secure: sender.smtpPort === 465,
      auth: sender.smtpUser ? { user: sender.smtpUser, pass: sender.smtpPass } : undefined,
    });
    transporters.set(sender.id, t);
  }
  return t;
}

export async function sendMail(
  sender: Sender,
  msg: { to: string; subject: string; html: string },
) {
  const info = await getTransporter(sender).sendMail({
    from: `"${sender.name}" <${sender.email}>`,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
  });
  // Only Ethereal returns a preview URL; false/undefined for other SMTP servers.
  const previewUrl = nodemailer.getTestMessageUrl(info) || null;
  return { messageId: info.messageId as string, previewUrl };
}

/** Create a fresh Ethereal inbox (fake SMTP) and return its credentials. */
export async function createEtherealAccount() {
  const acc = await nodemailer.createTestAccount();
  return {
    email: acc.user,
    smtpHost: acc.smtp.host,
    smtpPort: acc.smtp.port,
    smtpUser: acc.user,
    smtpPass: acc.pass,
  };
}
