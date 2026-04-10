require('dotenv').config();  // loads .env variables

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const msg = {
  to: 'blaqboydee@gmail.com', // any email you want to receive at
  from: process.env.FROM_EMAIL,  // must match your verified sender
  subject: 'Test Email from SendGrid (Local)',
  html: '<p>Hello Dee 👋, SendGrid is working locally!</p>',
};

sgMail
  .send(msg)
  .then(() => console.log('✅ Email sent successfully'))
  .catch((err) => {
    console.error(' Error sending email:');
    console.error(err.response?.body || err.message || err);
  });
