const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
  riderId: {
    type: String,
    required: true
  },
  riderName: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  message: {
    type: String,
    default: ''
  },
  vehicleType: {
    type: String,
    enum: ['bike', 'auto', 'car'],
    default: 'car'
  },
  riderRating: {
    type: Number,
    default: 4.5
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'expired'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const rideSchema = new mongoose.Schema({
  passengerId: {
    type: String,
    required: true,
    index: true
  },
  passengerName: {
    type: String,
    required: true
  },
  passengerPhone: String,
  riderId: {
    type: String,
    index: true
  },
  riderName: String,
  status: {
    type: String,
    enum: ['pending', 'searching', 'accepted', 'arriving', 'started', 'completed', 'cancelled', 'expired'],
    default: 'pending'
  },
  pickupLocation: {
    lat: Number,
    lng: Number,
    address: String
  },
  dropoffLocation: {
    lat: Number,
    lng: Number,
    address: String
  },
  distance: Number,
  duration: Number,
  fare: Number,
  actualDistance: Number,
  actualDuration: Number,
  tip: {
    type: Number,
    default: 0
  },
  vehicleType: {
    type: String,
    enum: ['bike', 'auto', 'car'],
    default: 'car'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'wallet'],
    default: 'cash'
  },
  bids: [bidSchema],
  cancellationReason: String,
  cancelledBy: {
    type: String,
    enum: ['passenger', 'rider', 'system']
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  startedAt: Date,
  completedAt: Date,
  expiresAt: {
    type: Date,
    default: () => new Date(+new Date() + 10 * 60 * 1000)
  }
});

// Indexes for faster queries
rideSchema.index({ passengerId: 1, status: 1 });
rideSchema.index({ riderId: 1, status: 1 });
rideSchema.index({ status: 1, createdAt: -1 });
rideSchema.index({ 'bids.riderId': 1 });

module.exports = mongoose.model('Ride', rideSchema);