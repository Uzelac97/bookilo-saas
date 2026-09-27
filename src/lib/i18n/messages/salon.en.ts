import type { de } from "./de";

/**
 * English for a hair salon — an overlay on en.ts. Only the messages that
 * differ from the barbershop wording are here; see salon.de.ts for why these
 * are whole messages rather than a swapped noun.
 *
 * The two overlays needn't cover the same keys: "Any barber" needs a salon
 * version in English, while German's "Egal wer" was never vertical-specific.
 */
export const salonEn = {
  "booking.barber": "Stylist",

  "book.preferredBarber": "Preferred stylist",
  "book.anyBarber": "Any stylist",
  "book.lostStaffTakenNamed":
    "{name} was just booked at this time. Another stylist is still free — the details below now show who, so you can confirm again.",
  "book.lostStaffTaken":
    "That stylist was just booked at this time. Another stylist is still free — the details below now show who, so you can confirm again.",
  "book.rateLimitUpcoming":
    "You already have several appointments booked here. To add another, get in touch with the salon directly.",
  "book.rateLimitUpcomingPhone":
    "You already have several appointments booked here. To add another, call the salon on {phone}.",
  "book.rateLimitRecent":
    "That's a few bookings in a short time. If you need another appointment, get in touch with the salon directly.",
  "book.rateLimitRecentPhone":
    "That's a few bookings in a short time. If you need another appointment, call the salon on {phone}.",

  "cancel.cancelledBody":
    "The appointment below is no longer reserved, and the time is back on the salon's calendar.",
  "cancel.closedNotice":
    "This appointment can no longer be cancelled online. If something isn't right, get in touch with the salon directly.",
  "cancel.closedNoticePhone":
    "This appointment can no longer be cancelled online. If something isn't right, call the salon on {phone}.",
  "cancel.tooLateContact":
    "If you can't make it, get in touch with the salon directly — they'd rather know.",
  "cancel.tooLateContactPhone":
    "If you can't make it, call the salon on {phone} — they'd rather know.",

  "manual.needStaff":
    "You need at least one stylist before you can book anyone in. Add one, and give them working hours.",
  "manual.noHoursAtAll": "This stylist has no hours set for any day.",
  "manual.phoneHint": "Also how the salon recognises a returning customer.",
  "manual.taken":
    "That stylist already has an appointment overlapping this time. Pick another time or another stylist.",
  "manual.conflictOverlaps":
    "This stylist already has something booked over this time — the salon's own rules will reject it.",
  "manual.conflictTimeOff": "This falls inside time off for this stylist.",
  "manual.conflictOutsideHours":
    "This is outside this stylist's working hours for that day.",

  "calendar.staffUnknown": "Unknown stylist",
  "calendar.emptyTitle": "No stylists yet",

  "services.lengthHint": "How long the stylist is booked for.",

  "staff.intro":
    "Your stylists and the hours each of them works. Any active stylist can perform any active service.",
  "staff.addHeading": "Add a stylist",
  "staff.notFound": "Stylist not found",
  "staff.workingHoursIntro":
    "These decide when customers can book {name}, and together with your other stylists' hours they are the opening hours shown on your public page. Add a second interval to a day for a lunch break.",
  "staff.gone": "That stylist no longer exists. Reload the page.",
  "staff.submitAdd": "Add stylist",
  "staff.activeEmpty": "No stylists yet — add the first one above.",

  "hours.closedNote": "A day with no hours is closed for this stylist.",

  "settings.introBefore":
    "How far ahead customers can book, and how much room you leave between appointments. Your opening hours are set per stylist, on the",
  "settings.gone": "Your salon record couldn’t be found. Sign out and back in.",
  "settings.shopHeading": "Your salon",

  "validation.phoneRequired": "Enter a phone number so the salon can reach you.",
  "validation.staffNameRequired": "Enter this stylist's name.",
} as const satisfies Partial<Record<keyof typeof de, string>>;
