const mongoose = require('mongoose');
const { getTelemetryDB } = require('../config/db');

// Define the schema - updated to match the actual MongoDB document structure
// Making fields optional to avoid validation errors with existing data
const alarmSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
  SqlId: { type: Number, required: false },
  AlarmId: { type: Number, required: false },  // Making it optional as it might be missing in some records
  DeviceId: { type: Number, required: false },  // Making it optional as it might be missing in some records
  AlarmValue: String,
  CreatedBy: Number,
  IsActive: { type: Boolean, default: true },
  CreatedTimestamp: { type: Date, default: Date.now },
  TelemetryKeyId: { type: mongoose.Schema.Types.Mixed, required: false },
  AlarmRootCauseId: { type: mongoose.Schema.Types.Mixed, required: false },
  UpdatedBy: Number,
  UpdatedTimestamp: { type: Date, default: Date.now },
  AlarmCode: String,
  AlarmDescription: String,
  DeviceName: String,
  IsRead: { type: Boolean, default: false },
  PlantName: String,
  DeviceData: { type: mongoose.Schema.Types.Mixed, required: false } // Could be String or Object
}, {
  // This is important - tells Mongoose not to enforce strict schema validation
  // which allows for fields in the DB that aren't in the schema
  strict: false,
  // This tells Mongoose not to add __v version key
  versionKey: false
});

// Log that we're initializing the Alarm model
console.log('📋 Initializing Alarm model to access MongoDB collection');

// Create a model using the telemetry database connection (oxygen_monitor)
const getTelemetryModel = () => {
  const telemetryDB = getTelemetryDB();
  
  // If connection isn't ready yet, return a dummy model that will be updated
  if (!telemetryDB) {
    console.warn('⚠️ Telemetry DB connection not yet available - returning placeholder alarm model');
    return mongoose.model('Alarm', alarmSchema);
  }
  
  // Use the telemetry DB connection to create the model
  try {
    console.log('🔍 Attempting to connect to alarms collection in oxygen_monitor database');
    // Match the actual collection name in MongoDB
    // Note: Collection names are case-sensitive in MongoDB
    return telemetryDB.model('Alarm', alarmSchema, 'alarms');
  } catch (error) {
    console.error('❌ Error creating Alarm model:', error);
    // Try one more time with explicit collection name
    return telemetryDB.model('Alarm', alarmSchema, 'alarms');
  }
};

const alarmModel = getTelemetryModel();
console.log('✅ Alarm model initialized');

module.exports = alarmModel;
