// backend/src/routes/riderVerificationRoutes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  startVerification,
  uploadVerificationFiles,
  submitForReview,
  verifyDocuments,
  verifyBiometrics,
  getVerificationStatus,
  uploadFields,
} = require('../controllers/riderVerificationController');

// All routes require authentication
router.use(protect);

// Rider routes
router.post('/start', authorize('rider'), startVerification);
router.post('/upload', authorize('rider'), uploadFields, uploadVerificationFiles);
router.post('/submit', authorize('rider'), submitForReview);
router.get('/status', authorize('rider'), getVerificationStatus);

// Admin routes
router.put('/verify-documents', authorize('admin'), verifyDocuments);
router.put('/verify-biometrics', authorize('admin'), verifyBiometrics);

// Test route
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Rider verification route working!' });
});

module.exports = router;