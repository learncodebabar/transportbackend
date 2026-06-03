const User = require('../models/User');
const Ride = require('../models/Ride');

// Update rider profile
const updateRiderProfile = async (req, res) => {
  try {
    const { name, phone, profileImage } = req.body;
    
    const updates = {};
    if (name) updates.name = name;
    if (phone) updates.phone = phone;
    if (profileImage) updates.profileImage = profileImage;
    
    const rider = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');
    
    res.json({
      success: true,
      message: 'Rider profile updated successfully',
      rider,
    });
  } catch (error) {
    console.error('Update rider profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Update vehicle info
const updateVehicleInfo = async (req, res) => {
  try {
    const { vehicleType, vehicleModel, vehicleNumber, vehicleColor } = req.body;
    
    const updates = {};
    if (vehicleType) updates['riderDetails.vehicleType'] = vehicleType;
    if (vehicleModel) updates['riderDetails.vehicleModel'] = vehicleModel;
    if (vehicleNumber) updates['riderDetails.vehicleNumber'] = vehicleNumber;
    if (vehicleColor) updates['riderDetails.vehicleColor'] = vehicleColor;
    
    const rider = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');
    
    res.json({
      success: true,
      message: 'Vehicle information updated successfully',
      vehicleDetails: rider.riderDetails,
    });
  } catch (error) {
    console.error('Update vehicle info error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get rider dashboard
const getRiderDashboard = async (req, res) => {
  try {
    const riderId = req.user._id;
    
    // Today's earnings
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayRides = await Ride.find({
      riderId,
      status: 'completed',
      completedAt: { $gte: today, $lt: tomorrow },
    });
    
    const todayEarnings = todayRides.reduce((sum, ride) => sum + (ride.fare || 0), 0);
    const todayRidesCount = todayRides.length;
    
    // Weekly earnings
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const weeklyRides = await Ride.find({
      riderId,
      status: 'completed',
      completedAt: { $gte: weekAgo },
    });
    
    const weeklyEarnings = weeklyRides.reduce((sum, ride) => sum + (ride.fare || 0), 0);
    
    // Monthly earnings
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    
    const monthlyRides = await Ride.find({
      riderId,
      status: 'completed',
      completedAt: { $gte: monthAgo },
    });
    
    const monthlyEarnings = monthlyRides.reduce((sum, ride) => sum + (ride.fare || 0), 0);
    
    // Total stats
    const totalRides = await Ride.countDocuments({ riderId, status: 'completed' });
    const totalEarnings = await Ride.aggregate([
      { $match: { riderId: req.user._id, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$fare' } } },
    ]);
    
    // Rating
    const ratedRides = await Ride.find({ riderId, riderRating: { $ne: null } });
    const averageRating = ratedRides.length > 0
      ? ratedRides.reduce((sum, r) => sum + (r.riderRating || 0), 0) / ratedRides.length
      : 5;
    
    // Available rides count
    const availableRides = await Ride.countDocuments({ status: 'pending' });
    
    // Active ride
    const activeRide = await Ride.findOne({
      riderId,
      status: { $in: ['accepted', 'arrived', 'in_progress'] },
    }).populate('passengerId', 'name phone profileImage');
    
    // Get rider details
    const rider = await User.findById(req.user._id).select('riderDetails');
    
    res.json({
      success: true,
      dashboard: {
        today: {
          earnings: todayEarnings,
          rides: todayRidesCount,
        },
        weekly: {
          earnings: weeklyEarnings,
          rides: weeklyRides.length,
        },
        monthly: {
          earnings: monthlyEarnings,
          rides: monthlyRides.length,
        },
        total: {
          earnings: totalEarnings[0]?.total || 0,
          rides: totalRides,
        },
        averageRating: parseFloat(averageRating.toFixed(1)),
        availableRides,
        activeRide,
        isAvailable: rider?.riderDetails?.availabilityStatus || false,
        isApproved: rider?.riderDetails?.isApproved || false,
      },
    });
  } catch (error) {
    console.error('Get rider dashboard error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get rider stats
const getRiderStats = async (req, res) => {
  try {
    const riderId = req.user._id;
    
    const completedRides = await Ride.find({ riderId, status: 'completed' });
    
    const totalEarnings = completedRides.reduce((sum, ride) => sum + (ride.fare || 0), 0);
    const totalDistance = completedRides.reduce((sum, ride) => sum + (ride.distance || 0), 0);
    const totalRides = completedRides.length;
    
    const ratedRides = completedRides.filter(r => r.riderRating);
    const averageRating = ratedRides.length > 0
      ? ratedRides.reduce((sum, r) => sum + (r.riderRating || 0), 0) / ratedRides.length
      : 5;
    
    const rider = await User.findById(riderId).select('riderDetails createdAt');
    
    res.json({
      success: true,
      stats: {
        totalEarnings,
        totalDistance: parseFloat(totalDistance.toFixed(2)),
        totalRides,
        averageRating: parseFloat(averageRating.toFixed(1)),
        memberSince: rider?.createdAt,
        vehicleInfo: rider?.riderDetails,
      },
    });
  } catch (error) {
    console.error('Get rider stats error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Update rider location
const updateRiderLocation = async (req, res) => {
  try {
    const { lat, lng, address } = req.body;
    
    const rider = await User.findByIdAndUpdate(
      req.user._id,
      {
        'location.lat': lat,
        'location.lng': lng,
        'location.address': address,
        lastActive: new Date(),
      },
      { new: true }
    );
    
    // Emit location update via socket
    const io = req.app.get('io');
    if (io) {
      io.emit('rider:location-update', {
        riderId: rider.userId,
        riderName: rider.name,
        location: { lat, lng, address },
        timestamp: new Date(),
      });
    }
    
    res.json({
      success: true,
      message: 'Location updated successfully',
      location: rider.location,
    });
  } catch (error) {
    console.error('Update rider location error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get earnings history
const getEarningsHistory = async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    let startDate, endDate;
    const now = new Date();
    
    switch (period) {
      case 'week':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        endDate = new Date();
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date();
    }
    
    const rides = await Ride.find({
      riderId: req.user._id,
      status: 'completed',
      completedAt: { $gte: startDate, $lte: endDate },
    }).sort({ completedAt: 1 });
    
    const earningsByDay = {};
    rides.forEach(ride => {
      const day = ride.completedAt.toISOString().split('T')[0];
      if (!earningsByDay[day]) {
        earningsByDay[day] = { earnings: 0, rides: 0, distance: 0 };
      }
      earningsByDay[day].earnings += ride.fare || 0;
      earningsByDay[day].rides += 1;
      earningsByDay[day].distance += ride.distance || 0;
    });
    
    const earningsHistory = Object.entries(earningsByDay).map(([date, data]) => ({
      date,
      earnings: data.earnings,
      rides: data.rides,
      distance: parseFloat(data.distance.toFixed(2)),
    }));
    
    res.json({
      success: true,
      period,
      earningsHistory,
      summary: {
        totalEarnings: rides.reduce((sum, r) => sum + (r.fare || 0), 0),
        totalRides: rides.length,
        totalDistance: parseFloat(rides.reduce((sum, r) => sum + (r.distance || 0), 0).toFixed(2)),
        averageFare: rides.length > 0 ? (rides.reduce((sum, r) => sum + (r.fare || 0), 0) / rides.length).toFixed(2) : 0,
      },
    });
  } catch (error) {
    console.error('Get earnings history error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Toggle availability
const toggleAvailability = async (req, res) => {
  try {
    const rider = await User.findById(req.user._id);
    
    if (!rider.riderDetails.isApproved) {
      return res.status(403).json({
        success: false,
        message: 'Your account is not approved yet. Please complete verification.',
      });
    }
    
    const newStatus = !rider.riderDetails.availabilityStatus;
    
    rider.riderDetails.availabilityStatus = newStatus;
    await rider.save();
    
    const io = req.app.get('io');
    if (io) {
      io.emit('rider:availability-change', {
        riderId: rider.userId,
        isAvailable: newStatus,
      });
    }
    
    res.json({
      success: true,
      message: newStatus ? 'You are now online and available for rides' : 'You are now offline',
      isAvailable: newStatus,
    });
  } catch (error) {
    console.error('Toggle availability error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get verification status
const getVerificationStatus = async (req, res) => {
  try {
    const rider = await User.findById(req.user._id);
    
    res.json({
      success: true,
      verificationStatus: {
        isVerified: rider.isVerified || false,
        isApproved: rider.riderDetails.isApproved || false,
        documentsSubmitted: rider.riderDetails.documentsSubmitted || false,
        documentsVerified: rider.riderDetails.documentsVerified || false,
        biometricSubmitted: rider.riderDetails.biometricSubmitted || false,
        biometricVerified: rider.riderDetails.biometricVerified || false,
        approvalDate: rider.riderDetails.approvalDate,
      },
    });
  } catch (error) {
    console.error('Get verification status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get recent rides
const getRecentRides = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const rides = await Ride.find({
      riderId: req.user._id,
    })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('passengerId', 'name profileImage phone');
    
    res.json({
      success: true,
      rides,
      count: rides.length,
    });
  } catch (error) {
    console.error('Get recent rides error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get ride details
const getRideDetails = async (req, res) => {
  try {
    const { rideId } = req.params;
    
    const ride = await Ride.findOne({ rideId })
      .populate('passengerId', 'name phone profileImage rating')
      .populate('riderId', 'name phone profileImage rating');
    
    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found',
      });
    }
    
    if (ride.riderId?._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to view this ride',
      });
    }
    
    res.json({
      success: true,
      ride,
    });
  } catch (error) {
    console.error('Get ride details error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Export all functions
module.exports = {
  updateRiderProfile,
  getRiderDashboard,
  updateRiderLocation,
  getEarningsHistory,
  toggleAvailability,
  getVerificationStatus,
  getRecentRides,
  getRideDetails,
  updateVehicleInfo,
  getRiderStats,
};