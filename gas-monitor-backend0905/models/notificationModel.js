const mongoose = require('mongoose');
const { getTelemetryDB } = require('../config/db');

// This is just a placeholder schema to define the structure
// The actual operations will use direct collection access
const notificationSchema = new mongoose.Schema({
  NotificationId: String,
  Type: {
    type: String,
    enum: ['general', 'alarm'],
    default: 'general'
  },
  Message: String,
  Title: String,
  DeviceId: String,
  DeviceName: String,
  PlantId: String,
  PlantName: String,
  CreatedTimestamp: {
    type: Date,
    default: Date.now
  },
  IsRead: {
    type: Boolean,
    default: false
  },
  Metadata: mongoose.Schema.Types.Mixed // For any additional data
});

console.log('📋 Initializing Notification model to access MongoDB collection');

// This function returns a model that points to the correct collection
// It will wait for the telemetry DB connection to be available
function getNotificationModel() {
  const db = getTelemetryDB();
  
  if (!db) {
    console.warn('⚠️ Telemetry DB connection not yet available - returning placeholder notification model');
    // Return a placeholder model until the real connection is available
    return mongoose.model('Notification', notificationSchema);
  }
  
  // If we have a connection, use it to create a model that points to the 'notifications' collection
  try {
    // Try to get the model if it's already registered
    return db.model('Notification');
  } catch (e) {
    // If not registered, register it now
    return db.model('Notification', notificationSchema, 'notifications');
  }
}

console.log('✅ Notification model initialized');

module.exports = getNotificationModel;
