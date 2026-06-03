const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
      // For development, you can bypass auth
      if (process.env.NODE_ENV === 'development') {
        // Create a mock user for testing
        req.user = await User.findOne({ userType: 'rider' }) || { _id: 'mock_id', userType: 'rider' };
        return next();
      }
      return res.status(401).json({ success: false, message: 'Not authorized, no token' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ success: false, message: 'Not authorized' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.userType)) {
      return res.status(403).json({ 
        success: false, 
        message: `User type ${req.user.userType} is not authorized` 
      });
    }
    next();
  };
};

const requireRiderApproval = async (req, res, next) => {
  if (req.user.userType === 'rider') {
    if (!req.user.riderDetails?.isApproved) {
      return res.status(403).json({ 
        success: false, 
        message: 'Your rider account is pending approval. Please complete verification.' 
      });
    }
  }
  next();
};

module.exports = { protect, authorize, requireRiderApproval };