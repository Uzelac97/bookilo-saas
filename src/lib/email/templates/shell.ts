/**
 * The shared skeleton both booking emails render into.
 *
 * Two emails don't justify a templating library — but they do justify one place
 * that decides what an email from this product looks like, and above all one
 * place that escapes. Every value below passes through customer-supplied text at
 * some point (a name, a service the owner typed), and an email body is an HTML
 * document like any other.
 *
 * Styling is inline on every element on purpose. A `<style>` block is the
 * obvious way to write this and the wrong one: Gmail strips head styles in
 * several contexts, and there is no way to tell from the sending side. Inline
 * attributes are the only thing every client agrees on.
 */

export type EmailRow = { label: string; value: string };

export type EmailContent = {
  /** The `<h1>`, and the first thing a preview pane shows. */
  heading: string;
  lead: string;
  rows: EmailRow[];
  /** A single prominent link. Omitted when there's nothing to click. */
  action?: { label: string; url: string; hint?: string };
  /** Small print, one paragraph per entry. */
  footerLines: string[];
};

/**
 * HTML-escapes a value for both text and attribute contexts.
 *
 * Not optional politeness: `Ben & Jerry's` in a customer name would otherwise
 * produce malformed markup, and a name containing a tag would produce markup we
 * didn't write. The five characters below are the full set that matters for the
 * two contexts this file uses.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * The product sign-off, on every email, below the shop's own footer lines.
 *
 * Kept here rather than passed in by each template so there is exactly one
 * place the brand is spelled — and so a new email can't ship without it. It
 * sits last and small on purpose: the sender a customer cares about is the
 * shop, and an email that leads with the software's name instead of the
 * barber's reads like spam. This is attribution, not a header.
 */
const SIGN_OFF = "Sent by Bookilo";

export function renderHtml(content: EmailContent): string {
  const rows = content.rows
    .map(
      (row) => `
        <tr>
          <td style="padding:6px 0;color:#71717a;font-size:14px;">${escapeHtml(row.label)}</td>
          <td style="padding:6px 0;color:#18181b;font-size:14px;font-weight:600;text-align:right;">${escapeHtml(row.value)}</td>
        </tr>`,
    )
    .join("");

  const action = content.action
    ? `
      <p style="margin:24px 0 0;">
        <a href="${escapeHtml(content.action.url)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#18181b;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">${escapeHtml(content.action.label)}</a>
      </p>
      ${
        content.action.hint
          ? `<p style="margin:10px 0 0;color:#71717a;font-size:13px;">${escapeHtml(content.action.hint)}</p>`
          : ""
      }`
    : "";

  const footer = content.footerLines
    .map(
      (line) =>
        `<p style="margin:8px 0 0;color:#71717a;font-size:13px;">${escapeHtml(line)}</p>`,
    )
    .join("");

  return `<div style="margin:0;padding:24px;background:#fafafa;font-family:${FONT};">
  <div style="max-width:480px;margin:0 auto;padding:28px;background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;">
    <h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;color:#18181b;">${escapeHtml(content.heading)}</h1>
    <p style="margin:0 0 20px;color:#52525b;font-size:15px;line-height:1.5;">${escapeHtml(content.lead)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border-top:1px solid #e4e4e7;">
      ${rows}
    </table>
    ${action}
    ${footer}
    <p style="margin:20px 0 0;padding-top:14px;border-top:1px solid #f4f4f5;color:#a1a1aa;font-size:12px;">${escapeHtml(SIGN_OFF)}</p>
  </div>
</div>`;
}

/**
 * The plain-text alternative, built from the same object as the HTML.
 *
 * Sharing the input is the point: a text part that's assembled separately drifts
 * from the HTML one silently, because nobody reads it. Some clients and most
 * spam filters do.
 */
export function renderText(content: EmailContent): string {
  const parts = [
    content.heading,
    "",
    content.lead,
    "",
    ...content.rows.map((row) => `${row.label}: ${row.value}`),
  ];

  if (content.action) {
    parts.push("", `${content.action.label}: ${content.action.url}`);
    if (content.action.hint) parts.push(content.action.hint);
  }

  if (content.footerLines.length) {
    parts.push("", ...content.footerLines);
  }

  parts.push("", SIGN_OFF);

  return `${parts.join("\n")}\n`;
}
