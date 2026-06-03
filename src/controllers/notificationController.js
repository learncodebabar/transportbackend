const Notification = require('../models/Notification');
const User = require('../models/User');

// Create notification
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
    
    console.log(`📬 Notification created for ${userType} ${userId}: ${title}`);
    
    // Get socket.io instance and emit real-time notification
    const io = global.io;
    if (io) {
      // Fix: Use the correct room name (userType_userId)
      const room = `${userType}_${userId}`;
      io.to(room).emit('new-notification', notification);
      console.log(`📢 Notification emitted to room: ${room}`);
    }
    
    return notification;
  } catch (error) {
    console.error('Create notification error:', error);
    return null;
  }
};

// Get user notifications
const getNotifications = async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;
    
    const notifications = await Notification.find({ 
      userId: req.user._id.toString() 
    }).sort({ createdAt: -1 }).limit(parseInt(limit)).skip((parseInt(page) - 1) * parseInt(limit));
    
    // Get unread count
    const unreadCount = await Notification.countDocuments({ 
      userId: req.user._id.toString(), 
      isRead: false 
    });
    
    const total = await Notification.countDocuments({ userId: req.user._id.toString() });
    
    res.json({
      success: true,
      notifications,
      unreadCount,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Mark notification as read
const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId: req.user._id.toString() },
      { isRead: true },
      { new: true }
    );
    
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    
    res.json({ success: true, message: 'Notification marked as read', notification });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Mark all as read
const markAllAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { userId: req.user._id.toString(), isRead: false },
      { isRead: true }
    );
    res.json({ 
      success: true, 
      message: 'All notifications marked as read',
      count: result.modifiedCount 
    });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete notification
const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      userId: req.user._id.toString()
    });
    
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    
    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};