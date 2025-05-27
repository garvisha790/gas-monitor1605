const getNotificationModel = require('../models/notificationModel');
const mongoose = require('mongoose');
const { getTelemetryDB } = require('../config/db');

console.log("🔄 Notification controller initialized");

// Get all notifications
exports.getAllNotifications = async (req, res) => {
  try {
    console.log('📋 Fetching all notifications from MongoDB...');
    
    // Get direct connection to the database to query the collection directly
    const telemetryDB = getTelemetryDB();
    
    if (!telemetryDB) {
      console.error('❌ Telemetry database connection not available');
      return res.status(500).json({ message: 'Database connection not available' });
    }
    
    // Access the notifications collection directly
    const notificationsCollection = telemetryDB.collection('notifications');
    
    // Parse query parameters
    const type = req.query.type; // 'general' or 'alarm'
    const deviceId = req.query.deviceId;
    const plantId = req.query.plantId;
    
    // Build the query based on provided filters
    const query = {};
    if (type) query.Type = type;
    if (deviceId) query.DeviceId = deviceId;
    if (plantId) query.PlantId = plantId;
    
    // Count total notifications for logging
    const totalCount = await notificationsCollection.countDocuments(query);
    console.log(`📊 Total matching notifications in MongoDB: ${totalCount}`);
    
    // Fetch notifications with direct MongoDB query
    const notifications = await notificationsCollection.find(query)
      .sort({ CreatedTimestamp: -1 })
      .limit(100) // Limit to most recent 100 for performance
      .toArray();
    
    console.log(`✅ Successfully fetched ${notifications.length} notifications from MongoDB`);
    
    // Normalize field names to ensure consistent API response format
    const normalizedNotifications = notifications.map(normalizeNotificationObject);
    
    res.status(200).json(normalizedNotifications);
  } catch (error) {
    console.error('❌ Error fetching notifications:', error);
    res.status(500).json({ message: 'Failed to fetch notifications from MongoDB: ' + error.message });
  }
};

// Helper function to normalize notification objects
function normalizeNotificationObject(notification) {
  return {
    _id: notification._id || `notification-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    NotificationId: notification.NotificationId || notification.notificationId || '',
    Type: notification.Type || notification.type || 'general',
    Message: notification.Message || notification.message || '',
    Title: notification.Title || notification.title || '',
    CreatedTimestamp: notification.CreatedTimestamp || notification.createdTimestamp || notification.timestamp || new Date(),
    DeviceId: notification.DeviceId || notification.deviceId || '',
    DeviceName: notification.DeviceName || notification.deviceName || '',
    PlantId: notification.PlantId || notification.plantId || '',
    PlantName: notification.PlantName || notification.plantName || '',
    IsRead: notification.IsRead || notification.isRead || false,
    Metadata: notification.Metadata || notification.metadata || {}
  };
}

// Get notifications by device ID
exports.getNotificationsByDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;
    console.log(`📋 Fetching notifications for device: ${deviceId}`);
    
    const telemetryDB = getTelemetryDB();
    
    if (!telemetryDB) {
      console.error('❌ Telemetry database connection not available');
      return res.status(500).json({ message: 'Database connection not available' });
    }
    
    const notificationsCollection = telemetryDB.collection('notifications');
    
    const notifications = await notificationsCollection.find({
      DeviceId: deviceId
    })
    .sort({ CreatedTimestamp: -1 })
    .limit(100)
    .toArray();
    
    console.log(`✅ Successfully fetched ${notifications.length} notifications for device ${deviceId}`);
    
    const normalizedNotifications = notifications.map(normalizeNotificationObject);
    res.status(200).json(normalizedNotifications);
  } catch (error) {
    console.error(`❌ Error fetching notifications for device ${req.params.deviceId}:`, error);
    res.status(500).json({ message: 'Failed to fetch notifications: ' + error.message });
  }
};

// Get unread notifications count
exports.getUnreadNotificationsCount = async (req, res) => {
  try {
    console.log('📋 Fetching unread notifications count...');
    
    const telemetryDB = getTelemetryDB();
    
    if (!telemetryDB) {
      console.error('❌ Telemetry database connection not available');
      return res.status(500).json({ message: 'Database connection not available' });
    }
    
    const notificationsCollection = telemetryDB.collection('notifications');
    
    // Parse query parameters for filtering
    const type = req.query.type; // 'general' or 'alarm'
    
    // Build the query based on provided filters
    const query = { IsRead: false }; // Base condition: unread notifications
    if (type) query.Type = type;
    
    const count = await notificationsCollection.countDocuments(query);
    
    console.log(`✅ Successfully fetched unread notifications count: ${count}`);
    res.status(200).json({ count });
  } catch (error) {
    console.error('❌ Error fetching unread notifications count:', error);
    res.status(500).json({ message: 'Failed to fetch unread notifications count: ' + error.message });
  }
};

// Mark notification as read
exports.markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    console.log(`📋 Marking notification as read: ${notificationId}`);
    
    const telemetryDB = getTelemetryDB();
    
    if (!telemetryDB) {
      console.error('❌ Telemetry database connection not available');
      return res.status(500).json({ message: 'Database connection not available' });
    }
    
    const notificationsCollection = telemetryDB.collection('notifications');
    
    // Try to convert notificationId to ObjectId if it's a string
    let objectId;
    try {
      if (mongoose.Types.ObjectId.isValid(notificationId)) {
        objectId = new mongoose.Types.ObjectId(notificationId);
      }
    } catch (err) {
      console.log(`Not a valid ObjectId: ${notificationId}, using as-is`);
    }
    
    // Create a query that will match either an ObjectId or a string ID
    const query = objectId ? { _id: objectId } : { _id: notificationId };
    
    // First attempt with IsRead (uppercase)
    const result = await notificationsCollection.updateOne(
      query,
      { $set: { IsRead: true } }
    );
    
    // If no update occurred, try with alternative approaches
    if (result.matchedCount === 0) {
      console.log('🔍 Notification not found with primary ID, trying alternative approaches...');
      
      // Try querying by NotificationId field
      const altResult = await notificationsCollection.updateOne(
        { NotificationId: notificationId },
        { $set: { IsRead: true, isRead: true } } // Update both field variants
      );
      
      if (altResult.matchedCount === 0) {
        return res.status(404).json({ message: 'Notification not found' });
      }
      
      // Find and return the updated notification
      const updatedNotificationDoc = await notificationsCollection.findOne({ NotificationId: notificationId });
      if (updatedNotificationDoc) {
        console.log(`✅ Successfully marked notification as read (via NotificationId)`);
        const normalizedNotification = normalizeNotificationObject(updatedNotificationDoc);
        return res.status(200).json(normalizedNotification);
      }
    } else {
      // Find and return the updated notification
      const updatedNotificationDoc = await notificationsCollection.findOne(query);
      if (updatedNotificationDoc) {
        console.log(`✅ Successfully marked notification as read`);
        const normalizedNotification = normalizeNotificationObject(updatedNotificationDoc);
        return res.status(200).json(normalizedNotification);
      }
    }

    // If we reach here, something unexpected happened
    return res.status(200).json({ message: 'Notification marked as read, but could not retrieve updated document' });
  } catch (error) {
    console.error(`❌ Error marking notification ${req.params.notificationId} as read:`, error);
    res.status(500).json({ message: `Failed to mark notification as read: ${error.message}` });
  }
};

// Mark all notifications as read
exports.markAllNotificationsAsRead = async (req, res) => {
  try {
    console.log('📋 Marking all notifications as read...');
    
    // Parse query parameters
    const type = req.query.type; // Optional filter by type: 'general' or 'alarm'
    
    const telemetryDB = getTelemetryDB();
    
    if (!telemetryDB) {
      console.error('❌ Telemetry database connection not available');
      return res.status(500).json({ message: 'Database connection not available' });
    }
    
    const notificationsCollection = telemetryDB.collection('notifications');
    
    // Build the query based on provided filters
    const query = { $or: [{ IsRead: false }, { isRead: false }] };
    if (type) query.Type = type;
    
    // Get a count of unread notifications before the update
    const unreadCount = await notificationsCollection.countDocuments(query);
    console.log(`📄 Found ${unreadCount} unread notifications to mark as read`);
    
    // Mark all notifications as read - try both casing versions for maximum compatibility
    const result = await notificationsCollection.updateMany(
      query,
      { $set: { IsRead: true, isRead: true } } // Update both field variants
    );
    
    console.log(`✅ Successfully marked ${result.modifiedCount} notifications as read`);
    res.status(200).json({ 
      message: 'All notifications marked as read', 
      count: result.modifiedCount 
    });
  } catch (error) {
    console.error('❌ Error marking all notifications as read:', error);
    res.status(500).json({ message: `Failed to mark all notifications as read: ${error.message}` });
  }
};
