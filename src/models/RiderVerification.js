const mongoose = require('mongoose');

const riderVerificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  personalInfo: {
    fullName: String,
    email: String,
    phone: String,
    cnic: String,
    dateOfBirth: Date,
    address: String,
  },
  
  vehicleInfo: {
    type: { type: String, enum: ['bike', 'auto', 'car'] },
    model: String,
    number: String,
    color: String,
    year: String,
  },
  
  documents: {
    idCardFront: { url: String, uploadedAt: Date },
    idCardBack: { url: String, uploadedAt: Date },
    drivingLicense: { url: String, uploadedAt: Date },
    vehicleRegistration: { url: String, uploadedAt: Date },
  },
  
  biometric: {
    leftHand: { url: String, uploadedAt: Date },
    rightHand: { url: String, uploadedAt: Date },
  },
  
  verificationStatus: {
    step: { type: String, enum: ['pending', 'documents_review', 'biometric_review', 'approved', 'rejected'], default: 'pending' },
    documentsSubmitted: { type: Boolean, default: false },
    documentsVerified: { type: Boolean, default: false },
    biometricVerified: { type: Boolean, default: false },
    adminNotes: String,
    rejectionReason: String,
    verifiedAt: Date,
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('RiderVerification', riderVerificationSchema);