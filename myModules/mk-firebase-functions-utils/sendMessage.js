import nodemailer from 'nodemailer';
import corsAsyncLib from './corsAsync.js';
const corsAsync = corsAsyncLib({origin: true});

const sendMail = async (body, options) => {
  const mailTransport = nodemailer.createTransport(options.mailTransport);
  await mailTransport.sendMail({
    to: options.mailOptions.to,
    replyTo: body.email,
    subject: `${options.mailOptions.subject} | ${body.email}`,
    html: options.mailOptions.getHtml(body),
  });
};

export default async (req, res, options) => {
  await corsAsync(req, res);
  if (JSON.stringify(req.body).length > options.maxMessageSize) {
    return res.status(400).send('Message is too big.');
  }
  try {
    await sendMail(req.body, options);
    res.status(200).end();
  } catch (error) {
    res.status(500).send('Error while sending contact form message.');
    throw error;
  }
};
