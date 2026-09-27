import type { de } from "./de";

/**
 * German for a hair salon — an overlay on de.ts, not a dictionary of its own.
 * Only the messages that differ from the barbershop wording are here; every
 * other key falls through to de.ts.
 *
 * WHOLE SENTENCES, NOT A SWAPPED NOUN. "Barber" can't be substituted into
 * these sentences: the article and case around it change ("dieser Barber",
 * "des Barbers"), and "Stylist:in" takes neither form cleanly. So each message
 * is rewritten whole, and where a sentence would need a gendered article it is
 * rephrased around "diese Person" or "das Team" instead. "Stylist:in" is used
 * where it stands alone — a label, a heading, a button.
 *
 * Same register rules as de.ts: "du" where only the customer reads it, the
 * neutral infinitive in the dashboard and in validation messages.
 *
 * translate.test.ts holds every override to the placeholders of the message it
 * replaces, and checks that no salon-rendered message still says Barber or Shop.
 */
export const salonDe = {
  "booking.barber": "Stylist:in",

  "book.preferredBarber": "Wunsch-Stylist:in",
  "book.lostStaffTakenNamed":
    "{name} wurde gerade zu dieser Uhrzeit gebucht. Jemand anderes aus dem Team ist noch frei – unten steht jetzt, wer. Du kannst direkt noch einmal bestätigen.",
  "book.lostStaffTaken":
    "Die gewählte Person wurde gerade zu dieser Uhrzeit gebucht. Jemand anderes aus dem Team ist noch frei – unten steht jetzt, wer. Du kannst direkt noch einmal bestätigen.",
  "book.rateLimitUpcoming":
    "Du hast hier schon mehrere Termine gebucht. Für einen weiteren melde dich bitte direkt beim Salon.",
  "book.rateLimitUpcomingPhone":
    "Du hast hier schon mehrere Termine gebucht. Für einen weiteren ruf bitte im Salon an: {phone}.",
  "book.rateLimitRecent":
    "Das waren einige Buchungen in kurzer Zeit. Wenn du noch einen Termin brauchst, melde dich bitte direkt beim Salon.",
  "book.rateLimitRecentPhone":
    "Das waren einige Buchungen in kurzer Zeit. Wenn du noch einen Termin brauchst, ruf bitte im Salon an: {phone}.",

  "cancel.cancelledBody":
    "Der Termin unten ist nicht mehr reserviert, und die Zeit ist im Kalender des Salons wieder frei.",
  "cancel.closedNotice":
    "Dieser Termin kann nicht mehr online storniert werden. Falls etwas nicht passt, melde dich bitte direkt beim Salon.",
  "cancel.closedNoticePhone":
    "Dieser Termin kann nicht mehr online storniert werden. Falls etwas nicht passt, ruf bitte im Salon an: {phone}.",
  "cancel.tooLateContact":
    "Wenn du nicht kommen kannst, melde dich bitte direkt beim Salon – dort weiß man es lieber vorher.",
  "cancel.tooLateContactPhone":
    "Wenn du nicht kommen kannst, ruf bitte im Salon an: {phone} – dort weiß man es lieber vorher.",

  "manual.needStaff":
    "Zum Eintragen wird mindestens eine Person im Team gebraucht. Jemanden anlegen und Arbeitszeiten hinterlegen.",
  "manual.noHoursAtAll": "Für diese Person sind keine Arbeitszeiten hinterlegt.",
  "manual.phoneHint": "Daran erkennt der Salon auch Stammkunden wieder.",
  "manual.taken":
    "Diese Person hat zu dieser Zeit schon einen überschneidenden Termin. Eine andere Zeit oder jemand anderen aus dem Team wählen.",
  "manual.conflictOverlaps":
    "Diese Person hat zu dieser Zeit schon etwas gebucht – die eigenen Regeln des Salons lehnen das ab.",
  "manual.conflictTimeOff": "Das fällt in eine Abwesenheit dieser Person.",
  "manual.conflictOutsideHours":
    "Das liegt außerhalb der Arbeitszeiten dieser Person an diesem Tag.",

  "calendar.staffUnknown": "Unbekannt",
  "calendar.emptyTitle": "Noch keine Stylist:innen",

  "services.lengthHint": "So lange ist der Platz belegt.",

  "staff.intro":
    "Das Team und seine Arbeitszeiten. Alle aktiven Stylist:innen können jede aktive Leistung ausführen.",
  "staff.addHeading": "Stylist:in hinzufügen",
  "staff.notFound": "Stylist:in nicht gefunden",
  "staff.backToAll": "Alle Stylist:innen",
  "staff.workingHoursIntro":
    "Sie bestimmen, wann Kunden {name} buchen können, und ergeben zusammen mit den Zeiten des restlichen Teams die Öffnungszeiten auf der öffentlichen Seite. Für eine Mittagspause einem Tag einen zweiten Zeitraum hinzufügen.",
  "staff.gone": "Diese Person gibt es im Team nicht mehr. Bitte die Seite neu laden.",
  "staff.submitAdd": "Stylist:in hinzufügen",
  "staff.addNote":
    "Als Nächstes werden die Arbeitszeiten festgelegt. Bis dahin ist die Person nicht buchbar.",
  "staff.activeEmpty": "Noch keine Stylist:innen – oben die erste Person hinzufügen.",

  "hours.closedNote": "Ein Tag ohne Zeiten ist für diese Person geschlossen.",

  "settings.introBefore":
    "Wie weit im Voraus Kunden buchen können und wie viel Luft zwischen Terminen bleibt. Die Öffnungszeiten werden pro Stylist:in auf der Seite",
  "settings.gone":
    "Der Salon-Datensatz wurde nicht gefunden. Bitte ab- und wieder anmelden.",
  "settings.shopHeading": "Salon-Daten",

  "validation.phoneRequired":
    "Bitte eine Telefonnummer eingeben – der Salon braucht sie für Rückfragen.",
  "validation.staffNameRequired": "Bitte den Namen der Person eingeben.",
} as const satisfies Partial<Record<keyof typeof de, string>>;
