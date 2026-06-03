const express = require('express');
const router = express.Router();

router.get('/test', (req, res) => {
  res.json({ message: 'User route is working!' });
});

router.get('/profile', (req, res) => {
  res.json({ success: true, message: 'Get profile endpoint' });
});

router.put('/profile', (req, res) => {
  res.json({ success: true, message: 'Update profile endpoint' });
});

router.get('/rides', (req, res) => {
  res.json({ success: true, message: 'Get ride history endpoint' });
});

router.post('/change-password', (req, res) => {
  res.json({ success: true, message: 'Change password endpoint' });
});

router.delete('/account', (req, res) => {
  res.json({ success: true, message: 'Delete account endpoint' });
});

module.exports = router;