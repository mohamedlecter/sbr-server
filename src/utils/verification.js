// const nodemailer = require('nodemailer');
// const twilio = require('twilio');

// // Email configuration
// const transporter = nodemailer.createTransport({
//   host: process.env.EMAIL_HOST,
//   port: process.env.EMAIL_PORT,
//   secure: false, // true for 465, false for other ports
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS
//   }
// });

// // Twilio configuration
// const twilioClient = twilio(
//   process.env.TWILIO_ACCOUNT_SID,
//   process.env.TWILIO_AUTH_TOKEN
// );

// // Send verification email
// const sendVerificationEmail = async (email, code, type = 'verification') => {
//   try {
//     const subject =
//       type === 'password reset'
//         ? 'Password Reset Code - SBR Bike Store'
//         : 'Email Verification Code - SBR Bike Store';

//     const html = `
//       <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//         <h2 style="color: #333;">SBR Bike Store</h2>
//         <p>Your ${type} code is:</p>
//         <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
//           <h1 style="color: #007bff; font-size: 32px; margin: 0;">${code}</h1>
//         </div>
//         <p>This code will expire in ${type === 'password reset' ? '15' : '10'} minutes.</p>
//         <p>If you didn't request this, please ignore this email.</p>
//         <hr style="margin: 30px 0;">
//         <p style="color: #666; font-size: 12px;">SBR Bike Store - Your trusted partner for bike parts and accessories</p>
//       </div>
//     `;

//     await transporter.sendMail({
//       from: process.env.EMAIL_USER,
//       to: email,
//       subject,
//       html
//     });

//     console.log(`Verification email sent to ${email}`);
//   } catch (error) {
//     console.error('Email sending failed:', error);
//     throw error;
//   }
// };

// // Send verification SMS
// const sendVerificationSMS = async (phone, code) => {
//   try {
//     await twilioClient.messages.create({
//       body: `Your SBR Bike Store verification code is: ${code}. This code expires in 10 minutes.`,
//       from: process.env.TWILIO_PHONE_NUMBER,
//       to: phone
//     });

//     console.log(`Verification SMS sent to ${phone}`);
//   } catch (error) {
//     console.error('SMS sending failed:', error);
//     throw error;
//   }
// };

// module.exports = {
//   sendVerificationEmail,
//   sendVerificationSMS
// };
