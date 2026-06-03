const express = require('express');
const router = express.Router();
const User = require('../models/User');
const RiderVerification = require('../models/RiderVerification');
const Ride = require('../models/Ride');
const Document = require('../models/Document');

// Get all users from database
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    
    const verifications = await RiderVerification.find({});
    
    const usersWithStatus = users.map(user => {
      const verification = verifications.find(v => v.userId.toString() === user._id.toString());
      return {
        ...user.toObject(),
        verificationStatus: verification?.verificationStatus?.step || 'none',
        isApproved: user.riderDetails?.isApproved || false
      };
    });
    
    res.json({
      success: true,
      users: usersWithStatus,
      total: usersWithStatus.length
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get pending rider verifications
router.get('/pending-verifications', async (req, res) => {
  try {
    const pendingVerifications = await RiderVerification.find({ 
      'verificationStatus.step': { $in: ['documents_review', 'biometric_review', 'pending'] }
    }).sort({ createdAt: -1 });
    
    const verificationsWithUsers = await Promise.all(
      pendingVerifications.map(async (verification) => {
        const user = await User.findById(verification.userId);
        return {
          id: verification._id,
          userId: user?._id,
          userName: user?.name,
          userEmail: user?.email,
          userPhone: user?.phone,
          personalInfo: verification.personalInfo,
          vehicleInfo: verification.vehicleInfo,
          documents: verification.documents,
          biometric: verification.biometric,
          verificationStatus: verification.verificationStatus,
          createdAt: verification.createdAt
        };
      })
    );
    
    res.json({
      success: true,
      verifications: verificationsWithUsers
    });
  } catch (error) {
    console.error('Error fetching pending verifications:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalRiders = await User.countDocuments({ userType: 'rider' });
    const totalPassengers = await User.countDocuments({ userType: 'passenger' });
    const verifiedRiders = await User.countDocuments({ 'riderDetails.isApproved': true });
    const pendingVerifications = await RiderVerification.countDocuments({
      'verificationStatus.step': { $in: ['documents_review', 'biometric_review'] }
    });
    const totalRides = await Ride.countDocuments();
    const totalEarnings = await Ride.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$fare' } } }
    ]);
    
    res.json({
      success: true,
      stats: {
        totalUsers,
        totalRiders,
        totalPassengers,
        verifiedRiders,
        pendingVerifications,
        totalRides,
        totalEarnings: totalEarnings[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Approve or reject rider
router.put('/verify-rider/:verificationId', async (req, res) => {
  try {
    const { verificationId } = req.params;
    const { isApproved, notes } = req.body;
    
    const verification = await RiderVerification.findById(verificationId);
    if (!verification) {
      return res.status(404).json({ success: false, message: 'Verification not found' });
    }
    
    if (isApproved) {
      verification.verificationStatus.step = 'approved';
      verification.verificationStatus.documentsVerified = true;
      verification.verificationStatus.biometricVerified = true;
      verification.verificationStatus.verifiedAt = new Date();
      verification.verificationStatus.adminNotes = notes;
      await verification.save();
      
      await User.findByIdAndUpdate(verification.userId, {
        'riderDetails.isApproved': true,
        'riderDetails.approvalDate': new Date(),
        'riderDetails.vehicleType': verification.vehicleInfo?.type,
        'riderDetails.vehicleModel': verification.vehicleInfo?.model,
        'riderDetails.vehicleNumber': verification.vehicleInfo?.number,
        'riderDetails.vehicleColor': verification.vehicleInfo?.color,
        isActive: true
      });
      
      res.json({ success: true, message: 'Rider approved successfully' });
    } else {
      verification.verificationStatus.step = 'rejected';
      verification.verificationStatus.rejectionReason = notes;
      verification.verificationStatus.adminNotes = notes;
      await verification.save();
      
      res.json({ success: true, message: 'Rider rejected' });
    }
  } catch (error) {
    console.error('Admin verification error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete user
router.delete('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    await RiderVerification.deleteMany({ userId: userId });
    await Ride.deleteMany({ $or: [{ passengerId: userId }, { riderId: userId }] });
    await Document.deleteMany({ userId: userId });
    
    const user = await User.findByIdAndDelete(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get live locations from memory (exported from server)
router.get('/live-locations', (req, res) => {
  const { userLocations } = require('../server');
  const locations = userLocations ? Array.from(userLocations.entries()).map(([userId, loc]) => ({
    userId,
    userName: loc.userName,
    userType: loc.userType,
    lat: loc.lat,
    lng: loc.lng,
    speed: loc.speed,
    timestamp: loc.timestamp
  })) : [];
  
  res.json({
    success: true,
    locations,
    count: locations.length
  });
});

module.exports = router;