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
  getAvailableRides,
  placeBid,
  acceptRide,
  startRide,
  completeRide,
  cancelRide,
  updateRideStatus,
  getMyBids,
} = require('../controllers/rideController');

// All routes require authentication and rider role
router.use(protect);
router.use(authorize('rider'));

// Dashboard and stats
router.get('/dashboard', getRiderDashboard);
router.get('/earnings', getEarningsHistory);
router.get('/recent-rides', getRecentRides);

// Profile management
router.put('/profile', validate('updateRiderProfile'), updateRiderProfile);
router.post('/location', validate('updateRiderLocation'), updateRiderLocation);
router.post('/toggle-availability', toggleAvailability);

// Verification
router.get('/verification-status', getVerificationStatus);

// Ride management
router.get('/available-rides', getAvailableRides);
router.post('/rides/:rideId/bid', placeBid);
router.post('/rides/:rideId/accept', acceptRide);
router.post('/rides/:rideId/start', startRide);
router.post('/rides/:rideId/complete', completeRide);
router.post('/rides/:rideId/cancel', cancelRide);
router.patch('/rides/:rideId/status', updateRideStatus);
router.get('/my-bids', getMyBids);

module.exports = router;