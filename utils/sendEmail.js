const { Resend } = require('resend');

async function sendEmail(to, subject, html) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: process.env.FROM_EMAIL || 'Zaptalk <onboarding@resend.dev>',
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

module.exports = sendEmail;
