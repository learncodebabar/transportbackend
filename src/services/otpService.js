const crypto = require('crypto');
const Verification = require('../models/Verification');
const { sendEmail } = require('../config/email');

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendOTPByEmail = async (email, userId, purpose) => {
  try {
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    // Save OTP to database - REMOVED userId dependency
    await Verification.findOneAndUpdate(
      { email, purpose, isUsed: false },
      { otp, otpExpires, attempts: 0 },
      { upsert: true, new: true }
    );
    
    // Send email
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3b82f6;">CristRide - Verification Code</h2>
        <p>Your verification code is:</p>
        <div style="background: #f3f4f6; padding: 20px; text-align: center; font-size: 32px; letter-spacing: 5px; font-weight: bold;">
          ${otp}
        </div>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <hr />
        <p style="color: #6b7280; font-size: 12px;">CristRide - Your trusted ride partner</p>
      </div>
    `;
    
    await sendEmail(email, 'CristRide - Verification Code', html);
    console.log(`✅ OTP sent to ${email}: ${otp}`);
    return { success: true };
  } catch (error) {
    console.error('Send OTP error:', error);
    return { success: false, error: error.message };
  }
};

const verifyOTP = async (email, otp, purpose) => {
  try {
    const verification = await Verification.findOne({
      email,
      otp,
      purpose,
      isUsed: false,
      otpExpires: { $gt: new Date() },
    });
    
    if (!verification) {
      return { success: false, message: 'Invalid or expired OTP' };
    }
    
    // Check attempts
    if (verification.attempts >= 3) {
      return { success: false, message: 'Too many failed attempts. Please request a new OTP.' };
    }
    
    // Increment attempts
    verification.attempts += 1;
    await verification.save();
    
    // Mark as used
    verification.isUsed = true;
    await verification.save();
    
    return { success: true, message: 'OTP verified successfully' };
  } catch (error) {
    console.error('Verify OTP error:', error);
    return { success: false, message: 'Server error' };
  }
};

module.exports = { generateOTP, sendOTPByEmail, verifyOTP };