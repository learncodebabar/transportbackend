const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { uploadRiderDocuments } = require('../middleware/upload');
const {
  uploadRiderDocuments: uploadDocs,
  getUserDocuments,
  verifyDocument,
  submitBiometricVerification,
  getVerificationStatus,
} = require('../controllers/documentController');

// Protected routes (require authentication)
router.use(protect);

// Get user's documents
router.get('/my-documents', getUserDocuments);

// Get verification status
router.get('/verification-status', getVerificationStatus);

// Upload rider documents (requires rider role)
router.post('/upload', authorize('rider'), uploadRiderDocuments, uploadDocs);

// Submit biometric verification (requires rider role)
router.post('/biometric', authorize('rider'), submitBiometricVerification);

// Admin only: Verify a document
router.put('/verify/:documentId', authorize('admin'), verifyDocument);

// Test route
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Document route is working!' });
});

module.exports = router;