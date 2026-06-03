const User = require('../models/User');
const Ride = require('../models/Ride');
const Notification = require('../models/Notification');

// Update rider profile
const updateRiderProfile = async (req, res) => {
  try {
    const { vehicleType, vehicleModel, vehicleNumber, vehicleColor, availabilityStatus } = req.body;
    
    const updates = {};
    if (vehicleType) updates['riderDetails.vehicleType'] = vehicleType;
    if (vehicleModel) updates['riderDetails.vehicleModel'] = vehicleModel;
    if (vehicleNumber) updates['riderDetails.vehicleNumber'] = vehicleNumber;
    if (vehicleColor) updates['riderDetails.vehicleColor'] = vehicleColor;
    if (availabilityStatus !== undefined) updates['riderDetails.availabilityStatus'] = availabilityStatus;
    
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

// Get rider dashboard stats
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
    
    // Available rides count (pending or searching)
    const availableRides = await Ride.countDocuments({ 
      status: { $in: ['pending', 'searching'] },
      vehicleType: { $in: [req.user.riderDetails?.vehicleType, null] }
    });
    
    // Active ride
    const activeRide = await Ride.findOne({
      riderId,
      status: { $in: ['accepted', 'arriving', 'started'] },
    }).populate('passengerId', 'name phone profileImage');
    
    // Pending bids count
    const pendingBids = await Ride.countDocuments({
      'bids.riderId': riderId,
      'bids.status': 'pending'
    });
    
    res.json({
      success: true,
      dashboard: {
        today: {
          earnings: todayEarnings,
          rides: todayRidesCount,
        },
        total: {
          earnings: totalEarnings[0]?.total || 0,
          rides: totalRides,
        },
        averageRating: parseFloat(averageRating.toFixed(1)),
        availableRides,
        activeRide,
        pendingBids,
        isAvailable: req.user.riderDetails?.availabilityStatus || false,
      },
    });
  } catch (error) {
    console.error('Get rider dashboard error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Update rider location
const updateRiderLocation = async (req, res) => {
  try {
    const { lat, lng, address, heading, speed } = req.body;
    
    const rider = await User.findByIdAndUpdate(
      req.user._id,
      {
        'location.lat': lat,
        'location.lng': lng,
        'location.address': address,
        'location.heading': heading,
        'location.speed': speed,
        lastActive: new Date(),
      },
      { new: true }
    );
    
    // Find active ride to update passenger
    const activeRide = await Ride.findOne({
      riderId: req.user._id,
      status: { $in: ['accepted', 'arriving', 'started'] }
    });
    
    if (activeRide) {
      // Calculate ETA if pickup location exists
      let eta = null;
      let status = 'on_way';
      
      if (activeRide.status === 'accepted' && activeRide.pickupLocation) {
        // Calculate distance to pickup
        const distanceToPickup = calculateDistance(
          lat, lng,
          activeRide.pickupLocation.lat,
          activeRide.pickupLocation.lng
        );
        
        const estimatedTime = (distanceToPickup / 30) * 60; // Assuming 30km/h average speed
        eta = Math.round(estimatedTime);
        status = distanceToPickup < 0.5 ? 'arriving' : 'on_way';
        
        if (distanceToPickup < 0.5 && activeRide.status === 'accepted') {
          activeRide.status = 'arriving';
          await activeRide.save();
        }
      } else if (activeRide.status === 'started' && activeRide.dropoffLocation) {
        // Calculate distance to dropoff
        const distanceToDropoff = calculateDistance(
          lat, lng,
          activeRide.dropoffLocation.lat,
          activeRide.dropoffLocation.lng
        );
        eta = Math.round((distanceToDropoff / 30) * 60);
        status = 'in_ride';
      }
      
      // Emit location update via socket with ETA
      const io = req.app.get('io');
      if (io) {
        io.to(`passenger_${activeRide.passengerId}`).emit('rider:location', {
          rideId: activeRide._id,
          location: { lat, lng, address, heading, speed },
          eta,
          status,
          timestamp: new Date(),
        });
        
        io.to(`passenger_${activeRide.passengerId}`).emit('rider:eta', {
          eta,
          distance: eta ? (eta * 0.5).toFixed(1) : null,
          status,
        });
      }
    }
    
    res.json({
      success: true,
      message: 'Location updated',
      location: rider.location,
    });
  } catch (error) {
    console.error('Update rider location error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Helper function to calculate distance
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// Get earnings history
const getEarningsHistory = async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    let startDate;
    const now = new Date();
    
    switch (period) {
      case 'week':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    
    const rides = await Ride.find({
      riderId: req.user._id,
      status: 'completed',
      completedAt: { $gte: startDate },
    }).sort({ completedAt: 1 });
    
    // Group by day
    const earningsByDay = {};
    rides.forEach(ride => {
      const day = ride.completedAt.toISOString().split('T')[0];
      if (!earningsByDay[day]) {
        earningsByDay[day] = { earnings: 0, rides: 0, tips: 0 };
      }
      earningsByDay[day].earnings += ride.fare || 0;
      earningsByDay[day].rides += 1;
      earningsByDay[day].tips += ride.tip || 0;
    });
    
    const earningsHistory = Object.entries(earningsByDay).map(([date, data]) => ({
      date,
      earnings: data.earnings,
      rides: data.rides,
      tips: data.tips,
    }));
    
    // Calculate weekly average
    const weeklyAverage = earningsHistory.slice(-7).reduce((sum, day) => sum + day.earnings, 0) / 
                         Math.min(7, earningsHistory.length);
    
    res.json({
      success: true,
      period,
      earningsHistory,
      totalEarnings: rides.reduce((sum, r) => sum + (r.fare || 0), 0),
      totalRides: rides.length,
      totalTips: rides.reduce((sum, r) => sum + (r.tip || 0), 0),
      weeklyAverage: Math.round(weeklyAverage),
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
    const newStatus = !rider.riderDetails.availabilityStatus;
    
    rider.riderDetails.availabilityStatus = newStatus;
    await rider.save();
    
    // Notify system about availability change
    const io = req.app.get('io');
    if (io && newStatus) {
      io.emit('rider:available', {
        riderId: req.user._id,
        riderName: req.user.name,
        location: rider.location,
        vehicleType: rider.riderDetails?.vehicleType,
      });
    }
    
    res.json({
      success: true,
      message: newStatus ? 'You are now online' : 'You are now offline',
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
        isApproved: rider.riderDetails.isApproved,
        documentsSubmitted: rider.riderDetails.documentsSubmitted,
        documentsVerified: rider.riderDetails.documentsVerified,
        biometricSubmitted: rider.riderDetails.biometricSubmitted,
        biometricVerified: rider.riderDetails.biometricVerified,
        approvalDate: rider.riderDetails.approvalDate,
        pendingVerification: !rider.riderDetails.isApproved,
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
      status: { $in: ['completed', 'cancelled'] },
    })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('passengerId', 'name profileImage phone');
    
    res.json({
      success: true,
      rides,
    });
  } catch (error) {
    console.error('Get recent rides error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get available ride requests (for bidding)
const getAvailableRides = async (req, res) => {
  try {
    const { lat, lng, radius = 10 } = req.query;
    
    let query = {
      status: 'searching',
      vehicleType: { $in: [req.user.riderDetails?.vehicleType, null] }
    };
    
    // Filter by location if provided
    if (lat && lng) {
      const rides = await Ride.find(query);
      
      // Calculate distance and filter
      const ridesWithDistance = rides.map(ride => {
        const distance = calculateDistance(
          parseFloat(lat), parseFloat(lng),
          ride.pickupLocation.lat, ride.pickupLocation.lng
        );
        return { ...ride.toObject(), distance };
      });
      
      const filteredRides = ridesWithDistance
        .filter(ride => ride.distance <= parseFloat(radius))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 20);
      
      return res.json({
        success: true,
        rides: filteredRides,
        count: filteredRides.length
      });
    }
    
    const rides = await Ride.find(query)
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('passengerId', 'name rating');
    
    res.json({
      success: true,
      rides,
      count: rides.length
    });
  } catch (error) {
    console.error('Get available rides error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Place a bid on a ride
const placeBid = async (req, res) => {
  try {
    const { rideId } = req.params;
    const { amount, message, vehicleType } = req.body;
    
    const ride = await Ride.findById(rideId);
    
    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }
    
    if (ride.status !== 'searching') {
      return res.status(400).json({
        success: false,
        message: 'Ride is no longer accepting bids'
      });
    }
    
    // Check if rider already placed a bid
    const existingBid = ride.bids.find(bid => bid.riderId.toString() === req.user._id.toString());
    if (existingBid) {
      return res.status(400).json({
        success: false,
        message: 'You have already placed a bid on this ride'
      });
    }
    
    const bid = {
      riderId: req.user._id,
      riderName: req.user.name,
      amount: amount || Math.round(ride.fare * 0.9), // Default 10% less than estimated
      message: message || 'I can take this ride',
      vehicleType: vehicleType || req.user.riderDetails?.vehicleType,
      riderRating: req.user.riderDetails?.rating || 4.5,
      status: 'pending',
      createdAt: new Date()
    };
    
    ride.bids.push(bid);
    await ride.save();
    
    // Create notification for passenger
    await Notification.create({
      userId: ride.passengerId,
      userType: 'passenger',
      title: 'New Bid Received',
      message: `${req.user.name} placed a bid of ₨${bid.amount} for your ride`,
      type: 'bid_placed',
      data: {
        rideId: ride._id,
        bidId: bid._id,
        amount: bid.amount,
        riderId: req.user._id,
        riderName: req.user.name
      }
    });
    
    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`passenger_${ride.passengerId}`).emit('new-bid', {
        rideId: ride._id,
        bid: {
          id: bid._id,
          riderId: req.user._id,
          riderName: req.user.name,
          amount: bid.amount,
          message: bid.message,
          vehicleType: bid.vehicleType,
          riderRating: bid.riderRating
        }
      });
    }
    
    res.json({
      success: true,
      message: 'Bid placed successfully',
      bid
    });
    
  } catch (error) {
    console.error('Place bid error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Accept a ride (when passenger accepts rider's bid)
const acceptRide = async (req, res) => {
  try {
    const { rideId } = req.params;
    
    const ride = await Ride.findById(rideId);
    
    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }
    
    // Check if this rider's bid was accepted
    const acceptedBid = ride.bids.find(bid => 
      bid.riderId.toString() === req.user._id.toString() && 
      bid.status === 'accepted'
    );
    
    if (!acceptedBid) {
      return res.status(400).json({
        success: false,
        message: 'Your bid was not accepted for this ride'
      });
    }
    
    if (ride.status !== 'accepted') {
      return res.status(400).json({
        success: false,
        message: 'Ride is no longer available'
      });
    }
    
    // Update ride status
    ride.status = 'accepted';
    ride.riderId = req.user._id;
    ride.riderName = req.user.name;
    ride.fare = acceptedBid.amount;
    ride.updatedAt = new Date();
    await ride.save();
    
    // Create notification for passenger
    await Notification.create({
      userId: ride.passengerId,
      userType: 'passenger',
      title: 'Ride Confirmed',
      message: `${req.user.name} has accepted your ride! They will arrive shortly.`,
      type: 'ride_accepted',
      data: { rideId: ride._id, riderId: req.user._id, fare: acceptedBid.amount }
    });
    
    // Create notification for rider
    await Notification.create({
      userId: req.user._id,
      userType: 'rider',
      title: 'Ride Accepted',
      message: `You have accepted a ride to ${ride.dropoffLocation.address}`,
      type: 'ride_accepted',
      data: { rideId: ride._id, passengerId: ride.passengerId }
    });
    
    // Emit socket events
    const io = req.app.get('io');
    if (io) {
      io.to(`passenger_${ride.passengerId}`).emit('ride:accepted-by-rider', {
        rideId: ride._id,
        riderName: req.user.name,
        riderId: req.user._id,
        fare: acceptedBid.amount,
        pickupLocation: ride.pickupLocation,
        dropoffLocation: ride.dropoffLocation
      });
      
      io.to(`rider_${req.user._id}`).emit('ride:accepted', {
        rideId: ride._id,
        passengerName: ride.passengerName,
        pickupLocation: ride.pickupLocation,
        dropoffLocation: ride.dropoffLocation,
        fare: acceptedBid.amount
      });
    }
    
    res.json({
      success: true,
      message: 'Ride accepted successfully',
      ride
    });
    
  } catch (error) {
    console.error('Accept ride error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Start ride (begin trip)
const startRide = async (req, res) => {
  try {
    const { rideId } = req.params;
    
    const ride = await Ride.findOne({
      _id: rideId,
      riderId: req.user._id,
      status: 'arriving'
    });
    
    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found or not in arriving status'
      });
    }
    
    ride.status = 'started';
    ride.startedAt = new Date();
    await ride.save();
    
    // Create notification
    await Notification.create({
      userId: ride.passengerId,
      userType: 'passenger',
      title: 'Ride Started',
      message: 'Your ride has started. Enjoy your journey!',
      type: 'ride_started',
      data: { rideId: ride._id }
    });
    
    const io = req.app.get('io');
    if (io) {
      io.to(`passenger_${ride.passengerId}`).emit('ride:started', {
        rideId: ride._id,
        startedAt: ride.startedAt
      });
    }
    
    res.json({
      success: true,
      message: 'Ride started successfully',
      ride
    });
    
  } catch (error) {
    console.error('Start ride error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Complete ride
const completeRide = async (req, res) => {
  try {
    const { rideId } = req.params;
    const { actualDistance, actualDuration, tip } = req.body;
    
    const ride = await Ride.findOne({
      _id: rideId,
      riderId: req.user._id,
      status: 'started'
    });
    
    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found or not in progress'
      });
    }
    
    ride.status = 'completed';
    ride.completedAt = new Date();
    if (actualDistance) ride.actualDistance = actualDistance;
    if (actualDuration) ride.actualDuration = actualDuration;
    if (tip) ride.tip = tip;
    ride.updatedAt = new Date();
    await ride.save();
    
    // Update rider stats
    await User.findByIdAndUpdate(req.user._id, {
      $inc: {
        'riderDetails.totalRides': 1,
        'riderDetails.totalEarnings': ride.fare + (tip || 0)
      }
    });
    
    // Create notification for passenger
    await Notification.create({
      userId: ride.passengerId,
      userType: 'passenger',
      title: 'Ride Completed',
      message: `Your ride has been completed. Total fare: ₨${ride.fare + (tip || 0)}`,
      type: 'ride_completed',
      data: { 
        rideId: ride._id, 
        fare: ride.fare,
        tip: tip || 0,
        total: ride.fare + (tip || 0)
      }
    });
    
    // Create notification for rider
    await Notification.create({
      userId: req.user._id,
      userType: 'rider',
      title: 'Ride Completed',
      message: `You completed a ride. Earned: ₨${ride.fare + (tip || 0)}`,
      type: 'ride_completed',
      data: { rideId: ride._id, earnings: ride.fare + (tip || 0) }
    });
    
    const io = req.app.get('io');
    if (io) {
      io.to(`passenger_${ride.passengerId}`).emit('ride:completed', {
        rideId: ride._id,
        fare: ride.fare,
        tip: tip || 0,
        total: ride.fare + (tip || 0),
        distance: actualDistance || ride.distance,
        duration: actualDuration || ride.duration
      });
    }
    
    res.json({
      success: true,
      message: 'Ride completed successfully',
      ride
    });
    
  } catch (error) {
    console.error('Complete ride error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Cancel ride (by rider)
const cancelRide = async (req, res) => {
  try {
    const { rideId } = req.params;
    const { reason } = req.body;
    
    const ride = await Ride.findOne({
      _id: rideId,
      riderId: req.user._id,
      status: { $in: ['accepted', 'arriving'] }
    });
    
    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found or cannot be cancelled'
      });
    }
    
    ride.status = 'cancelled';
    ride.cancellationReason = reason || 'Cancelled by rider';
    ride.cancelledBy = 'rider';
    ride.updatedAt = new Date();
    await ride.save();
    
    // Create notification for passenger
    await Notification.create({
      userId: ride.passengerId,
      userType: 'passenger',
      title: 'Ride Cancelled',
      message: `Your ride has been cancelled by the driver: ${reason || 'No reason provided'}`,
      type: 'ride_cancelled',
      data: { rideId: ride._id, cancelledBy: 'rider' }
    });
    
    const io = req.app.get('io');
    if (io) {
      io.to(`passenger_${ride.passengerId}`).emit('ride:cancelled', {
        rideId: ride._id,
        reason: reason || 'Cancelled by driver',
        cancelledBy: 'rider'
      });
    }
    
    res.json({
      success: true,
      message: 'Ride cancelled successfully',
      ride
    });
    
  } catch (error) {
    console.error('Cancel ride error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Update ride status (generic)
const updateRideStatus = async (req, res) => {
  try {
    const { rideId } = req.params;
    const { status, location } = req.body;
    
    const validStatuses = ['arriving', 'started', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status update'
      });
    }
    
    const ride = await Ride.findOne({
      _id: rideId,
      riderId: req.user._id
    });
    
    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }
    
    ride.status = status;
    if (status === 'started') ride.startedAt = new Date();
    if (status === 'completed') ride.completedAt = new Date();
    await ride.save();
    
    const io = req.app.get('io');
    if (io) {
      io.to(`passenger_${ride.passengerId}`).emit(`ride:${status}`, {
        rideId: ride._id,
        status,
        location
      });
    }
    
    res.json({
      success: true,
      message: `Ride ${status} successfully`,
      ride
    });
    
  } catch (error) {
    console.error('Update ride status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get rider's bids
const getMyBids = async (req, res) => {
  try {
    const rides = await Ride.find({
      'bids.riderId': req.user._id
    })
      .sort({ createdAt: -1 })
      .populate('passengerId', 'name profileImage rating');
    
    const myBids = [];
    rides.forEach(ride => {
      const myBid = ride.bids.find(bid => bid.riderId.toString() === req.user._id.toString());
      if (myBid) {
        myBids.push({
          rideId: ride._id,
          rideStatus: ride.status,
          pickupLocation: ride.pickupLocation,
          dropoffLocation: ride.dropoffLocation,
          distance: ride.distance,
          bid: myBid,
          passenger: ride.passengerId,
          createdAt: ride.createdAt
        });
      }
    });
    
    res.json({
      success: true,
      bids: myBids
    });
    
  } catch (error) {
    console.error('Get my bids error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  updateRiderProfile,
  getRiderDashboard,
  updateRiderLocation,
  getEarningsHistory,
  toggleAvailability,
  getVerificationStatus,
  getRecentRides,
  getAvailableRides,
  placeBid,
  acceptRide,
  startRide,
  completeRide,
  cancelRide,
  updateRideStatus,
  getMyBids,
};