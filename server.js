// server.js - Complete Ride Sharing Backend Server with MongoDB Atlas
require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const fileUpload = require('express-fileupload');

// Import routes
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const riderRoutes = require('./src/routes/riderRoutes');
const rideRoutes = require('./src/routes/rideRoutes');
const documentRoutes = require('./src/routes/documentRoutes');
const riderVerificationRoutes = require('./src/routes/riderVerificationRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const bidRoutes = require('./src/routes/bidRoutes');

// Import models
const Ride = require('./src/models/Ride');
const Notification = require('./src/models/Notification');
const User = require('./src/models/User');

// Get environment variables
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const DEBUG = process.env.DEBUG === 'true';

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { success: false, message: 'Too many requests, please try again later.' }
});

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Make io accessible to routes
app.set('io', io);
global.io = io;

// Store active users and locations
const activeUsers = new Map(); // userId -> socketId
const userLocations = new Map(); // userId -> location data
const riderSockets = new Map(); // riderId -> socketId
const passengerSockets = new Map(); // passengerId -> socketId

// Email configuration
let emailTransporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  emailTransporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
  console.log('📧 Email service configured');
} else {
  console.log('⚠️ Email not configured, skipping email notifications');
}

// Email template functions
const createRideRequestEmailHTML = (rideData) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; text-align: center; border-radius: 15px 15px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 15px 15px; }
        .ride-details { background: white; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #10b981; }
        .fare { font-size: 28px; color: #10b981; font-weight: bold; }
        .button { background: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h2>🚕 New Ride Request!</h2></div>
        <div class="content">
          <p>Hello <strong>${rideData.riderName || 'Rider'}</strong>,</p>
          <p>A new ride request has been posted.</p>
          <div class="ride-details">
            <div><strong>👤 Passenger:</strong> ${rideData.passengerName}</div>
            <div><strong>📍 Pickup:</strong> ${rideData.pickupLocation?.address || 'Location provided'}</div>
            <div><strong>🎯 Destination:</strong> ${rideData.dropoffLocation?.address || 'Location provided'}</div>
            <div><strong>📏 Distance:</strong> ${rideData.distance} km</div>
            <div><strong>💰 Fare:</strong> <span class="fare">₨${rideData.fare}</span></div>
          </div>
          <div style="text-align: center;">
            <a href="rideapp://accept-ride/${rideData.rideId}" class="button">Open App & Accept</a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

const createBidAcceptedEmailHTML = (data) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; text-align: center; border-radius: 15px 15px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 15px 15px; }
        .fare { font-size: 28px; color: #10b981; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h2>💰 Your Bid Has Been Accepted!</h2></div>
        <div class="content">
          <p>Congratulations <strong>${data.riderName}</strong>!</p>
          <p>Your bid of <span class="fare">₨${data.amount}</span> has been accepted.</p>
          <p>Please proceed to pick up the passenger.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

const createRideCompletedEmailHTML = (data) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; text-align: center; border-radius: 15px 15px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 15px 15px; }
        .earnings { font-size: 32px; color: #10b981; font-weight: bold; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h2>🏁 Ride Completed!</h2></div>
        <div class="content">
          <p>Great job <strong>${data.riderName}</strong>!</p>
          <p>You earned: <span class="earnings">₨${data.earnings}</span></p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Function to send email
const sendEmailNotification = async (to, subject, html) => {
  try {
    if (!emailTransporter) {
      console.log('⚠️ Email not configured, skipping notification');
      return false;
    }
    const mailOptions = {
      from: process.env.EMAIL_FROM || `"Ride App" <${process.env.EMAIL_USER}>`,
      to: to,
      subject: subject,
      html: html
    };
    const info = await emailTransporter.sendMail(mailOptions);
    console.log('📧 Email sent to:', to);
    return true;
  } catch (error) {
    console.error('Email send error:', error.message);
    return false;
  }
};

// Connect to MongoDB Atlas
const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000
    });
    console.log('✅ MongoDB Atlas Connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    console.log('⚠️ Waiting for database connection...');
    // Retry connection after 5 seconds
    setTimeout(connectDB, 5000);
  }
};
connectDB();

// Middleware
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: process.env.MAX_FILE_SIZE || '5mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.MAX_FILE_SIZE || '5mb' }));
app.use(fileUpload({
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5242880 },
  abortOnLimit: true
}));

// Static files
const uploadsDir = path.join(__dirname, process.env.UPLOAD_PATH || 'uploads');
const fs = require('fs');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Created uploads directory');
}
app.use('/uploads', express.static(uploadsDir));

// Apply rate limiting to API routes
app.use('/api/', limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rider', riderRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/rider-verification', riderVerificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/bids', bidRoutes);
// Add this after the middleware section (around line 200-210)
// ========== ROOT ENDPOINT ==========
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'CristRide Ride Sharing API is working!',
    version: '1.0.0',
    status: 'operational',
    endpoints: {
      api: '/api',
      health: '/api/health',
      test: '/api/test',
      serverInfo: '/api/server-info'
    },
    documentation: 'See /api/health for system status',
    timestamp: new Date().toISOString()
  });
});
// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'OK',
    timestamp: new Date(),
    uptime: process.uptime(),
    environment: NODE_ENV,
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    activeConnections: io.engine?.clientsCount || 0,
    activeRiders: riderSockets.size,
    activePassengers: passengerSockets.size
  });
});

// Server info endpoint
app.get('/api/server-info', (req, res) => {
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  const ips = [];
  
  for (const [name, interfaces] of Object.entries(networkInterfaces)) {
    for (const iface of interfaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ interface: name, address: iface.address });
      }
    }
  }
  
  res.json({
    success: true,
    server: {
      name: 'CristRide Ride Sharing Server',
      version: '1.0.0',
      environment: NODE_ENV,
      port: PORT,
      apiUrl: `http://${ips[0]?.address || 'localhost'}:${PORT}/api`,
      socketUrl: `http://${ips[0]?.address || 'localhost'}:${PORT}`,
      wsUrl: `ws://${ips[0]?.address || 'localhost'}:${PORT}`
    },
    network: {
      availableIPs: ips
    },
    status: {
      mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      activeConnections: io.engine?.clientsCount || 0,
      activeRiders: riderSockets.size,
      activePassengers: passengerSockets.size,
      storedLocations: userLocations.size
    }
  });
});

// Get all active locations
app.get('/api/admin/locations', (req, res) => {
  const locations = Array.from(userLocations.values());
  res.json({
    success: true,
    count: locations.length,
    locations: locations.map(loc => ({
      userId: loc.userId,
      userName: loc.userName,
      userType: loc.userType,
      lat: loc.lat,
      lng: loc.lng,
      speed: loc.speed,
      timestamp: loc.timestamp,
      isLive: loc.isLive
    }))
  });
});

// Get rider's all rides
app.get('/api/rides/rider/:riderId', async (req, res) => {
  try {
    const { riderId } = req.params;
    const rides = await Ride.find({ riderId })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ success: true, rides });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Server is running!',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: `Route ${req.originalUrl} not found` 
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  res.status(err.status || 500).json({ 
    success: false, 
    message: err.message || 'Internal server error' 
  });
});

// ========== SOCKET.IO CONNECTION HANDLING ==========
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const createNotification = async (userId, userType, title, message, type, data = {}) => {
  try {
    const notification = new Notification({
      userId,
      userType,
      title,
      message,
      type,
      data,
      createdAt: new Date()
    });
    await notification.save();
    const room = `${userType}_${userId}`;
    io.to(room).emit('new-notification', notification);
    return notification;
  } catch (error) {
    console.error('Create notification error:', error);
    return null;
  }
};

io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);
  
  if (DEBUG) {
    console.log('📡 Total clients:', io.engine.clientsCount);
  }
  
  // Log all events for debugging
  if (DEBUG) {
    socket.onAny((event, ...args) => {
      if (event.includes('location') || event.includes('admin') || event.includes('register')) {
        console.log(`📡 Event: ${event}`, args[0]?.userId || args[0]?.userName || '');
      }
    });
  }
  
  // ========== USER REGISTRATION ==========
  socket.on('register-user', async (data) => {
    try {
      const { userId, userName, userType } = data;
      activeUsers.set(userId, socket.id);
      
      if (userType === 'rider') {
        riderSockets.set(userId, socket.id);
        await User.findByIdAndUpdate(userId, {
          'riderDetails.isOnline': true,
          'riderDetails.socketId': socket.id,
          lastActive: new Date()
        }).catch(err => console.log('Rider update error:', err.message));
        console.log(`✅ Rider registered: ${userName} (${userId})`);
      } else if (userType === 'passenger') {
        passengerSockets.set(userId, socket.id);
        console.log(`✅ Passenger registered: ${userName} (${userId})`);
      } else {
        console.log(`✅ User registered: ${userId} (${userType}) - ${userName}`);
      }
      
      socket.join(`${userType}_${userId}`);
      socket.emit('registered', { success: true, userType });
      
    } catch (error) {
      console.error('Registration error:', error.message);
      socket.emit('registered', { success: true, warning: 'Partial registration' });
    }
  });
  
  // ========== ADMIN REGISTRATION ==========
  socket.on('admin:register', () => {
    console.log('👑 Admin registered:', socket.id);
    
    // Send all current locations to the admin
    const allLocations = Array.from(userLocations.values());
    socket.emit('admin:locations', allLocations);
    console.log(`📡 Sent ${allLocations.length} locations to admin`);
    
    // Store as admin
    activeUsers.set('admin_' + socket.id, {
      socketId: socket.id,
      userId: 'admin',
      userName: 'Admin',
      userType: 'admin',
      connectedAt: new Date()
    });
  });
  
  // ========== LOCATION UPDATE ==========
  socket.on('user:location', (data) => {
    if (DEBUG) {
      console.log(`📍 Location update: ${data.userName} (${data.userType}), Lat: ${data.lat}, Lng: ${data.lng}`);
    }
    
    const { userId, userName, userType, lat, lng, speed, timestamp } = data;
    
    userLocations.set(userId, { 
      userId,
      userName, 
      userType, 
      lat, 
      lng, 
      speed: speed || 0,
      timestamp: timestamp || new Date().toISOString(),
      isLive: true,
      lastUpdate: new Date()
    });
    
    io.emit('user:location-updated', { 
      userId, 
      userName, 
      userType, 
      lat, 
      lng,
      speed: speed || 0,
      timestamp: new Date()
    });
    
    const allLocations = Array.from(userLocations.values());
    io.emit('admin:locations', allLocations);
  });
  
  // ========== GET LOCATIONS REQUEST ==========
  socket.on('get-locations', () => {
    const allLocations = Array.from(userLocations.values());
    socket.emit('admin:locations', allLocations);
    console.log(`📡 Sent ${allLocations.length} locations to client`);
  });
  
  // ========== PASSENGER REQUESTS RIDE ==========
  socket.on('passenger:request-ride', async (data) => {
    try {
      console.log(`🚕 Ride requested by ${data.passengerName}`);
      
      const {
        passengerId, passengerName, pickupLocation, dropoffLocation,
        distance, duration, fare, vehicleType, rideId
      } = data;
      
      let ride;
      if (rideId) {
        ride = await Ride.findById(rideId);
        if (ride) {
          ride.status = 'searching';
          await ride.save();
        }
      } else {
        ride = new Ride({
          passengerId,
          passengerName,
          pickupLocation,
          dropoffLocation,
          distance: parseFloat(distance),
          duration,
          fare: parseFloat(fare),
          vehicleType: vehicleType || 'car',
          status: 'searching',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        });
        await ride.save();
        console.log(`✅ New ride saved: ${ride._id}`);
      }
      
      await createNotification(
        passengerId, 'passenger', 'Ride Requested',
        `Your ride request to ${dropoffLocation.address} has been submitted`,
        'ride_request', { rideId: ride._id }
      );
      
      socket.emit('ride:requested', { success: true, rideId: ride._id, ride });
      
      const broadcastData = {
        rideId: ride._id,
        passengerId,
        passengerName,
        pickupLocation,
        dropoffLocation,
        distance: ride.distance,
        duration: ride.duration,
        fare: ride.fare,
        vehicleType: ride.vehicleType,
        timestamp: new Date()
      };
      
      for (const [riderId, socketId] of riderSockets) {
        io.to(socketId).emit('new-ride-request', broadcastData);
      }
      
      io.emit('new-ride-request', broadcastData);
      
    } catch (error) {
      console.error('❌ Ride request error:', error);
      socket.emit('error', { message: 'Failed to request ride' });
    }
  });
  
  // ========== RIDER ACCEPTS RIDE ==========
  socket.on('rider:accept-ride', async (data) => {
    try {
      const { rideId, riderId, riderName, amount } = data;
      
      const ride = await Ride.findById(rideId);
      if (!ride || ride.status !== 'searching') {
        socket.emit('error', { message: 'Ride not available' });
        return;
      }
      
      ride.status = 'accepted';
      ride.riderId = riderId;
      ride.riderName = riderName;
      if (amount) ride.fare = amount;
      await ride.save();
      
      await createNotification(
        ride.passengerId, 'passenger', 'Ride Accepted',
        `${riderName} has accepted your ride!`,
        'ride_accepted', { rideId, riderId, riderName, fare: ride.fare }
      );
      
      io.to(`passenger_${ride.passengerId}`).emit('ride:accepted-by-rider', {
        rideId,
        riderId,
        riderName,
        fare: ride.fare,
        pickupLocation: ride.pickupLocation,
        dropoffLocation: ride.dropoffLocation
      });
      
      socket.emit('ride:accepted', { success: true, rideId });
      socket.broadcast.emit('ride:taken', { rideId });
      
    } catch (error) {
      console.error('Accept ride error:', error);
    }
  });
  
  // ========== RIDER PLACES BID ==========
  socket.on('rider:place-bid', async (data) => {
    try {
      const { rideId, riderId, riderName, amount, message } = data;
      
      const ride = await Ride.findById(rideId);
      if (!ride || ride.status !== 'searching') {
        socket.emit('error', { message: 'Ride not available' });
        return;
      }
      
      const existingBid = ride.bids.find(b => b.riderId === riderId);
      if (existingBid) {
        socket.emit('error', { message: 'Already placed a bid' });
        return;
      }
      
      ride.bids.push({
        riderId,
        riderName,
        amount,
        message: message || 'I can take this ride',
        status: 'pending',
        createdAt: new Date()
      });
      await ride.save();
      
      await createNotification(
        ride.passengerId, 'passenger', 'New Bid Received',
        `${riderName} placed a bid of ₨${amount}`,
        'bid_placed', { rideId, riderId, riderName, amount }
      );
      
      io.to(`passenger_${ride.passengerId}`).emit('new-bid', {
        rideId,
        bid: { riderId, riderName, amount, message }
      });
      
      socket.emit('bid:placed', { success: true });
      
    } catch (error) {
      console.error('Place bid error:', error);
    }
  });
  
  // ========== PASSENGER ACCEPTS BID ==========
  socket.on('passenger:accept-bid', async (data) => {
    try {
      const { rideId, bidId, riderId, amount } = data;
      
      const ride = await Ride.findById(rideId);
      if (!ride) return;
      
      ride.bids.forEach(bid => {
        bid.status = bid._id.toString() === bidId ? 'accepted' : 'rejected';
      });
      
      ride.status = 'accepted';
      ride.riderId = riderId;
      const acceptedBid = ride.bids.find(b => b._id.toString() === bidId);
      ride.riderName = acceptedBid.riderName;
      ride.fare = amount;
      await ride.save();
      
      await createNotification(
        riderId, 'rider', 'Bid Accepted!',
        `Your bid of ₨${amount} has been accepted`,
        'bid_accepted', { rideId, amount }
      );
      
      io.to(`rider_${riderId}`).emit('bid:accepted', {
        rideId,
        amount,
        passengerName: ride.passengerName
      });
      
      io.to(`passenger_${ride.passengerId}`).emit('ride:accepted-by-rider', {
        rideId,
        riderId,
        riderName: ride.riderName,
        fare: amount
      });
      
    } catch (error) {
      console.error('Accept bid error:', error);
    }
  });
  
  // ========== COMPLETE RIDE ==========
  socket.on('ride:complete', async (data) => {
    try {
      const { rideId, fare, distance, duration } = data;
      
      const ride = await Ride.findById(rideId);
      if (!ride) return;
      
      ride.status = 'completed';
      ride.completedAt = new Date();
      if (fare) ride.fare = fare;
      await ride.save();
      
      await createNotification(
        ride.passengerId, 'passenger', 'Ride Completed',
        `Your ride is complete. Fare: ₨${ride.fare}`,
        'ride_completed', { rideId, fare: ride.fare }
      );
      
      io.to(`passenger_${ride.passengerId}`).emit('ride:completed', {
        rideId,
        fare: ride.fare,
        distance,
        duration
      });
      
    } catch (error) {
      console.error('Complete ride error:', error);
    }
  });
  
  // ========== CANCEL RIDE ==========
  socket.on('ride:cancel', async (data) => {
    try {
      const { rideId, reason, cancelledBy } = data;
      
      const ride = await Ride.findById(rideId);
      if (!ride) return;
      
      ride.status = 'cancelled';
      ride.cancellationReason = reason;
      ride.cancelledBy = cancelledBy;
      await ride.save();
      
      if (cancelledBy === 'passenger' && ride.riderId) {
        io.to(`rider_${ride.riderId}`).emit('ride:cancelled', { rideId, reason });
      } else if (cancelledBy === 'rider') {
        io.to(`passenger_${ride.passengerId}`).emit('ride:cancelled', { rideId, reason });
      }
      
    } catch (error) {
      console.error('Cancel ride error:', error);
    }
  });
  
  // ========== DISCONNECT ==========
  socket.on('disconnect', async () => {
    console.log('🔌 Client disconnected:', socket.id);
    
    for (const [userId, socketId] of activeUsers.entries()) {
      if (socketId === socket.id) {
        activeUsers.delete(userId);
        riderSockets.delete(userId);
        passengerSockets.delete(userId);
        
        const location = userLocations.get(userId);
        if (location) {
          location.isLive = false;
          userLocations.set(userId, location);
          io.emit('user:location-updated', { ...location, isLive: false });
        }
        
        if (userId !== 'admin' && !userId.startsWith('admin_')) {
          await User.findByIdAndUpdate(userId, {
            'riderDetails.isOnline': false,
            'riderDetails.socketId': null
          }).catch(err => console.log('Update error:', err.message));
        }
        break;
      }
    }
    
    if (DEBUG) {
      console.log(`📡 Remaining clients: ${io.engine.clientsCount}`);
    }
  });
});

// Start server
const startServer = () => {
  server.listen(PORT, '0.0.0.0', () => {
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    let localIP = 'localhost';
    
    for (const [name, interfaces] of Object.entries(networkInterfaces)) {
      for (const iface of interfaces) {
        if (iface.family === 'IPv4' && !iface.internal && name !== 'lo0') {
          localIP = iface.address;
          break;
        }
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 CRISTRIDE RIDE SHARING SERVER STARTED`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📡 Environment:     ${NODE_ENV}`);
    console.log(`📡 Port:            ${PORT}`);
    console.log(`📡 Local Access:    http://localhost:${PORT}`);
    console.log(`📡 Network Access:  http://${localIP}:${PORT}`);
    console.log(`🔌 WebSocket URL:   ws://${localIP}:${PORT}`);
    console.log(`📧 Email Service:   ${emailTransporter ? '✅ Configured' : '⚠️ Not configured'}`);
    console.log(`🗄️  MongoDB Atlas:  ${mongoose.connection.readyState === 1 ? '✅ Connected' : '⚠️ Not Connected'}`);
    console.log(`👥 Active Users:    ${activeUsers.size}`);
    console.log(`🏍️ Online Riders:   ${riderSockets.size}`);
    console.log(`👤 Online Passengers: ${passengerSockets.size}`);
    console.log(`📍 Stored Locations: ${userLocations.size}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\n📱 CONNECTION INSTRUCTIONS:`);
    console.log(`  API URL:    http://${localIP}:${PORT}/api`);
    console.log(`  Socket URL: http://${localIP}:${PORT}`);
    console.log(`\n📍 Location Sharing:`);
    console.log(`  Riders send location via: user:location`);
    console.log(`  Passengers send location via: user:location`);
    console.log(`  Admin receives via: admin:locations`);
    console.log(`${'='.repeat(60)}\n`);
  });
};

startServer();

module.exports = { app, server, io, activeUsers, riderSockets, passengerSockets, userLocations };