const RiderVerification = require('../models/RiderVerification');
const User = require('../models/User');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'uploads/rider-verification/';
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    
    if (file.fieldname.includes('Hand')) {
      folder += 'biometrics';
    } else if (file.fieldname.includes('idCard')) {
      folder += 'id-cards';
    } else if (file.fieldname.includes('License')) {
      folder += 'licenses';
    } else {
      folder += 'documents';
    }
    
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${req.user.userId}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (JPEG, PNG, GIF)'));
  }
};

const upload = multer({ 
  storage, 
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter 
});

const uploadFields = upload.fields([
  { name: 'idCardFront', maxCount: 1 },
  { name: 'idCardBack', maxCount: 1 },
  { name: 'drivingLicense', maxCount: 1 },
  { name: 'vehicleRegistration', maxCount: 1 },
  { name: 'leftHand', maxCount: 1 },
  { name: 'rightHand', maxCount: 1 },
]);

// Start verification
const startVerification = async (req, res) => {
  try {
    const { personalInfo, vehicleInfo } = req.body;
    
    let verification = await RiderVerification.findOne({ userId: req.user._id });
    
    if (verification) {
      return res.status(400).json({
        success: false,
        message: 'Verification already in progress',
      });
    }
    
    verification = new RiderVerification({
      userId: req.user._id,
      personalInfo: JSON.parse(personalInfo),
      vehicleInfo: JSON.parse(vehicleInfo),
      verificationStatus: { step: 'pending' },
    });
    
    await verification.save();
    
    res.json({
      success: true,
      message: 'Verification started. Please upload documents.',
      verificationId: verification._id,
    });
  } catch (error) {
    console.error('Start verification error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Upload files
const uploadVerificationFiles = async (req, res) => {
  try {
    const verification = await RiderVerification.findOne({ userId: req.user._id });
    if (!verification) {
      return res.status(404).json({ success: false, message: 'Verification not found' });
    }
    
    const files = req.files;
    const results = {};
    
    for (const [fieldName, fileArray] of Object.entries(files)) {
      const file = fileArray[0];
      
      if (fieldName === 'leftHand' || fieldName === 'rightHand') {
        verification.biometric[fieldName] = {
          url: file.path,
          uploadedAt: new Date(),
        };
        results[fieldName] = { uploaded: true, url: file.path };
      } else {
        verification.documents[fieldName] = {
          url: file.path,
          uploadedAt: new Date(),
        };
        results[fieldName] = { uploaded: true, url: file.path };
      }
    }
    
    await verification.save();
    
    res.json({ success: true, message: 'Files uploaded', results });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
};

// Submit for admin review
const submitForReview = async (req, res) => {
  try {
    const verification = await RiderVerification.findOne({ userId: req.user._id });
    
    if (!verification) {
      return res.status(404).json({ success: false, message: 'Verification not found' });
    }
    
    const requiredDocs = ['idCardFront', 'idCardBack', 'drivingLicense', 'vehicleRegistration'];
    const missingDocs = requiredDocs.filter(doc => !verification.documents[doc]?.url);
    
    if (missingDocs.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing documents: ${missingDocs.join(', ')}`,
      });
    }
    
    if (!verification.biometric.leftHand?.url || !verification.biometric.rightHand?.url) {
      return res.status(400).json({
        success: false,
        message: 'Please upload both left and right hand images',
      });
    }
    
    verification.verificationStatus.step = 'documents_review';
    verification.verificationStatus.documentsSubmitted = true;
    await verification.save();
    
    console.log(`📋 Rider verification submitted: ${verification._id}`);
    
    res.json({
      success: true,
      message: 'Application submitted for review. You will be notified once verified.',
    });
  } catch (error) {
    console.error('Submit error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Admin: Verify documents
const verifyDocuments = async (req, res) => {
  try {
    const { verificationId, isVerified, notes } = req.body;
    
    const verification = await RiderVerification.findById(verificationId);
    if (!verification) {
      return res.status(404).json({ success: false, message: 'Verification not found' });
    }
    
    verification.verificationStatus.documentsVerified = isVerified;
    verification.verificationStatus.adminNotes = notes;
    
    if (isVerified) {
      verification.verificationStatus.step = 'biometric_review';
    } else {
      verification.verificationStatus.step = 'rejected';
      verification.verificationStatus.rejectionReason = notes;
    }
    
    await verification.save();
    
    res.json({ success: true, message: isVerified ? 'Documents verified' : 'Documents rejected' });
  } catch (error) {
    console.error('Verify documents error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Admin: Verify biometrics and approve rider
const verifyBiometrics = async (req, res) => {
  try {
    const { verificationId, isVerified, notes } = req.body;
    
    const verification = await RiderVerification.findById(verificationId);
    if (!verification) {
      return res.status(404).json({ success: false, message: 'Verification not found' });
    }
    
    verification.verificationStatus.biometricVerified = isVerified;
    verification.verificationStatus.adminNotes = notes;
    
    if (isVerified) {
      verification.verificationStatus.step = 'approved';
      verification.verificationStatus.verifiedAt = new Date();
      
      // Update user as approved rider
      await User.findByIdAndUpdate(verification.userId, {
        'riderDetails.isApproved': true,
        'riderDetails.approvalDate': new Date(),
        'riderDetails.vehicleType': verification.vehicleInfo.type,
        'riderDetails.vehicleModel': verification.vehicleInfo.model,
        'riderDetails.vehicleNumber': verification.vehicleInfo.number,
        'riderDetails.vehicleColor': verification.vehicleInfo.color,
      });
    } else {
      verification.verificationStatus.step = 'rejected';
      verification.verificationStatus.rejectionReason = notes;
    }
    
    await verification.save();
    
    res.json({ 
      success: true, 
      message: isVerified ? 'Rider approved successfully' : 'Rider rejected',
    });
  } catch (error) {
    console.error('Verify biometrics error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get verification status
const getVerificationStatus = async (req, res) => {
  try {
    const verification = await RiderVerification.findOne({ userId: req.user._id });
    
    if (!verification) {
      return res.json({
        success: true,
        hasApplication: false,
      });
    }
    
    res.json({
      success: true,
      hasApplication: true,
      verification: {
        id: verification._id,
        step: verification.verificationStatus.step,
        documentsVerified: verification.verificationStatus.documentsVerified,
        biometricVerified: verification.verificationStatus.biometricVerified,
        rejectionReason: verification.verificationStatus.rejectionReason,
        createdAt: verification.createdAt,
      },
    });
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Export all functions
module.exports = {
  startVerification,
  uploadVerificationFiles,
  submitForReview,
  verifyDocuments,
  verifyBiometrics,
  getVerificationStatus,
  uploadFields,
};