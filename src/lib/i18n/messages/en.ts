import type { de } from "./de";

/**
 * English — the toggle. Typed against de.ts's keys, so a key missing here, or
 * one that exists only here, is a `tsc` error rather than a blank on screen.
 */
export const en = {
  // ─── App-wide ─────────────────────────────────────────────────────────────
  "meta.description": "Online booking for barbershops and hair salons.",
  "common.email": "Email",

  "preferences.language": "Language",
  "preferences.theme": "Appearance",
  "preferences.themeSystem": "System setting",
  "preferences.themeLight": "Light",
  "preferences.themeDark": "Dark",

  "duration.days.one": "{count} day",
  "duration.days.other": "{count} days",
  "duration.hours.one": "{count} h",
  "duration.hours.other": "{count} h",
  "duration.minutes.one": "{count} min",
  "duration.minutes.other": "{count} min",

  "cancellation.policyAnyTime":
    "You can cancel online any time before your appointment.",
  "cancellation.policyUpTo":
    "You can cancel online up to {duration} before your appointment.",

  "weekday.0": "Sunday",
  "weekday.1": "Monday",
  "weekday.2": "Tuesday",
  "weekday.3": "Wednesday",
  "weekday.4": "Thursday",
  "weekday.5": "Friday",
  "weekday.6": "Saturday",

  "weekdayShort.0": "Sun",
  "weekdayShort.1": "Mon",
  "weekdayShort.2": "Tue",
  "weekdayShort.3": "Wed",
  "weekdayShort.4": "Thu",
  "weekdayShort.5": "Fri",
  "weekdayShort.6": "Sat",

  // ─── A booking, wherever it is summarised ─────────────────────────────────
  "booking.service": "Service",
  "booking.barber": "Barber",
  "booking.when": "When",
  "booking.duration": "Duration",
  "booking.price": "Price",
  "booking.dateAtTime": "{date} at {time}",
  "booking.cancelledHeading": "This booking is cancelled",
  "booking.backTo": "Back to {shop}",

  // ─── Public shop page ─────────────────────────────────────────────────────
  "shop.businessTypeBarbershop": "Barbershop",
  "shop.businessTypeSalon": "Hair salon",
  "shop.metaDescription": "Book an appointment at {shop}.",
  "shop.metaDescriptionWithAddress":
    "Book an appointment at {shop}, {address}.",
  "shop.notFoundTitle": "Shop not found",
  "shop.notFoundBody":
    "This booking page doesn't exist. Check the link, or ask the shop for their booking address.",
  "shop.services": "Services",
  "shop.openingHours": "Opening hours",
  "shop.closed": "Closed",
  "shop.noServices": "No services listed yet.",
  "shop.otherCategory": "Other",
  "shop.book": "Book",
  "shop.changeService": "Change",

  // ─── Booking flow ─────────────────────────────────────────────────────────
  "book.metaTitle": "Book · {shop}",
  "book.heading": "Book an appointment",
  "book.timezoneNote": "Showing times for {date} in {shop}'s local time.",
  "book.pickDate": "Pick a date",
  "book.chooseDate": "Choose a date",
  "book.previousWeek": "Previous week",
  "book.nextWeek": "Next week",
  "book.preferredBarber": "Preferred barber",
  "book.anyBarber": "Any barber",
  "book.pickTime": "Pick a time",
  "book.partMorning": "Morning",
  "book.partAfternoon": "Afternoon",
  "book.partEvening": "Evening",
  "book.slotGroupLabel": "{part} times",
  "book.closedOnDay": "Closed on this day.",
  "book.fullyBooked": "Fully booked — try another day.",
  "book.yourDetails": "Your details",
  "book.yourName": "Your name",
  "book.phone": "Phone",
  "book.emailHint": "Optional — for your confirmation and cancellation link.",
  "book.submit": "Confirm booking",
  "book.submitting": "Confirming…",
  "book.error":
    "Something went wrong on our end and the booking wasn't saved. Please try again.",
  "book.lostStaffTakenNamed":
    "{name} was just booked at this time. Another barber is still free — the details below now show who, so you can confirm again.",
  "book.lostStaffTaken":
    "That barber was just booked at this time. Another barber is still free — the details below now show who, so you can confirm again.",
  "book.lostSlotTaken":
    "Someone else booked that time just before you. The times below are up to date — please pick another.",
  "book.lostUnavailable":
    "That time isn't available anymore. The times below are up to date — please pick another.",
  "book.rateLimitUpcoming":
    "You already have several appointments booked here. To add another, get in touch with the shop directly.",
  "book.rateLimitUpcomingPhone":
    "You already have several appointments booked here. To add another, call the shop on {phone}.",
  "book.rateLimitRecent":
    "That's a few bookings in a short time. If you need another appointment, get in touch with the shop directly.",
  "book.rateLimitRecentPhone":
    "That's a few bookings in a short time. If you need another appointment, call the shop on {phone}.",

  // ─── Confirmation page ────────────────────────────────────────────────────
  "booked.metaTitle": "Booking confirmed",
  "booked.heading": "You're booked in",
  "booked.thanks": "Thanks, {name} — we've saved your spot.",
  "booked.cancelledBody": "The appointment below is no longer reserved.",
  "booked.changeIntro": "Need to change something?",
  "booked.cancelLink": "Cancel this booking",
  "booked.emailHasLink": "— the confirmation email carries the same link.",

  // ─── Cancel page ──────────────────────────────────────────────────────────
  "cancel.metaTitle": "Cancel booking",
  "cancel.heading": "Cancel your booking",
  "cancel.intro": "Check the details below before you confirm.",
  "cancel.cancelledBody":
    "The appointment below is no longer reserved, and the time is back on the shop's calendar.",
  "cancel.warning":
    "This frees the time for someone else, and it can't be undone — you'd need to book again.",
  "cancel.submit": "Cancel appointment",
  "cancel.submitting": "Cancelling…",
  "cancel.closedNotice":
    "This appointment can no longer be cancelled online. If something isn't right, get in touch with the shop directly.",
  "cancel.closedNoticePhone":
    "This appointment can no longer be cancelled online. If something isn't right, call the shop on {phone}.",
  "cancel.closedReasonAtStart":
    "Online cancellation closes once an appointment starts, so this one is too late now.",
  "cancel.closedReasonWindow":
    "Online cancellation closes {duration} before an appointment, so this one is too close now.",
  "cancel.tooLateContact":
    "If you can't make it, get in touch with the shop directly — they'd rather know.",
  "cancel.tooLateContactPhone":
    "If you can't make it, call the shop on {phone} — they'd rather know.",

  // ─── Emails (always German — see EMAIL_LOCALE) ────────────────────────────
  "email.signOff": "Sent by Bookilo",
  "email.where": "Where",
  "email.questions": "Questions? Get in touch with {shop}.",
  "email.questionsPhone": "Questions? Call {shop} on {phone}.",
  "email.confirmationLead":
    "Thanks {name} — {shop} has you down for {service} on {when}.",
  "email.confirmationSubject": "Your appointment at {shop} — {date}, {time}",
  "email.customer": "Customer",
  "email.notGiven": "not given",
  "email.ownerHeading": "New booking",
  "email.ownerLead": "{customer} booked {service} with {barber} on {when}.",
  "email.ownerCustomerNotified":
    "The customer has been sent a confirmation with a cancellation link.",
  "email.ownerCustomerNoEmail":
    "No email was given, so the customer has no confirmation and no cancellation link — they'll need to call to change anything.",
  "email.ownerSubject": "New booking: {customer}, {when}",

  // ─── Login ────────────────────────────────────────────────────────────────
  "login.title": "Sign in",
  "login.subtitle": "Manage your bookings, staff, and services.",
  "login.password": "Password",
  "login.submit": "Sign in",
  "login.submitting": "Signing in…",
  "login.invalidCredentials": "Invalid email or password.",

  // ─── Dashboard shell ──────────────────────────────────────────────────────
  "dashboard.viewPublicPage": "View public page",
  "dashboard.signOut": "Sign out",
  "nav.label": "Dashboard",
  "nav.today": "Today",
  "nav.calendar": "Calendar",
  "nav.services": "Services",
  "nav.staff": "Staff",
  "nav.settings": "Settings",

  "common.saving": "Saving…",

  // ─── Dashboard: shared ────────────────────────────────────────────────────
  "dashboard.newBooking": "New booking",
  "dashboard.walkIn": "Walk-in",
  "status.cancelled": "Cancelled",
  "status.completed": "Done",
  "status.noShow": "No-show",
  "summary.booked": "Booked",
  "summary.appointments.one": "appointment",
  "summary.appointments.other": "appointments",
  "summary.next": "Next",
  "summary.nothingLeftToday": "nothing left today",
  "summary.bookedValue": "Booked value",
  "summary.exclNoShows": "excl. no-shows",

  "summary.nothingUpcoming": "nothing upcoming",

  "common.adding": "Adding…",
  "common.saveChanges": "Save changes",
  "common.cancel": "Cancel",
  "common.edit": "Edit",
  "common.saveError":
    "Something went wrong and nothing was saved. Please try again.",

  "common.saved": "Saved.",

  // ─── Dashboard: today ─────────────────────────────────────────────────────
  "today.emptyTitle": "No appointments today",
  "today.emptyBodyBefore": "Bookings made on your",
  "today.emptyBodyLink": "public page",
  "today.emptyBodyAfter": "show up here.",

  // ─── Dashboard: manual booking ────────────────────────────────────────────
  "manual.intro":
    "For a walk-in or a booking taken over the phone. Times outside your hours are allowed — you'll be told what they clash with.",
  "manual.needStaff":
    "You need at least one barber before you can book anyone in. Add one, and give them working hours.",
  "manual.goToStaff": "Go to staff",
  "manual.needService":
    "You need at least one bookable service — it's what decides how long the appointment runs.",
  "manual.goToServices": "Go to services",
  "manual.day": "Day",
  "manual.startTime": "Start time",
  "manual.loadingTimes": "Loading times…",
  "manual.openTimes": "Open times",
  "manual.noHoursAtAll": "This barber has no hours set for any day.",
  "manual.nothingOpen":
    "Nothing open on this day — you can still type a time below.",
  "manual.customerName": "Customer name",
  "manual.phoneHint": "Also how the shop recognises a returning customer.",
  "manual.emailHint": "Optional — sends them a confirmation and a cancel link.",
  "manual.taken":
    "That barber already has an appointment overlapping this time. Pick another time or another barber.",
  "manual.impossibleTime":
    "That time doesn't exist on this day — the clocks go forward. Pick a time before or after the change.",
  "manual.error":
    "Something went wrong and the booking wasn't saved. Please try again.",
  "manual.submit": "Create booking",
  "manual.conflictOverlaps":
    "This barber already has something booked over this time — the shop's own rules will reject it.",
  "manual.conflictTimeOff": "This falls inside time off for this barber.",
  "manual.conflictOutsideHours":
    "This is outside this barber's working hours for that day.",
  "manual.conflictPast": "This time has already passed.",

  // ─── Dashboard: calendar ──────────────────────────────────────────────────
  "calendar.noAppointments": "No appointments",
  "calendar.appointmentCount.one": "{count} appointment",
  "calendar.appointmentCount.other": "{count} appointments",
  "calendar.cancelledCount.one": "{count} cancelled",
  "calendar.cancelledCount.other": "{count} cancelled",
  "calendar.previousDay": "Previous day",
  "calendar.nextDay": "Next day",
  "calendar.previousWeek": "Previous week",
  "calendar.nextWeek": "Next week",
  "calendar.view": "Calendar view",
  "calendar.viewDay": "Day",
  "calendar.viewWeek": "Week",
  "calendar.nothingBooked": "Nothing booked",
  "calendar.staffInactive": "No longer here",
  "calendar.staffUnknown": "Unknown barber",
  "calendar.slotLink": "New booking, {column} at {time}",
  "calendar.emptyTitle": "No barbers yet",
  "calendar.emptyBodyBefore": "Add someone on the",
  "calendar.emptyBodyLink": "staff page",
  "calendar.emptyBodyAfter": "and their day shows up here.",

  // ─── Dashboard: services ──────────────────────────────────────────────────
  "services.intro":
    "What customers can book, how long it takes and what it costs.",
  "services.addHeading": "Add a service",
  "services.name": "Name",
  "services.namePlaceholder": "Haircut",
  "services.category": "Category",
  "services.categoryPlaceholder": "Hair",
  "services.categoryHint": "Optional — groups services on your public page.",
  "services.nameEn": "English name",
  "services.categoryEn": "English category",
  "services.englishHint":
    "Optional — shown on your public page when a customer switches to English.",
  "services.length": "Length in minutes",
  "services.lengthHint": "How long the chair is taken for.",
  "services.price": "Price in €",
  "services.added": "“{name}” added.",
  "services.gone": "That service no longer exists. Reload the page.",
  "services.submitAdd": "Add service",
  "services.editNote":
    "Changing the length leaves existing appointments as they were booked. Changing the price also changes the revenue shown for past appointments.",
  "services.bookable": "Bookable",
  "services.bookableEmpty":
    "Nothing bookable yet — add your first service above.",
  "services.retired": "Retired",
  "services.retiredHint":
    "Not shown to customers. Existing appointments keep them.",
  "services.retire": "Retire",
  "services.restore": "Restore",

  // ─── Dashboard: staff ─────────────────────────────────────────────────────
  "staff.intro":
    "Your barbers and the hours each of them works. Any active barber can perform any active service.",
  "staff.addHeading": "Add a barber",
  "staff.notFound": "Barber not found",
  "staff.backToAll": "All staff",
  "staff.inactiveBadge": "No longer working here",
  "staff.upcoming.one": "{count} appointment ahead",
  "staff.upcoming.other": "{count} appointments ahead",
  "staff.details": "Details",
  "staff.workingHours": "Working hours",
  "staff.workingHoursIntro":
    "These decide when customers can book {name}, and together with your other barbers' hours they are the opening hours shown on your public page. Add a second interval to a day for a lunch break.",
  "staff.timeOff": "Time off",
  "staff.timeOffIntro":
    "Holidays, appointments, a morning off — customers can't book {name} during these. Working hours above are the normal week; this is what interrupts it.",
  "staff.timeOffNote":
    "Appointments already booked inside a time off stay booked, and time off doesn't show on the calendar yet.",
  "staff.photoLink": "Photo link",
  "staff.photoHint": "Optional — shown on your public page.",
  "staff.gone": "That barber no longer exists. Reload the page.",
  "staff.submitAdd": "Add barber",
  "staff.addNote":
    "You'll set their working hours next. Until then they aren't bookable.",
  "staff.active": "Working here",
  "staff.activeEmpty": "No barbers yet — add the first one above.",
  "staff.inactiveHint":
    "Not offered to customers. Their past and future appointments are untouched.",
  "staff.remove": "Remove",
  "staff.bringBack": "Bring back",
  "staff.removeQuestion": "Remove {name} from the booking page?",
  "staff.removeNoUpcoming": "They have no appointments ahead of them.",
  "staff.removeUpcoming.one":
    "Their 1 upcoming appointment stays on the calendar — you'll need to move or cancel it yourself.",
  "staff.removeUpcoming.other":
    "Their {count} upcoming appointments stay on the calendar — you'll need to move or cancel them yourself.",
  "staff.removeHoursKept":
    "Their hours are kept, so you can bring them back later.",
  "staff.removeConfirm": "Remove {name}",
  "staff.keep": "Keep them",
  "staff.noHoursBookable": "No hours set — not bookable yet",
  "staff.noHours": "No hours set",
  "hours.startOf": "{day} start",
  "hours.endOf": "{day} end",
  "hours.removeInterval": "Remove {day} {range}",
  "hours.add": "Add hours",
  "hours.addAnother": "Add another interval",
  "hours.error":
    "Something went wrong and the hours weren't saved. Please try again.",
  "hours.saved": "Hours saved.",
  "hours.submit": "Save hours",
  "hours.closedNote": "A day with no hours is closed for this barber.",
  "timeOff.empty": "{name} isn't marked away for anything yet.",
  "timeOff.allDay": "Away all day",
  "timeOff.firstDay": "First day away",
  "timeOff.lastDay": "Last day away",
  "timeOff.lastDayHint": "Leave empty for a single day.",
  "timeOff.from": "From",
  "timeOff.to": "To",
  "timeOff.note": "Note",
  "timeOff.noteHint": "Optional, and only ever shown to you.",
  "timeOff.saved": "Time off saved.",
  "timeOff.savedWithOverlap.one":
    "Time off saved — but 1 appointment already booked falls inside it. It stays on the calendar; call that customer to move it.",
  "timeOff.savedWithOverlap.other":
    "Time off saved — but {count} appointments already booked fall inside it. They stay on the calendar; call those customers to move them.",
  "timeOff.submit": "Add time off",

  // ─── Dashboard: settings ──────────────────────────────────────────────────
  "settings.introBefore":
    "How far ahead customers can book, and how much room you leave between appointments. Your opening hours are set per barber, on the",
  "settings.introAfter": "screen.",
  "settings.rulesHeading": "Booking rules",
  "settings.horizon":
    "Customers can book up to {days} days ahead, in {timezone} time.",
  "settings.buffer": "Gap between appointments",
  "settings.bufferHint":
    "Minutes of clean-up time after each cut. 0 for back-to-back.",
  "settings.minLead": "Minimum notice",
  "settings.minLeadHint":
    "How far ahead an online booking must be made. Doesn't apply to walk-ins you enter yourself.",
  "settings.cancellationWindow": "Cancellation window",
  "settings.cancellationWindowHint":
    "How long before an appointment a customer can still cancel online.",
  "settings.gone": "Your shop record couldn’t be found. Sign out and back in.",
  "settings.submit": "Save rules",
  "settings.bufferNote":
    "Changing the gap affects new bookings only — appointments already in the calendar keep the gaps they were booked with.",
  "settings.windowNoteBefore": "Changing the cancellation window applies to",
  "settings.windowNoteStrong": "existing",
  "settings.windowNoteAfter":
    "bookings too. Customers were emailed the old window when they booked, so making it longer can stop someone cancelling who was told they could.",
  "settings.shopHeading": "Your shop",
  "settings.shopNote":
    "Not editable here yet — get in touch if any of this needs to change.",
  "settings.bookingPage": "Booking page",
  "settings.contactEmail": "Contact email",
  "settings.timezone": "Timezone",
  "settings.address": "Address",

  // ─── Validation ───────────────────────────────────────────────────────────
  "validation.emailInvalid": "Enter a valid email address.",
  "validation.passwordRequired": "Enter your password.",
  "validation.nameRequired": "Enter your name.",
  "validation.nameTooLong": "That name is too long.",
  "validation.nameSingleLine": "Enter your name on a single line.",
  "validation.nameSingleLineGeneric": "Enter the name on a single line.",
  "validation.phoneRequired": "Enter a phone number so the shop can reach you.",
  "validation.phoneTooLong": "That phone number is too long.",
  "validation.phoneInvalid": "Enter a valid phone number.",
  "validation.timeFormat": "Enter a time like 14:30.",
  "validation.serviceNameRequired": "Enter a name for this service.",
  "validation.durationRequired": "Enter how long this takes.",
  "validation.durationWhole": "Enter the length in whole minutes.",
  "validation.durationRange":
    "Length must be between {min} minutes and {maxHours} hours.",
  "validation.priceRequired": "Enter a price.",
  "validation.priceFormat": "Enter a price like 25 or 25,50.",
  "validation.priceTooHigh":
    "That price looks too high — check the decimal point.",
  "validation.categoryTooLong": "That category name is too long.",
  "validation.categorySingleLine": "Enter the category on a single line.",
  "validation.categoryEnWithoutCategory":
    "Add a category first — the English one is its translation.",
  "validation.bufferMissing": "Enter a gap, or 0 for none.",
  "validation.bufferInvalid": "Enter the gap in whole minutes.",
  "validation.bufferRange": "Keep the gap between 0 and {max} minutes.",
  "validation.leadMissing": "Enter a notice period, or 0 for none.",
  "validation.leadInvalid": "Enter the notice in whole minutes.",
  "validation.leadRange":
    "Keep the notice between 0 minutes and {maxDays} days — customers can only book {horizon} days ahead.",
  "validation.windowMissing":
    "Enter a cancellation window, or 0 to allow it any time.",
  "validation.windowInvalid": "Enter the window in whole minutes.",
  "validation.windowRange":
    "Keep the window between 0 minutes and {maxDays} days.",
  "validation.dayUnknown": "Unknown day.",
  "validation.intervalOrder": "An interval has to end after it starts.",
  "validation.intervalsTooMany": "That's more intervals than a week needs.",
  "validation.intervalsOverlap": "Two intervals on the same day overlap.",
  "validation.intervalIncomplete":
    "Every interval needs a start and an end time.",
  "validation.hoursInvalid": "Those hours don't work.",
  "validation.hoursUnreadable":
    "Those hours couldn't be read. Reload the page.",
  "validation.staffNameRequired": "Enter this barber's name.",
  "validation.linkTooLong": "That link is too long.",
  "validation.linkHttps": "Enter a link starting with https://",
  "validation.startDateRequired": "Pick a start date.",
  "validation.noteTooLong": "That note is too long.",
  "validation.noteSingleLine": "Keep the note on a single line.",
  "validation.lastDayBeforeFirst": "The last day can't be before the first.",
  "validation.endBeforeStart": "The end time has to be after the start time.",
  "validation.longerThanYear": "That's longer than a year — check the dates.",
  "validation.datesUnreadable": "Those dates couldn't be read.",
  "validation.timesRequired": "Enter a start and an end time.",
  "validation.checkDates": "Check the dates.",
} as const satisfies Record<keyof typeof de, string>;
