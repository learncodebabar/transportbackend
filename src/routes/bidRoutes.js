const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  placeBid,
  getRideBids,
  acceptBid,
  getMyBids,
} = require('../controllers/bidController');

router.post('/place', protect, authorize('rider'), placeBid);
router.get('/ride/:rideId', protect, authorize('passenger'), getRideBids);
router.put('/:bidId/accept', protect, authorize('passenger'), acceptBid);
router.get('/my-bids', protect, authorize('rider'), getMyBids);

module.exports = router;