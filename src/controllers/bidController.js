const Bid = require('../models/Bid');
const Ride = require('../models/Ride');
const { createNotification } = require('./notificationController');

// Place a bid on a ride
const placeBid = async (req, res) => {
  try {
    const { rideId, amount, message, estimatedTime } = req.body;
    
    const ride = await Ride.findById(rideId);
    if (!ride || ride.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Ride not available for bidding' });
    }
    
    // Check if rider already placed a bid
    const existingBid = await Bid.findOne({ rideId, riderId: req.user._id, status: 'pending' });
    if (existingBid) {
      return res.status(400).json({ success: false, message: 'You already placed a bid for this ride' });
    }
    
    const bid = new Bid({
      rideId,
      riderId: req.user._id,
      riderName: req.user.name,
      riderRating: req.user.rating,
      amount,
      message,
      estimatedTime,
      vehicleType: req.user.riderDetails?.vehicleType,
      status: 'pending',
    });
    
    await bid.save();
    
    // Notify passenger
    await createNotification(
      ride.passengerId,
      'passenger',
      'New Bid Received',
      `${req.user.name} placed a bid of ₨${amount} for your ride`,
      'bid_received',
      { rideId, bidId: bid._id, amount, riderId: req.user._id }
    );
    
    res.json({ success: true, bid });
  } catch (error) {
    console.error('Place bid error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get bids for a ride (passenger view)
const getRideBids = async (req, res) => {
  try {
    const { rideId } = req.params;
    
    const bids = await Bid.find({ rideId, status: 'pending' })
      .sort({ amount: 1 })
      .populate('riderId', 'name rating riderDetails');
    
    res.json({ success: true, bids });
  } catch (error) {
    console.error('Get bids error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Accept a bid (passenger)
const acceptBid = async (req, res) => {
  try {
    const { bidId } = req.params;
    
    const bid = await Bid.findById(bidId).populate('rideId');
    if (!bid) {
      return res.status(404).json({ success: false, message: 'Bid not found' });
    }
    
    // Update bid status
    bid.status = 'accepted';
    await bid.save();
    
    // Reject all other bids for this ride
    await Bid.updateMany(
      { rideId: bid.rideId, _id: { $ne: bidId } },
      { status: 'rejected' }
    );
    
    // Update ride status
    const ride = await Ride.findById(bid.rideId);
    ride.status = 'accepted';
    ride.riderId = bid.riderId;
    ride.riderName = bid.riderName;
    ride.fare = bid.amount;
    await ride.save();
    
    // Notify rider
    await createNotification(
      bid.riderId,
      'rider',
      'Bid Accepted! 🎉',
      `Your bid of ₨${bid.amount} has been accepted for the ride`,
      'bid_accepted',
      { rideId: bid.rideId, bidId, amount: bid.amount }
    );
    
    // Notify passenger
    await createNotification(
      ride.passengerId,
      'passenger',
      'Rider Confirmed',
      `${bid.riderName} has accepted your ride request`,
      'ride_confirmed',
      { rideId: bid.rideId, riderId: bid.riderId }
    );
    
    res.json({ success: true, message: 'Bid accepted', ride });
  } catch (error) {
    console.error('Accept bid error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get rider's bids (rider view)
const getMyBids = async (req, res) => {
  try {
    const bids = await Bid.find({ riderId: req.user._id })
      .sort({ createdAt: -1 })
      .populate('rideId', 'pickupLocation dropoffLocation distance');
    
    res.json({ success: true, bids });
  } catch (error) {
    console.error('Get my bids error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  placeBid,
  getRideBids,
  acceptBid,
  getMyBids,
};