import { describe, expect, it } from "vitest";

import type { BookingByToken } from "@/lib/db/bookings";

import { renderBookingConfirmation } from "./booking-confirmation";
import { renderOwnerNotification } from "./owner-notification";
import { escapeHtml } from "./shell";

const CANCEL_URL = "https://book.example.com/b/demo/cancel/tok-123";

/** A booking on 2026-07-28 at 14:30 Berlin time. */
function booking(overrides: Partial<BookingByToken> = {}): BookingByToken {
  return {
    id: "bk_1",
    startAt: new Date("2026-07-28T12:30:00Z"),
    endAt: new Date("2026-07-28T13:00:00Z"),
    status: "CONFIRMED",
    cancelToken: "tok-123",
    service: { name: "Skin fade", durationMinutes: 30, priceMinorUnits: 2500 },
    staff: { name: "Marco" },
    customer: { name: "Jonas Weber", email: "jonas@example.com" },
    tenant: {
      slug: "demo",
      name: "Kaiser Barbers",
      timezone: "Europe/Berlin",
      phone: "030123456",
      address: "Kastanienallee 12, 10435 Berlin",
      cancellationWindowMinutes: 120,
    },
    ...overrides,
  };
}

describe("escapeHtml", () => {
  it("neutralises the characters that would break out of markup", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    expect(escapeHtml("Ben & Jerry's")).toBe("Ben &amp; Jerry&#39;s");
  });
});

describe("the shared shell", () => {
  it("signs both emails off with the product name, in HTML and text", () => {
    // One place spells the brand (shell.ts), so this asserts on both templates
    // rather than on the constant — the thing that could regress is a new email
    // rendering without it, not the string itself.
    const confirmation = renderBookingConfirmation(booking(), CANCEL_URL);
    const notification = renderOwnerNotification(booking(), "+491761234567");

    for (const mail of [confirmation, notification]) {
      expect(mail.html).toContain("Sent by Bookilo");
      expect(mail.text).toContain("Sent by Bookilo");
    }
  });
});

describe("renderBookingConfirmation", () => {
  it("renders the appointment in the shop's timezone, not the server's", () => {
    // 12:30 UTC is 14:30 in Berlin. A confirmation an hour out is the single
    // worst thing this email can get wrong.
    const mail = renderBookingConfirmation(booking(), CANCEL_URL);

    expect(mail.text).toContain("14:30");
    expect(mail.subject).toContain("14:30");
    expect(mail.subject).toContain("Tue, 28 Jul");
  });

  it("carries the cancel link in both the HTML and the text part", () => {
    const mail = renderBookingConfirmation(booking(), CANCEL_URL);

    expect(mail.html).toContain(`href="${CANCEL_URL}"`);
    expect(mail.text).toContain(CANCEL_URL);
    expect(mail.text).toContain("2 h");
  });

  it("includes the address when the shop has one, and omits it otherwise", () => {
    const withAddress = renderBookingConfirmation(booking(), CANCEL_URL);
    expect(withAddress.text).toContain("Kastanienallee 12");

    const without = renderBookingConfirmation(
      booking({ tenant: { ...booking().tenant, address: null } }),
      CANCEL_URL,
    );
    expect(without.text).not.toContain("Where");
  });

  it("escapes customer-supplied text rather than emitting it as markup", () => {
    // Only the first name reaches this email, in the greeting.
    const mail = renderBookingConfirmation(
      booking({
        customer: { name: `<b>Jonas</b> Weber`, email: "j@example.com" },
      }),
      CANCEL_URL,
    );

    expect(mail.html).not.toContain("<b>Jonas</b>");
    expect(mail.html).toContain("Thanks &lt;b&gt;Jonas&lt;/b&gt;");
  });
});

describe("renderOwnerNotification", () => {
  it("leads with the customer's name and number", () => {
    const mail = renderOwnerNotification(booking(), "+491761234567");

    expect(mail.subject).toBe("New booking: Jonas Weber, Tue, 28 Jul at 14:30");
    expect(mail.text).toContain("Customer: Jonas Weber");
    expect(mail.text).toContain("Phone: +491761234567");
  });

  it("says so plainly when no email was given", () => {
    // The owner needs to know this customer has no cancellation link, or they'll
    // wonder why the person phoned instead of cancelling online.
    const mail = renderOwnerNotification(
      booking({ customer: { name: "Jonas Weber", email: null } }),
      "+491761234567",
    );

    expect(mail.text).toContain("Email: not given");
    expect(mail.text).toContain("no cancellation link");
  });

  it("escapes the full customer name it renders in a row", () => {
    // The owner's mail is where an unescaped name would do real damage: it
    // prints the whole thing, straight from the public form.
    const mail = renderOwnerNotification(
      booking({
        customer: { name: `<b>Jonas</b> & "Co"`, email: null },
      }),
      "+491761234567",
    );

    expect(mail.html).not.toContain("<b>Jonas</b>");
    expect(mail.html).toContain("&lt;b&gt;Jonas&lt;/b&gt; &amp; &quot;Co&quot;");
  });

  it("does not leak the cancel token to the owner's inbox", () => {
    // The owner has no use for it, and it's a bearer secret that cancels the
    // customer's booking. It should not travel further than it has to.
    const mail = renderOwnerNotification(booking(), "+491761234567");

    expect(mail.html).not.toContain("tok-123");
    expect(mail.text).not.toContain("tok-123");
  });
});
