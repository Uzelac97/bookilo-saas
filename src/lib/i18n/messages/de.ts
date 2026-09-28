/**
 * German — the source of truth for which keys exist.
 * `MessageKey` in ../translate.ts is derived from this object, and en.ts must
 * supply exactly the same keys or `tsc` fails.
 *
 * Register: "du" wherever only a customer reads it (the public booking flow
 * and the emails), which is how a barbershop talks to its customers. The
 * owner dashboard and the validation messages, which both audiences see, use
 * the neutral infinitive instead ("Bitte … eingeben.").
 *
 * Flat dotted keys rather than nested objects, so a key reads the same at the
 * call site, in a grep, and here. `{name}` is a placeholder; a pair of keys
 * ending `.one` / `.other` is one plural message, called by its base.
 */
export const de = {
  // ─── App-wide ─────────────────────────────────────────────────────────────
  "meta.description": "Online-Terminbuchung für Barbershops und Friseursalons.",
  "common.email": "E-Mail",

  "preferences.language": "Sprache",
  "preferences.theme": "Erscheinungsbild",
  "preferences.themeSystem": "Systemeinstellung",
  "preferences.themeLight": "Hell",
  "preferences.themeDark": "Dunkel",

  "duration.days.one": "{count} Tag",
  "duration.days.other": "{count} Tage",
  "duration.hours.one": "{count} Std.",
  "duration.hours.other": "{count} Std.",
  "duration.minutes.one": "{count} Min.",
  "duration.minutes.other": "{count} Min.",

  "cancellation.policyAnyTime":
    "Du kannst jederzeit vor deinem Termin online stornieren.",
  "cancellation.policyUpTo":
    "Du kannst bis {duration} vor deinem Termin online stornieren.",

  // The schema's dayOfWeek numbering: 0 is Sunday. See lib/i18n/weekdays.ts.
  "weekday.0": "Sonntag",
  "weekday.1": "Montag",
  "weekday.2": "Dienstag",
  "weekday.3": "Mittwoch",
  "weekday.4": "Donnerstag",
  "weekday.5": "Freitag",
  "weekday.6": "Samstag",

  "weekdayShort.0": "So",
  "weekdayShort.1": "Mo",
  "weekdayShort.2": "Di",
  "weekdayShort.3": "Mi",
  "weekdayShort.4": "Do",
  "weekdayShort.5": "Fr",
  "weekdayShort.6": "Sa",

  // ─── A booking, wherever it is summarised ─────────────────────────────────
  "booking.service": "Leistung",
  "booking.barber": "Barber",
  "booking.when": "Wann",
  "booking.duration": "Dauer",
  "booking.price": "Preis",
  "booking.dateAtTime": "{date} um {time}",
  "booking.cancelledHeading": "Dieser Termin ist storniert",
  "booking.backTo": "Zurück zu {shop}",
  "booking.linkInvalidTitle": "Dieser Link ist ungültig",
  "booking.linkInvalidBody":
    "Vielleicht ist er unvollständig oder veraltet. Prüf den Link in deiner Bestätigungs-E-Mail oder melde dich direkt dort, wo du gebucht hast.",

  // ─── Public shop page ─────────────────────────────────────────────────────
  "shop.businessTypeBarbershop": "Barbershop",
  "shop.businessTypeSalon": "Friseursalon",
  "shop.metaDescription": "Termin buchen bei {shop}.",
  "shop.metaDescriptionWithAddress": "Termin buchen bei {shop}, {address}.",
  "shop.notFoundTitle": "Shop nicht gefunden",
  "shop.notFoundBody":
    "Diese Buchungsseite gibt es nicht. Prüf den Link oder frag den Shop nach seiner Buchungsadresse.",
  "shop.services": "Leistungen",
  "shop.openingHours": "Öffnungszeiten",
  "shop.closed": "Geschlossen",
  "shop.noServices": "Noch keine Leistungen eingetragen.",
  "shop.otherCategory": "Sonstiges",
  "shop.book": "Buchen",
  "shop.changeService": "Ändern",

  // ─── Booking flow ─────────────────────────────────────────────────────────
  "book.metaTitle": "Buchen · {shop}",
  "book.heading": "Termin buchen",
  "book.timezoneNote": "Uhrzeiten für {date}, Ortszeit von {shop}.",
  "book.pickDate": "Datum wählen",
  "book.chooseDate": "Datum wählen",
  "book.previousWeek": "Vorherige Woche",
  "book.nextWeek": "Nächste Woche",
  "book.preferredBarber": "Wunsch-Barber",
  "book.anyBarber": "Egal wer",
  "book.pickTime": "Uhrzeit wählen",
  "book.partMorning": "Vormittag",
  "book.partAfternoon": "Nachmittag",
  "book.partEvening": "Abend",
  "book.slotGroupLabel": "Uhrzeiten: {part}",
  "book.closedOnDay": "An diesem Tag geschlossen.",
  "book.fullyBooked": "Ausgebucht – probier einen anderen Tag.",
  "book.yourDetails": "Deine Angaben",
  "book.yourName": "Dein Name",
  "book.phone": "Telefon",
  "book.emailHint":
    "Optional – für deine Bestätigung und den Stornierungslink.",
  "book.submit": "Termin bestätigen",
  "book.submitting": "Wird bestätigt…",
  "book.error":
    "Bei uns ist etwas schiefgelaufen, der Termin wurde nicht gespeichert. Bitte versuch es noch einmal.",
  "book.lostStaffTakenNamed":
    "{name} wurde gerade zu dieser Uhrzeit gebucht. Ein anderer Barber ist noch frei – unten steht jetzt, wer. Du kannst direkt noch einmal bestätigen.",
  "book.lostStaffTaken":
    "Dieser Barber wurde gerade zu dieser Uhrzeit gebucht. Ein anderer Barber ist noch frei – unten steht jetzt, wer. Du kannst direkt noch einmal bestätigen.",
  "book.lostSlotTaken":
    "Jemand hat diese Uhrzeit kurz vor dir gebucht. Die Zeiten unten sind aktuell – bitte wähl eine andere.",
  "book.lostUnavailable":
    "Diese Uhrzeit ist nicht mehr verfügbar. Die Zeiten unten sind aktuell – bitte wähl eine andere.",
  "book.rateLimitUpcoming":
    "Du hast hier schon mehrere Termine gebucht. Für einen weiteren melde dich bitte direkt beim Shop.",
  "book.rateLimitUpcomingPhone":
    "Du hast hier schon mehrere Termine gebucht. Für einen weiteren ruf bitte im Shop an: {phone}.",
  "book.rateLimitRecent":
    "Das waren einige Buchungen in kurzer Zeit. Wenn du noch einen Termin brauchst, melde dich bitte direkt beim Shop.",
  "book.rateLimitRecentPhone":
    "Das waren einige Buchungen in kurzer Zeit. Wenn du noch einen Termin brauchst, ruf bitte im Shop an: {phone}.",

  // ─── Confirmation page ────────────────────────────────────────────────────
  "booked.metaTitle": "Termin bestätigt",
  "booked.heading": "Du bist eingetragen",
  "booked.thanks": "Danke, {name} – dein Termin ist gespeichert.",
  "booked.cancelledBody": "Der Termin unten ist nicht mehr reserviert.",
  "booked.changeIntro": "Etwas geändert?",
  "booked.cancelLink": "Termin stornieren",
  "booked.emailHasLink":
    "– derselbe Link steht auch in deiner Bestätigungs-E-Mail.",

  // ─── Cancel page ──────────────────────────────────────────────────────────
  "cancel.metaTitle": "Termin stornieren",
  "cancel.heading": "Termin stornieren",
  "cancel.intro": "Prüf die Angaben unten, bevor du bestätigst.",
  "cancel.cancelledBody":
    "Der Termin unten ist nicht mehr reserviert, und die Zeit ist im Kalender des Shops wieder frei.",
  "cancel.warning":
    "Damit wird die Zeit für andere frei, und das lässt sich nicht rückgängig machen – du müsstest neu buchen.",
  "cancel.submit": "Termin stornieren",
  "cancel.submitting": "Wird storniert…",
  "cancel.closedNotice":
    "Dieser Termin kann nicht mehr online storniert werden. Falls etwas nicht passt, melde dich bitte direkt beim Shop.",
  "cancel.closedNoticePhone":
    "Dieser Termin kann nicht mehr online storniert werden. Falls etwas nicht passt, ruf bitte im Shop an: {phone}.",
  "cancel.closedReasonAtStart":
    "Online stornieren geht nur bis zum Beginn eines Termins – für diesen ist es jetzt zu spät.",
  "cancel.closedReasonWindow":
    "Online stornieren geht nur bis {duration} vor einem Termin – dieser ist jetzt zu nah.",
  "cancel.tooLateContact":
    "Wenn du nicht kommen kannst, melde dich bitte direkt beim Shop – dort weiß man es lieber vorher.",
  "cancel.tooLateContactPhone":
    "Wenn du nicht kommen kannst, ruf bitte im Shop an: {phone} – dort weiß man es lieber vorher.",

  // ─── Emails (always German — see EMAIL_LOCALE) ────────────────────────────
  "email.signOff": "Gesendet über Bookilo",
  "email.where": "Wo",
  "email.questions": "Fragen? Melde dich bei {shop}.",
  "email.questionsPhone": "Fragen? Ruf {shop} an: {phone}.",
  "email.confirmationLead":
    "Danke, {name} – {shop} hat dich für {service} eingetragen: {when}.",
  "email.confirmationSubject": "Dein Termin bei {shop} – {date}, {time}",
  "email.customer": "Kunde",
  "email.notGiven": "nicht angegeben",
  "email.ownerHeading": "Neue Buchung",
  "email.ownerLead": "{customer} hat {service} bei {barber} gebucht: {when}.",
  "email.ownerCustomerNotified":
    "Der Kunde hat eine Bestätigung mit Stornierungslink erhalten.",
  "email.ownerCustomerNoEmail":
    "Es wurde keine E-Mail angegeben – der Kunde hat also keine Bestätigung und keinen Stornierungslink und muss für Änderungen anrufen.",
  "email.ownerSubject": "Neue Buchung: {customer}, {when}",

  // ─── Login ────────────────────────────────────────────────────────────────
  "login.title": "Anmelden",
  "login.subtitle": "Termine, Team und Leistungen verwalten.",
  "login.password": "Passwort",
  "login.submit": "Anmelden",
  "login.submitting": "Anmeldung läuft…",
  "login.invalidCredentials": "E-Mail oder Passwort ist falsch.",

  // ─── Dashboard shell ──────────────────────────────────────────────────────
  "dashboard.viewPublicPage": "Öffentliche Seite ansehen",
  "dashboard.signOut": "Abmelden",
  "nav.label": "Dashboard",
  "nav.today": "Heute",
  "nav.calendar": "Kalender",
  "nav.services": "Leistungen",
  "nav.staff": "Team",
  "nav.settings": "Einstellungen",

  "common.saving": "Wird gespeichert…",

  // ─── Dashboard: shared ────────────────────────────────────────────────────
  "dashboard.newBooking": "Neuer Termin",
  "dashboard.walkIn": "Laufkundschaft",
  "status.cancelled": "Storniert",
  "status.completed": "Erledigt",
  "status.noShow": "Nicht erschienen",
  "summary.booked": "Gebucht",
  "summary.appointments.one": "Termin",
  "summary.appointments.other": "Termine",
  "summary.next": "Als Nächstes",
  "summary.nothingLeftToday": "heute nichts mehr",
  "summary.bookedValue": "Gebuchter Umsatz",
  "summary.exclNoShows": "ohne Nichterscheinen",

  "summary.nothingUpcoming": "nichts mehr geplant",

  "common.adding": "Wird hinzugefügt…",
  "common.saveChanges": "Änderungen speichern",
  "common.cancel": "Abbrechen",
  "common.edit": "Bearbeiten",
  "common.saveError":
    "Etwas ist schiefgelaufen, es wurde nichts gespeichert. Bitte noch einmal versuchen.",

  "common.saved": "Gespeichert.",

  // ─── Dashboard: today ─────────────────────────────────────────────────────
  "today.emptyTitle": "Heute keine Termine",
  "today.emptyBodyBefore": "Buchungen über die",
  "today.emptyBodyLink": "öffentliche Seite",
  "today.emptyBodyAfter": "erscheinen hier.",

  // ─── Dashboard: manual booking ────────────────────────────────────────────
  "manual.intro":
    "Für Laufkundschaft oder eine telefonische Buchung. Zeiten außerhalb der Arbeitszeiten sind erlaubt – es wird angezeigt, womit sie kollidieren.",
  "manual.needStaff":
    "Zum Eintragen wird mindestens ein Barber gebraucht. Einen anlegen und Arbeitszeiten hinterlegen.",
  "manual.goToStaff": "Zum Team",
  "manual.needService":
    "Es wird mindestens eine buchbare Leistung gebraucht – sie bestimmt, wie lange der Termin dauert.",
  "manual.goToServices": "Zu den Leistungen",
  "manual.day": "Tag",
  "manual.startTime": "Beginn",
  "manual.loadingTimes": "Zeiten werden geladen…",
  "manual.openTimes": "Freie Zeiten",
  "manual.noHoursAtAll":
    "Für diesen Barber sind keine Arbeitszeiten hinterlegt.",
  "manual.nothingOpen":
    "An diesem Tag ist nichts frei – eine Uhrzeit kann trotzdem unten eingegeben werden.",
  "manual.customerName": "Name des Kunden",
  "manual.phoneHint": "Daran erkennt der Shop auch Stammkunden wieder.",
  "manual.emailHint":
    "Optional – schickt eine Bestätigung und einen Stornierungslink.",
  "manual.taken":
    "Dieser Barber hat zu dieser Zeit schon einen überschneidenden Termin. Eine andere Zeit oder einen anderen Barber wählen.",
  "manual.impossibleTime":
    "Diese Uhrzeit gibt es an diesem Tag nicht – die Uhren werden vorgestellt. Eine Zeit vor oder nach der Umstellung wählen.",
  "manual.error":
    "Etwas ist schiefgelaufen, der Termin wurde nicht gespeichert. Bitte noch einmal versuchen.",
  "manual.submit": "Termin anlegen",
  "manual.conflictOverlaps":
    "Dieser Barber hat zu dieser Zeit schon etwas gebucht – die eigenen Regeln des Shops lehnen das ab.",
  "manual.conflictTimeOff": "Das fällt in eine Abwesenheit dieses Barbers.",
  "manual.conflictOutsideHours":
    "Das liegt außerhalb der Arbeitszeiten dieses Barbers an diesem Tag.",
  "manual.conflictPast": "Diese Uhrzeit ist schon vorbei.",

  // ─── Dashboard: calendar ──────────────────────────────────────────────────
  "calendar.noAppointments": "Keine Termine",
  "calendar.appointmentCount.one": "{count} Termin",
  "calendar.appointmentCount.other": "{count} Termine",
  "calendar.cancelledCount.one": "{count} storniert",
  "calendar.cancelledCount.other": "{count} storniert",
  "calendar.previousDay": "Vorheriger Tag",
  "calendar.nextDay": "Nächster Tag",
  "calendar.previousWeek": "Vorherige Woche",
  "calendar.nextWeek": "Nächste Woche",
  "calendar.view": "Kalenderansicht",
  "calendar.viewDay": "Tag",
  "calendar.viewWeek": "Woche",
  "calendar.nothingBooked": "Nichts gebucht",
  "calendar.staffInactive": "Nicht mehr dabei",
  "calendar.staffUnknown": "Unbekannter Barber",
  "calendar.slotLink": "Neuer Termin, {column} um {time}",
  "calendar.emptyTitle": "Noch keine Barber",
  "calendar.emptyBodyBefore": "Auf der",
  "calendar.emptyBodyLink": "Team-Seite",
  "calendar.emptyBodyAfter": "jemanden anlegen, dann erscheint der Tag hier.",

  // ─── Dashboard: services ──────────────────────────────────────────────────
  "services.intro":
    "Was Kunden buchen können, wie lange es dauert und was es kostet.",
  "services.addHeading": "Leistung hinzufügen",
  "services.name": "Name",
  "services.namePlaceholder": "Haarschnitt",
  "services.category": "Kategorie",
  "services.categoryPlaceholder": "Haare",
  "services.categoryHint":
    "Optional – gruppiert Leistungen auf der öffentlichen Seite.",
  "services.nameEn": "Name auf Englisch",
  "services.categoryEn": "Kategorie auf Englisch",
  "services.englishHint":
    "Optional – wird auf der öffentlichen Seite gezeigt, wenn jemand auf Englisch umschaltet.",
  "services.length": "Dauer in Minuten",
  "services.lengthHint": "So lange ist der Stuhl belegt.",
  "services.price": "Preis in €",
  "services.added": "„{name}“ hinzugefügt.",
  "services.gone":
    "Diese Leistung gibt es nicht mehr. Bitte die Seite neu laden.",
  "services.submitAdd": "Leistung hinzufügen",
  "services.editNote":
    "Eine geänderte Dauer lässt bestehende Termine so, wie sie gebucht wurden. Ein geänderter Preis ändert auch den Umsatz, der für vergangene Termine angezeigt wird.",
  "services.bookable": "Buchbar",
  "services.bookableEmpty":
    "Noch nichts buchbar – oben die erste Leistung hinzufügen.",
  "services.retired": "Eingestellt",
  "services.retiredHint":
    "Für Kunden nicht sichtbar. Bestehende Termine behalten sie.",
  "services.retire": "Einstellen",
  "services.restore": "Wiederherstellen",

  // ─── Dashboard: staff ─────────────────────────────────────────────────────
  "staff.intro":
    "Die Barber und ihre Arbeitszeiten. Jeder aktive Barber kann jede aktive Leistung ausführen.",
  "staff.addHeading": "Barber hinzufügen",
  "staff.notFound": "Barber nicht gefunden",
  "staff.backToAll": "Alle Barber",
  "staff.inactiveBadge": "Nicht mehr dabei",
  "staff.upcoming.one": "{count} anstehender Termin",
  "staff.upcoming.other": "{count} anstehende Termine",
  "staff.details": "Angaben",
  "staff.workingHours": "Arbeitszeiten",
  "staff.workingHoursIntro":
    "Sie bestimmen, wann Kunden {name} buchen können, und ergeben zusammen mit den Zeiten der anderen Barber die Öffnungszeiten auf der öffentlichen Seite. Für eine Mittagspause einem Tag einen zweiten Zeitraum hinzufügen.",
  "staff.timeOff": "Abwesenheiten",
  "staff.timeOffIntro":
    "Urlaub, Arzttermine, ein freier Vormittag – in dieser Zeit können Kunden {name} nicht buchen. Die Arbeitszeiten oben sind die normale Woche, das hier unterbricht sie.",
  "staff.timeOffNote":
    "Bereits gebuchte Termine innerhalb einer Abwesenheit bleiben bestehen, und Abwesenheiten erscheinen noch nicht im Kalender.",
  "staff.photoLink": "Foto-Link",
  "staff.photoHint": "Optional – wird auf der öffentlichen Seite angezeigt.",
  "staff.gone": "Diesen Barber gibt es nicht mehr. Bitte die Seite neu laden.",
  "staff.submitAdd": "Barber hinzufügen",
  "staff.addNote":
    "Als Nächstes werden die Arbeitszeiten festgelegt. Bis dahin ist der Barber nicht buchbar.",
  "staff.active": "Aktiv",
  "staff.activeEmpty": "Noch keine Barber – oben den ersten hinzufügen.",
  "staff.inactiveHint":
    "Für Kunden nicht buchbar. Vergangene und künftige Termine bleiben unverändert.",
  "staff.remove": "Entfernen",
  "staff.bringBack": "Zurückholen",
  "staff.removeQuestion": "{name} von der Buchungsseite entfernen?",
  "staff.removeNoUpcoming": "Es stehen keine Termine an.",
  "staff.removeUpcoming.one":
    "Der anstehende Termin bleibt im Kalender – er muss selbst verschoben oder storniert werden.",
  "staff.removeUpcoming.other":
    "Die {count} anstehenden Termine bleiben im Kalender – sie müssen selbst verschoben oder storniert werden.",
  "staff.removeHoursKept":
    "Die Arbeitszeiten bleiben erhalten, ein Zurückholen ist später jederzeit möglich.",
  "staff.removeConfirm": "{name} entfernen",
  "staff.keep": "Behalten",
  "staff.noHoursBookable": "Keine Arbeitszeiten – noch nicht buchbar",
  "staff.noHours": "Keine Arbeitszeiten",
  "hours.startOf": "{day} Beginn",
  "hours.endOf": "{day} Ende",
  "hours.removeInterval": "{day} {range} entfernen",
  "hours.add": "Zeiten hinzufügen",
  "hours.addAnother": "Weiteren Zeitraum hinzufügen",
  "hours.error":
    "Etwas ist schiefgelaufen, die Zeiten wurden nicht gespeichert. Bitte noch einmal versuchen.",
  "hours.saved": "Zeiten gespeichert.",
  "hours.submit": "Zeiten speichern",
  "hours.closedNote": "Ein Tag ohne Zeiten ist für diesen Barber geschlossen.",
  "timeOff.empty": "Für {name} ist noch keine Abwesenheit eingetragen.",
  "timeOff.allDay": "Ganztägig abwesend",
  "timeOff.firstDay": "Erster Tag",
  "timeOff.lastDay": "Letzter Tag",
  "timeOff.lastDayHint": "Für einen einzelnen Tag leer lassen.",
  "timeOff.from": "Von",
  "timeOff.to": "Bis",
  "timeOff.note": "Notiz",
  "timeOff.noteHint": "Optional, und nur hier im Dashboard sichtbar.",
  "timeOff.saved": "Abwesenheit gespeichert.",
  "timeOff.savedWithOverlap.one":
    "Abwesenheit gespeichert – aber ein bereits gebuchter Termin fällt hinein. Er bleibt im Kalender; zum Verschieben den Kunden anrufen.",
  "timeOff.savedWithOverlap.other":
    "Abwesenheit gespeichert – aber {count} bereits gebuchte Termine fallen hinein. Sie bleiben im Kalender; zum Verschieben die Kunden anrufen.",
  "timeOff.submit": "Abwesenheit hinzufügen",

  // ─── Dashboard: settings ──────────────────────────────────────────────────
  "settings.introBefore":
    "Wie weit im Voraus Kunden buchen können und wie viel Luft zwischen Terminen bleibt. Die Öffnungszeiten werden pro Barber auf der Seite",
  "settings.introAfter": "festgelegt.",
  "settings.rulesHeading": "Buchungsregeln",
  "settings.horizon":
    "Kunden können bis zu {days} Tage im Voraus buchen, in der Zeitzone {timezone}.",
  "settings.buffer": "Pause zwischen Terminen",
  "settings.bufferHint":
    "Minuten zum Aufräumen nach jedem Schnitt. 0 für direkt aufeinanderfolgende Termine.",
  "settings.minLead": "Mindestvorlauf",
  "settings.minLeadHint":
    "So weit im Voraus muss eine Online-Buchung erfolgen. Gilt nicht für selbst eingetragene Laufkundschaft.",
  "settings.cancellationWindow": "Stornierungsfrist",
  "settings.cancellationWindowHint":
    "Wie lange vor einem Termin Kunden noch online stornieren können.",
  "settings.gone":
    "Der Shop-Datensatz wurde nicht gefunden. Bitte ab- und wieder anmelden.",
  "settings.submit": "Regeln speichern",
  "settings.bufferNote":
    "Eine geänderte Pause gilt nur für neue Buchungen – Termine im Kalender behalten die Pause, mit der sie gebucht wurden.",
  "settings.windowNoteBefore": "Eine geänderte Stornierungsfrist gilt auch für",
  "settings.windowNoteStrong": "bestehende",
  "settings.windowNoteAfter":
    "Buchungen. Kunden haben beim Buchen die alte Frist per E-Mail bekommen – eine längere Frist kann also jemanden am Stornieren hindern, dem es zugesagt wurde.",
  "settings.shopHeading": "Shop-Daten",
  "settings.shopNote":
    "Hier noch nicht bearbeitbar – bei Änderungswünschen bitte melden.",
  "settings.bookingPage": "Buchungsseite",
  "settings.contactEmail": "Kontakt-E-Mail",
  "settings.timezone": "Zeitzone",
  "settings.address": "Adresse",

  // ─── Validation ───────────────────────────────────────────────────────────
  "validation.emailInvalid": "Bitte eine gültige E-Mail-Adresse eingeben.",
  "validation.passwordRequired": "Bitte das Passwort eingeben.",
  "validation.nameRequired": "Bitte einen Namen eingeben.",
  "validation.nameTooLong": "Dieser Name ist zu lang.",
  "validation.nameSingleLine": "Bitte den Namen in einer Zeile eingeben.",
  "validation.nameSingleLineGeneric":
    "Bitte den Namen in einer Zeile eingeben.",
  "validation.phoneRequired":
    "Bitte eine Telefonnummer eingeben – der Shop braucht sie für Rückfragen.",
  "validation.phoneTooLong": "Diese Telefonnummer ist zu lang.",
  "validation.phoneInvalid": "Bitte eine gültige Telefonnummer eingeben.",
  "validation.timeFormat": "Bitte eine Uhrzeit wie 14:30 eingeben.",
  "validation.serviceNameRequired":
    "Bitte einen Namen für diese Leistung eingeben.",
  "validation.durationRequired": "Bitte die Dauer eingeben.",
  "validation.durationWhole": "Bitte die Dauer in ganzen Minuten eingeben.",
  "validation.durationRange":
    "Die Dauer muss zwischen {min} Minuten und {maxHours} Stunden liegen.",
  "validation.priceRequired": "Bitte einen Preis eingeben.",
  "validation.priceFormat": "Bitte einen Preis wie 25 oder 25,50 eingeben.",
  "validation.priceTooHigh":
    "Dieser Preis wirkt zu hoch – bitte das Komma prüfen.",
  "validation.categoryTooLong": "Dieser Kategoriename ist zu lang.",
  "validation.categorySingleLine":
    "Bitte die Kategorie in einer Zeile eingeben.",
  "validation.categoryEnWithoutCategory":
    "Eine englische Kategorie braucht eine Kategorie, die sie übersetzt.",
  "validation.bufferMissing": "Bitte eine Pause eingeben, oder 0 für keine.",
  "validation.bufferInvalid": "Bitte die Pause in ganzen Minuten eingeben.",
  "validation.bufferRange":
    "Die Pause muss zwischen 0 und {max} Minuten liegen.",
  "validation.leadMissing": "Bitte einen Vorlauf eingeben, oder 0 für keinen.",
  "validation.leadInvalid": "Bitte den Vorlauf in ganzen Minuten eingeben.",
  "validation.leadRange":
    "Der Vorlauf muss zwischen 0 Minuten und {maxDays} Tagen liegen – Kunden können nur {horizon} Tage im Voraus buchen.",
  "validation.windowMissing":
    "Bitte eine Stornierungsfrist eingeben, oder 0 für jederzeit.",
  "validation.windowInvalid": "Bitte die Frist in ganzen Minuten eingeben.",
  "validation.windowRange":
    "Die Frist muss zwischen 0 Minuten und {maxDays} Tagen liegen.",
  "validation.dayUnknown": "Unbekannter Tag.",
  "validation.intervalOrder": "Ein Zeitraum muss nach seinem Beginn enden.",
  "validation.intervalsTooMany":
    "Das sind mehr Zeiträume, als eine Woche braucht.",
  "validation.intervalsOverlap":
    "Zwei Zeiträume am selben Tag überschneiden sich.",
  "validation.intervalIncomplete":
    "Jeder Zeitraum braucht eine Start- und eine Endzeit.",
  "validation.hoursInvalid": "Diese Zeiten passen nicht.",
  "validation.hoursUnreadable":
    "Diese Zeiten konnten nicht gelesen werden. Bitte die Seite neu laden.",
  "validation.staffNameRequired": "Bitte den Namen des Barbers eingeben.",
  "validation.linkTooLong": "Dieser Link ist zu lang.",
  "validation.linkHttps":
    "Bitte einen Link eingeben, der mit https:// beginnt.",
  "validation.startDateRequired": "Bitte ein Startdatum wählen.",
  "validation.noteTooLong": "Diese Notiz ist zu lang.",
  "validation.noteSingleLine": "Bitte die Notiz in einer Zeile halten.",
  "validation.lastDayBeforeFirst":
    "Der letzte Tag kann nicht vor dem ersten liegen.",
  "validation.endBeforeStart": "Die Endzeit muss nach der Startzeit liegen.",
  "validation.longerThanYear":
    "Das ist länger als ein Jahr – bitte die Daten prüfen.",
  "validation.datesUnreadable": "Diese Daten konnten nicht gelesen werden.",
  "validation.timesRequired": "Bitte eine Start- und eine Endzeit eingeben.",
  "validation.checkDates": "Bitte die Daten prüfen.",
} as const;
