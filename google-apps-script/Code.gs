function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const properties = PropertiesService.getScriptProperties();
    const expectedSecret = properties.getProperty('EMAIL_WEBHOOK_SECRET_V2') || properties.getProperty('EMAIL_WEBHOOK_SECRET');
    if (!expectedSecret || payload.secret !== expectedSecret) {
      return jsonResponse({ ok: false, error: 'Não autorizado.' });
    }

    if (payload.action === 'calendar_create') {
      return createCalendarEvent(payload);
    }
    if (payload.action === 'calendar_delete') {
      return deleteCalendarEvent(payload);
    }
    if (payload.action === 'calendar_check') {
      return checkCalendarAccess();
    }

    const allowedRecipients = [
      'luanmagalhaes2464@gmail.com',
      'belaisapr@gmail.com'
    ];
    const recipients = Array.isArray(payload.to)
      ? payload.to.filter(email => allowedRecipients.includes(String(email).toLowerCase()))
      : [];
    if (!recipients.length || !payload.subject || !payload.text) {
      return jsonResponse({ ok: false, error: 'Dados do e-mail incompletos.' });
    }

    MailApp.sendEmail({
      to: recipients.join(','),
      subject: String(payload.subject).slice(0, 250),
      body: String(payload.text),
      htmlBody: payload.html ? String(payload.html) : undefined,
      name: 'Casal Pet Sitter'
    });
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error && error.message || error) });
  }
}

function createCalendarEvent(payload) {
  if (!payload.title || !payload.startDate || !payload.endDate) {
    return jsonResponse({ ok: false, error: 'Dados da agenda incompletos.' });
  }

  const start = dateAtNoon(payload.startDate);
  const endExclusive = dateAtNoon(payload.endDate);
  endExclusive.setDate(endExclusive.getDate() + 1);
  const event = CalendarApp.getDefaultCalendar().createAllDayEvent(
    String(payload.title).slice(0, 180),
    start,
    endExclusive,
    {
      description: String(payload.description || ''),
      location: String(payload.location || ''),
      guests: 'belaisapr@gmail.com',
      sendInvites: true
    }
  );
  return jsonResponse({ ok: true, eventId: event.getId() });
}

function deleteCalendarEvent(payload) {
  if (!payload.eventId) {
    return jsonResponse({ ok: false, error: 'Evento não informado.' });
  }
  const event = CalendarApp.getDefaultCalendar().getEventById(String(payload.eventId));
  if (event) event.deleteEvent();
  return jsonResponse({ ok: true });
}

function checkCalendarAccess() {
  const calendar = CalendarApp.getDefaultCalendar();
  return jsonResponse({ ok: true, calendarName: calendar.getName() });
}

function authorizeCalendar() {
  return CalendarApp.getDefaultCalendar().getName();
}

function dateAtNoon(value) {
  const parts = String(value).split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) throw new Error('Data inválida.');
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
}

function jsonResponse(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
