const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema({
  email: { type: String, required: true },
  otp: { type: String, required: true },
  otpExpires: { type: Date, required: true },
  purpose: { type: String, enum: ['email_verification', 'phone_verification', 'password_reset'], required: true },
  attempts: { type: Number, default: 0 },
  isUsed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, expires: 600 }, // Auto delete after 10 minutes
});

module.exports = mongoose.model('Verification', verificationSchema);