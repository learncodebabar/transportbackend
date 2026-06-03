const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  userType: { 
    type: String, 
    enum: ['passenger', 'rider'], 
    required: true
  },
  isVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  rating: { type: Number, default: 5.0 },
  totalRides: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  profileImage: { type: String, default: null },
  location: {
    lat: Number,
    lng: Number,
    address: String,
  },
  riderDetails: {
    isApproved: { type: Boolean, default: false },
    vehicleType: { type: String, enum: ['bike', 'auto', 'car'], default: null },
    vehicleModel: String,
    vehicleNumber: String,
    vehicleColor: String,
    documentsSubmitted: { type: Boolean, default: false },
    documentsVerified: { type: Boolean, default: false },
    biometricSubmitted: { type: Boolean, default: false },
    biometricVerified: { type: Boolean, default: false },
    availabilityStatus: { type: Boolean, default: false },
    approvalDate: Date,
  },
}, {
  timestamps: true,
});

// CORRECT WAY: For async/await, don't use next parameter
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);