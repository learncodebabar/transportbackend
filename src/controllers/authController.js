const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Verification = require('../models/Verification');
const { sendOTPByEmail, verifyOTP } = require('../services/otpService');

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'secret', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// Register user
const register = async (req, res) => {
  try {
    console.log('📝 Registration request body:', req.body);
    
    const { name, email, phone, password, userType } = req.body;
    
    if (!name || !email || !phone || !password || !userType) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: name, email, phone, password, userType',
      });
    }
    
    if (!['passenger', 'rider'].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: 'userType must be either "passenger" or "rider"',
      });
    }
    
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email or phone',
      });
    }
    
    const user = await User.create({
      name,
      email,
      phone,
      password,
      userType,
      isVerified: false,
      riderDetails: userType === 'rider' ? {
        isApproved: false,
        documentsSubmitted: false,
        documentsVerified: false,
        biometricSubmitted: false,
        biometricVerified: false,
        availabilityStatus: false,
      } : undefined,
    });
    
    try {
      await sendOTPByEmail(email, user._id, 'email_verification');
    } catch (emailError) {
      console.error('Email error:', emailError);
    }
    
    const token = generateToken(user._id);
    
    res.status(201).json({
      success: true,
      message: 'Registration successful. Please verify your email.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        userType: user.userType,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    console.log('🔐 Login request body:', req.body);
    
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }
    
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }
    
    if (user.userType === 'rider' && !user.riderDetails?.isApproved) {
      return res.status(403).json({
        success: false,
        message: 'Your account is pending approval. Please complete verification.',
        requiresApproval: true,
      });
    }
    
    user.lastActive = new Date();
    await user.save();
    
    const token = generateToken(user._id);
    
    // Get Socket.IO instance to emit location request
    const io = req.app.get('io');
    if (io) {
      // Emit event to request location sharing from this user
      io.emit('request-location-sharing', {
        userId: user._id,
        userType: user.userType
      });
    }
    
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        userId: user.userId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        userType: user.userType,
        isVerified: user.isVerified,
        riderDetails: user.riderDetails,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

// Get current user (called when app opens)
const getMe = async (req, res) => {
  try {
    // Get Socket.IO instance to emit location request
    const io = req.app.get('io');
    if (io) {
      // Emit event to request location sharing from this user
      io.emit('request-location-sharing', {
        userId: req.user._id,
        userType: req.user.userType
      });
    }
    
    res.json({
      success: true,
      user: req.user,
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Update profile
const updateProfile = async (req, res) => {
  try {
    const { name, phone, profileImage } = req.body;
    
    const updates = {};
    if (name) updates.name = name;
    if (phone) updates.phone = phone;
    if (profileImage) updates.profileImage = profileImage;
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Logout
const logout = async (req, res) => {
  try {
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Verify email OTP
const verifyEmail = async (req, res) => {
  try {
    const { email, otp, purpose } = req.body;
    
    console.log(`Verifying OTP for ${email}: ${otp}`);
    
    const verification = await verifyOTP(email, otp, purpose || 'email_verification');
    
    if (!verification.success) {
      return res.status(400).json(verification);
    }
    
    const user = await User.findOneAndUpdate(
      { email }, 
      { isVerified: true },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'Email verified successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        userType: user.userType,
        isVerified: true,
      }
    });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Resend OTP
const resendOTP = async (req, res) => {
  try {
    const { email, purpose } = req.body;
    
    console.log(`Resending OTP to ${email}`);
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    await sendOTPByEmail(email, user._id, purpose || 'email_verification');
    
    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Forgot password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    await sendOTPByEmail(email, user._id, 'password_reset');
    
    res.json({ success: true, message: 'Reset code sent to your email' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Reset password
const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    
    const verification = await verifyOTP(email, otp, 'password_reset');
    if (!verification.success) {
      return res.status(400).json(verification);
    }
    
    const user = await User.findOne({ email });
    user.password = newPassword;
    await user.save();
    
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  register,
  login,
  verifyEmail,
  resendOTP,
  forgotPassword,
  resetPassword,
  getMe,
  updateProfile,
  logout,
};