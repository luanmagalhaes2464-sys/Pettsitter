function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const expectedSecret = PropertiesService.getScriptProperties().getProperty('EMAIL_WEBHOOK_SECRET');
    if (!expectedSecret || payload.secret !== expectedSecret) {
      return jsonResponse({ ok: false, error: 'Não autorizado.' });
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

function jsonResponse(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
