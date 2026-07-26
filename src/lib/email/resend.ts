import { Resend } from "resend";

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendResult =
  | { ok: true; skipped: boolean }
  | { ok: false; error: string };

/**
 * Sends one email through Resend, or logs it when the environment isn't
 * configured to send.
 *
 * The no-key path is not a convenience: without it, every local booking would
 * hit the "email failed" branch and the only way to see what a confirmation
 * actually says would be to have production credentials on a laptop. `skipped`
 * comes back so the caller can tell "nothing was sent, by design" apart from
 * "sent successfully" in its logs.
 *
 * Config is read per call rather than at module load. A module-level
 * `new Resend(process.env.RESEND_API_KEY)` throws on an absent key, which would
 * turn a missing variable into an import-time crash of every route that
 * transitively touches this file — including ones that never send anything.
 */
export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.info(
      `[email] not configured (${!apiKey ? "RESEND_API_KEY" : "EMAIL_FROM"} missing) — would have sent to ${email.to}: ${email.subject}\n${email.text}`,
    );

    return { ok: true, skipped: true };
  }

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    // The SDK reports API-level failures — an unverified domain, a rejected
    // recipient, a bad key — in the returned object rather than by throwing.
    // Treating a resolved promise as success is the easy mistake here, and it
    // fails silently: bookings keep working and no mail ever arrives.
    if (error) {
      return { ok: false, error: `${error.name}: ${error.message}` };
    }

    return { ok: true, skipped: false };
  } catch (error) {
    // Network-level failure, which the SDK does throw for.
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
