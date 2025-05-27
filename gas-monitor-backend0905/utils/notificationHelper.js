const { getTelemetryDB } = require('../config/db');
const { redisClient } = require('../server');

/**
 * Creates a notification and publishes it to Redis for real-time updates
 * @param {Object} notificationData - Notification data
 * @param {string} notificationData.Type - Type of notification ('general', 'alarm', 'plant', 'device')
 * @param {string} notificationData.Title - Title of the notification
 * @param {string} notificationData.Message - Message content
 * @param {string} [notificationData.PlantId] - Optional plant ID
 * @param {string} [notificationData.PlantName] - Optional plant name
 * @param {string} [notificationData.DeviceId] - Optional device ID
 * @param {string} [notificationData.DeviceName] - Optional device name
 */
const createNotification = async (notificationData) => {
  try {
    // Ensure required fields
    if (!notificationData.Type || !notificationData.Message) {
      console.error('❌ Missing required notification fields');
      return;
    }

    // Add timestamp and notification ID if not present
    const notification = {
      ...notificationData,
      NotificationId: notificationData.NotificationId || `notification-${Date.now()}`,
      CreatedTimestamp: notificationData.CreatedTimestamp || new Date().toISOString(),
      IsRead: false
    };

    console.log(`📬 Creating notification: ${notification.Type} - ${notification.Title || notification.Message}`);

    // Store in MongoDB
    try {
      const telemetryDB = getTelemetryDB();
      if (telemetryDB) {
        const notificationsCollection = telemetryDB.collection('notifications');
        await notificationsCollection.insertOne(notification);
        console.log('✅ Notification saved to MongoDB');
      } else {
        console.error('❌ Telemetry DB not available for notification storage');
      }
    } catch (dbError) {
      console.error('❌ Error saving notification to MongoDB:', dbError);
    }

    // Publish to Redis for real-time updates
    try {
      if (redisClient && redisClient.isOpen) {
        await redisClient.publish('notifications', JSON.stringify(notification));
        console.log('✅ Notification published to Redis');
      } else {
        console.error('❌ Redis client not available for notification publishing');
      }
    } catch (redisError) {
      console.error('❌ Error publishing notification to Redis:', redisError);
    }

    return notification;
  } catch (error) {
    console.error('❌ Error creating notification:', error);
  }
};

module.exports = {
  createNotification
};
