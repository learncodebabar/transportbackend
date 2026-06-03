const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
  rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true },
  riderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  riderName: String,
  riderRating: Number,
  amount: { type: Number, required: true },
  message: String,
  status: { 
    type: String, 
    enum: ['pending', 'accepted', 'rejected', 'expired'],
    default: 'pending'
  },
  vehicleType: { type: String, enum: ['bike', 'auto', 'car'] },
  estimatedTime: Number,
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(+new Date() + 5*60000) }, // 5 minutes expiry
}, {
  timestamps: true,
});

module.exports = mongoose.model('Bid', bidSchema);