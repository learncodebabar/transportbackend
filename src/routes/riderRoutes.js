const express = require('express');
const router = express.Router();
const { protect, authorize, requireRiderApproval } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const {
  updateRiderProfile,
  getRiderDashboard,
  updateRiderLocation,
  getEarningsHistory,
  toggleAvailability,
  getVerificationStatus,
  getRecentRides,
  getRideDetails,
  updateVehicleInfo,
  getRiderStats,
} = require('../controllers/riderController');

// All routes require authentication and rider role
router.use(protect);
router.use(authorize('rider'));

// Dashboard and stats - GET routes
router.get('/dashboard', getRiderDashboard);
router.get('/stats', getRiderStats);
router.get('/earnings', getEarningsHistory);
router.get('/recent-rides', getRecentRides);
router.get('/ride/:rideId', getRideDetails);
router.get('/verification-status', getVerificationStatus);

// Profile and vehicle management - PUT routes
router.put('/profile', updateRiderProfile);
router.put('/vehicle', updateVehicleInfo);

// Location and availability - POST routes
router.post('/location', updateRiderLocation);
router.post('/toggle-availability', toggleAvailability);

// Test route
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Rider route is working!' });
});

module.exports = router;