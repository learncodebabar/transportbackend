const Document = require('../models/Document');
const User = require('../models/User');

// Upload rider documents
const uploadRiderDocuments = async (req, res) => {
  try {
    const userId = req.user._id;
    
    if (!req.files) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }
    
    const requiredDocs = ['idCardFront', 'idCardBack', 'selfie', 'biometricLeft', 'biometricRight', 'license'];
    const uploadedDocs = Object.keys(req.files);
    
    // Check if all required documents are uploaded
    const missingDocs = requiredDocs.filter(doc => !uploadedDocs.includes(doc));
    if (missingDocs.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Missing documents: ${missingDocs.join(', ')}` 
      });
    }
    
    // Save documents to database
    const savedDocs = [];
    for (const [fieldName, files] of Object.entries(req.files)) {
      const file = files[0];
      const document = await Document.create({
        userId,
        documentType: fieldName,
        fileUrl: file.path,
        fileKey: file.filename,
        mimeType: file.mimetype,
        fileSize: file.size,
      });
      savedDocs.push(document);
    }
    
    // Update user's rider details
    await User.findByIdAndUpdate(userId, {
      'riderDetails.documentsSubmitted': true,
    });
    
    res.json({
      success: true,
      message: 'Documents uploaded successfully. Awaiting verification.',
      documents: savedDocs,
    });
  } catch (error) {
    console.error('Upload documents error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get user documents
const getUserDocuments = async (req, res) => {
  try {
    const documents = await Document.find({ userId: req.user._id });
    res.json({ success: true, documents });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Verify document (Admin only)
const verifyDocument = async (req, res) => {
  try {
    const { documentId, isVerified, notes } = req.body;
    
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }
    
    document.isVerified = isVerified;
    document.verificationNotes = notes;
    document.verifiedBy = req.user._id;
    document.verifiedAt = new Date();
    await document.save();
    
    // Check if all documents are verified
    const allDocuments = await Document.find({ userId: document.userId });
    const allVerified = allDocuments.every(doc => doc.isVerified === true);
    
    if (allVerified) {
      await User.findByIdAndUpdate(document.userId, {
        'riderDetails.documentsVerified': true,
        'riderDetails.isApproved': true,
        'riderDetails.approvalDate': new Date(),
      });
    }
    
    res.json({
      success: true,
      message: isVerified ? 'Document verified' : 'Document rejected',
    });
  } catch (error) {
    console.error('Verify document error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Submit biometric verification (hand photos)
const submitBiometricVerification = async (req, res) => {
  try {
    const { leftHandImage, rightHandImage } = req.body;
    
    // In a real app, you would integrate with a biometric verification service
    // Here we'll just save the images
    const userId = req.user._id;
    
    await User.findByIdAndUpdate(userId, {
      'riderDetails.biometricSubmitted': true,
    });
    
    res.json({
      success: true,
      message: 'Biometric verification submitted. Awaiting approval.',
    });
  } catch (error) {
    console.error('Biometric verification error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get verification status
const getVerificationStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    res.json({
      success: true,
      status: {
        isVerified: user.isVerified,
        documentsSubmitted: user.riderDetails.documentsSubmitted,
        documentsVerified: user.riderDetails.documentsVerified,
        biometricSubmitted: user.riderDetails.biometricSubmitted,
        biometricVerified: user.riderDetails.biometricVerified,
        isApproved: user.riderDetails.isApproved,
      },
    });
  } catch (error) {
    console.error('Get verification status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  uploadRiderDocuments,
  getUserDocuments,
  verifyDocument,
  submitBiometricVerification,
  getVerificationStatus,
};