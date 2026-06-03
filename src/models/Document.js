const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  documentType: { 
    type: String, 
    enum: ['idCardFront', 'idCardBack', 'selfie', 'biometricLeft', 'biometricRight', 'license'], 
    required: true 
  },
  fileUrl: { type: String, required: true },
  fileKey: { type: String, required: true },
  mimeType: String,
  fileSize: Number,
  isVerified: { type: Boolean, default: false },
  verificationNotes: String,
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: Date,
  uploadedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
});

// Index for faster queries
documentSchema.index({ userId: 1, documentType: 1 });

module.exports = mongoose.model('Document', documentSchema);