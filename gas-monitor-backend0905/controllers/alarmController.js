const Alarm = require('../models/alarmModel'); // Model pointing to oxygen_monitor DB
const Device = require('../models/Device');
const mongoose = require('mongoose');
const { getTelemetryDB } = require('../config/db');

console.log("🔄 Alarm controller initialized");

// Get all alarms
exports.getAllAlarms = async (req, res) => {
  try {
    console.log('📋 Fetching all alarms from MongoDB...');
    
    // Get direct connection to the database to query the collection directly
    const telemetryDB = getTelemetryDB();
    
    if (!telemetryDB) {
      console.error('❌ Telemetry database connection not available');
      return res.status(500).json({ message: 'Database connection not available' });
    }
    
    // Access the alarms collection directly
    const alarmsCollection = telemetryDB.collection('alarms');
    
    // Count total alarms for logging
    const totalCount = await alarmsCollection.countDocuments({});
    console.log(`📊 Total alarms in MongoDB: ${totalCount}`);
    
    // Fetch alarms with direct MongoDB query
    // Using the native MongoDB driver for more reliable querying
    const alarms = await alarmsCollection.find({})
      .sort({ CreatedTimestamp: -1 })
      .limit(100) // Limit to most recent 100 for performance
      .toArray();
    
    console.log(`✅ Successfully fetched ${alarms.length} alarms from MongoDB`);
    
    if (alarms.length === 0) {
      console.log('⚠️ No alarms found in the "alarms" collection. Let\'s check for alternative collection names...');
      
      // Check all available collections in the database
      const collections = await telemetryDB.db.listCollections().toArray();
      console.log('📑 Available collections:', collections.map(c => c.name).join(', '));
      
      // If we have collections but no alarms, there might be a case-sensitivity issue
      const alarmsCollections = collections.filter(c => 
        c.name.toLowerCase().includes('alarm') || c.name.toLowerCase() === 'alarms'
      );
      
      if (alarmsCollections.length > 0) {
        console.log('🔍 Found potential alarms collections:', alarmsCollections.map(c => c.name).join(', '));
        
        // Try the first matching collection
        const alternativeCollectionName = alarmsCollections[0].name;
        console.log(`🔄 Trying alternative collection: ${alternativeCollectionName}`);
        
        const alternativeCollection = telemetryDB.collection(alternativeCollectionName);
        const alternativeAlarms = await alternativeCollection.find({})
          .sort({ CreatedTimestamp: -1 })
          .limit(100)
          .toArray();
        
        if (alternativeAlarms.length > 0) {
          console.log(`✅ Successfully fetched ${alternativeAlarms.length} alarms from alternative collection`);
          
          // Normalize these alarms
          const normalizedAlarms = alternativeAlarms.map(normalizeAlarmObject);
          return res.status(200).json(normalizedAlarms);
        }
      }
    }
    
    // Normalize field names to ensure consistent API response format
    const normalizedAlarms = alarms.map(normalizeAlarmObject);
    
    res.status(200).json(normalizedAlarms);
  } catch (error) {
    console.error('❌ Error fetching alarms:', error);
    res.status(500).json({ message: 'Failed to fetch alarms from MongoDB: ' + error.message });
  }
};

// Helper function to normalize alarm objects
function normalizeAlarmObject(alarm) {
  return {
    _id: alarm._id || `alarm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    AlarmId: alarm.AlarmId || alarm.alarmId || '',
    AlarmCode: alarm.AlarmCode || alarm.alarmCode || '',
    AlarmDescription: alarm.AlarmDescription || alarm.alarmDescription || alarm.description || '',
    CreatedTimestamp: alarm.CreatedTimestamp || alarm.createdTimestamp || alarm.timestamp || new Date(),
    DeviceId: alarm.DeviceId || alarm.deviceId || '',
    DeviceName: alarm.DeviceName || alarm.deviceName || '',
    PlantName: alarm.PlantName || alarm.plantName || '',
    IsActive: typeof alarm.IsActive !== 'undefined' ? alarm.IsActive : 
              typeof alarm.isActive !== 'undefined' ? alarm.isActive : true,
    IsRead: typeof alarm.IsRead !== 'undefined' ? alarm.IsRead : 
            typeof alarm.isRead !== 'undefined' ? alarm.isRead : false
  };
}

// Get alarms by device ID
exports.getAlarmsByDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    if (!deviceId) {
      return res.status(400).json({ message: 'Device ID is required' });
    }
    
    console.log(`📋 Fetching alarms for device ${deviceId} from MongoDB...`);
    
    // Get direct connection to the database to query the collection directly
    const telemetryDB = getTelemetryDB();
    
    if (!telemetryDB) {
      console.error('❌ Telemetry database connection not available');
      return res.status(500).json({ message: 'Database connection not available' });
    }
    
    // Access the alarms collection directly
    const alarmsCollection = telemetryDB.collection('alarms');
    
    // Construct query to match the device ID in multiple fields
    // This handles different field naming conventions in the actual data
    const query = {
      $or: [
        { DeviceId: deviceId }, // Number format
        { DeviceId: Number(deviceId) }, // Try as number if it's a string with numbers
        { deviceId: deviceId },
        { deviceId: Number(deviceId) },
        { DeviceName: { $regex: deviceId, $options: 'i' } }, // Case-insensitive match on DeviceName
        { deviceName: { $regex: deviceId, $options: 'i' } },
        { DeviceData: { $regex: deviceId, $options: 'i' } } // Search inside JSON string DeviceData
      ]
    };
    
    // Count matching alarms for this device
    const matchCount = await alarmsCollection.countDocuments(query);
    console.log(`📊 Found ${matchCount} alarms matching device ${deviceId}`);
    
    // Fetch alarms with direct MongoDB query
    const alarms = await alarmsCollection.find(query)
      .sort({ CreatedTimestamp: -1 })
      .limit(100) // Limit to most recent 100 for performance
      .toArray();
    
    console.log(`✅ Successfully fetched ${alarms.length} alarms for device ${deviceId}`);
    
    if (alarms.length === 0) {
      console.log(`⚠️ No alarms found for device ${deviceId} in the "alarms" collection. Checking for alternative collections...`);
      
      // Check all available collections in the database
      const collections = await telemetryDB.db.listCollections().toArray();
      
      // If we have collections but no alarms, try alternative collections
      const alarmsCollections = collections.filter(c => 
        c.name.toLowerCase().includes('alarm') || c.name.toLowerCase() === 'alarms'
      );
      
      if (alarmsCollections.length > 0) {
        // Try the first matching collection
        const alternativeCollectionName = alarmsCollections[0].name;
        console.log(`🔄 Trying alternative collection: ${alternativeCollectionName}`);
        
        const alternativeCollection = telemetryDB.collection(alternativeCollectionName);
        const alternativeAlarms = await alternativeCollection.find(query)
          .sort({ CreatedTimestamp: -1 })
          .limit(100)
          .toArray();
        
        if (alternativeAlarms.length > 0) {
          console.log(`✅ Found ${alternativeAlarms.length} alarms for device ${deviceId} in alternative collection`);
          
          // Normalize these alarms 
          const normalizedAlarms = alternativeAlarms.map(alarm => normalizeAlarmObject(alarm, deviceId));
          return res.status(200).json(normalizedAlarms);
        }
      }
    }
    
    // Normalize field names with additional deviceId context
    const normalizedAlarms = alarms.map(alarm => normalizeAlarmObject(alarm, deviceId));
    
    res.status(200).json(normalizedAlarms);
  } catch (error) {
    console.error(`❌ Error fetching alarms for device ${req.params.deviceId}:`, error);
    res.status(500).json({ message: `Failed to fetch device alarms from MongoDB: ${error.message}` });
  }
};

// Get alarms by plant name and device name (new endpoint)
exports.getAlarmsByPlantAndDevice = async (req, res) => {
  try {
    const { plantName, deviceName } = req.query;
    
    if (!plantName) {
      return res.status(400).json({ 
        message: 'Plant name is required as a query parameter',
        alarms: []
      });
    }
    
    console.log(`📋 Fetching alarms for plant "${plantName}"${deviceName ? ` and device "${deviceName}"` : ''} from MongoDB...`);
    
    // Get direct connection to the database to query the collection directly
    const telemetryDB = getTelemetryDB();
    
    if (!telemetryDB) {
      console.error('❌ Telemetry database connection not available');
      return res.status(500).json({ 
        message: 'Database connection not available',
        alarms: [] 
      });
    }
    
    // Access the alarms collection directly
    const alarmsCollection = telemetryDB.collection('alarms');
    
    // Escape special regex characters in plant and device names
    const escapedPlantName = plantName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Build query object with required plantName match (case-insensitive with more flexible matching)
    const query = {
      $or: [
        { PlantName: { $regex: escapedPlantName, $options: 'i' } },
        { plantName: { $regex: escapedPlantName, $options: 'i' } }
      ]
    };
    
    console.log(`Using plant name regex match: ${escapedPlantName}`);
    
    // Add deviceName to query if provided (case-insensitive with more flexible matching)
    if (deviceName) {
      const escapedDeviceName = deviceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      console.log(`Using device name regex match: ${escapedDeviceName}`);
      query.$and = [{
        $or: [
          { DeviceName: { $regex: escapedDeviceName, $options: 'i' } },
          { deviceName: { $regex: escapedDeviceName, $options: 'i' } }
        ]
      }];
    }
    
    // Count matching alarms for this query
    const matchCount = await alarmsCollection.countDocuments(query);
    console.log(`📊 Found ${matchCount} alarms matching query: ${JSON.stringify(query)}`);
    
    // Fetch alarms with direct MongoDB query
    const alarms = await alarmsCollection.find(query)
      .sort({ CreatedTimestamp: -1 })
      .limit(100) // Limit to most recent 100 for performance
      .toArray();
    
    console.log(`✅ Successfully fetched ${alarms.length} alarms for plant "${plantName}"${deviceName ? ` and device "${deviceName}"` : ''}`);
    
    // If no alarms found, return empty array with appropriate message
    if (alarms.length === 0) {
      console.log(`⚠️ No alarms found for plant "${plantName}"${deviceName ? ` and device "${deviceName}"` : ''}`);
      
      return res.status(200).json({
        message: `No alarms found for the selected plant${deviceName ? ' and device' : ''}`,
        alarms: []
      });
    }
    
    // Normalize field names to ensure consistent API response format
    const normalizedAlarms = alarms.map(alarm => normalizeAlarmObject(alarm));
    
    // Return HTTP 200 with alarms array
    res.status(200).json({
      message: 'Alarms retrieved successfully',
      alarms: normalizedAlarms
    });
  } catch (error) {
    console.error(`❌ Error fetching alarms by plant and device:`, error);
    res.status(500).json({ 
      message: `Failed to fetch alarms from MongoDB: ${error.message}`,
      alarms: []
    });
  }
};

// Extended helper function to normalize alarm objects with device context
function normalizeAlarmObject(alarm, contextDeviceId = null) {
  return {
    _id: alarm._id || `alarm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    AlarmId: alarm.AlarmId || alarm.alarmId || '',
    AlarmCode: alarm.AlarmCode || alarm.alarmCode || '',
    AlarmDescription: alarm.AlarmDescription || alarm.alarmDescription || alarm.description || '',
    CreatedTimestamp: alarm.CreatedTimestamp || alarm.createdTimestamp || alarm.timestamp || new Date(),
    DeviceId: alarm.DeviceId || alarm.deviceId || contextDeviceId || '',
    DeviceName: alarm.DeviceName || alarm.deviceName || '',
    PlantName: alarm.PlantName || alarm.plantName || '',
    IsActive: typeof alarm.IsActive !== 'undefined' ? alarm.IsActive : 
              typeof alarm.isActive !== 'undefined' ? alarm.isActive : true,
    IsRead: typeof alarm.IsRead !== 'undefined' ? alarm.IsRead : 
            typeof alarm.isRead !== 'undefined' ? alarm.isRead : false
  };
}

// Get unread alarms count
exports.getUnreadAlarmsCount = async (req, res) => {
  try {
    console.log('📋 Fetching unread alarms count from MongoDB...');

    // Get direct connection to the database
    const telemetryDB = getTelemetryDB();
    
    if (!telemetryDB) {
      console.error('❌ Telemetry database connection not available');
      return res.status(500).json({ message: 'Database connection not available' });
    }
    
    // Access the alarms collection directly
    const alarmsCollection = telemetryDB.collection('alarms');
    
    // Count unread alarms
    const count = await alarmsCollection.countDocuments({ IsRead: false });
    console.log(`✅ Found ${count} unread alarms`);
    
    // If no unread alarms found via IsRead, try isRead (lowercase) as well
    if (count === 0) {
      const lowercaseCount = await alarmsCollection.countDocuments({ isRead: false });
      console.log(`🔍 Checked with lowercase field name: found ${lowercaseCount} unread alarms`);
      
      if (lowercaseCount > 0) {
        return res.status(200).json({ count: lowercaseCount });
      }
    }
    
    res.status(200).json({ count });
  } catch (error) {
    console.error('❌ Error fetching unread alarms count:', error);
    res.status(500).json({ message: `Failed to fetch unread alarms count: ${error.message}` });
  }
};

// Mark alarm as read
exports.markAlarmAsRead = async (req, res) => {
  try {
    const { alarmId } = req.params;
    
    if (!alarmId) {
      return res.status(400).json({ message: 'Alarm ID is required' });
    }
    
    console.log(`📋 Marking alarm ${alarmId} as read...`);
    
    // Get direct connection to the database
    const telemetryDB = getTelemetryDB();
    
    if (!telemetryDB) {
      console.error('❌ Telemetry database connection not available');
      return res.status(500).json({ message: 'Database connection not available' });
    }
    
    // Access the alarms collection directly
    const alarmsCollection = telemetryDB.collection('alarms');
    
    // Try to convert alarmId to ObjectId if it's a string
    let objectId;
    try {
      if (mongoose.Types.ObjectId.isValid(alarmId)) {
        objectId = new mongoose.Types.ObjectId(alarmId);
      }
    } catch (err) {
      console.log(`Not a valid ObjectId: ${alarmId}, using as-is`);
    }
    
    // Create a query that will match either an ObjectId or a string ID
    const query = objectId ? { _id: objectId } : { _id: alarmId };
    
    // First attempt with IsRead (uppercase)
    const result = await alarmsCollection.updateOne(
      query,
      { $set: { IsRead: true } }
    );
    
    // If no update occurred, try with lowercase field name
    if (result.matchedCount === 0) {
      console.log('🔍 Alarm not found with primary ID, trying alternative approaches...');
      
      // Try querying by AlarmId field
      const altResult = await alarmsCollection.updateOne(
        { AlarmId: alarmId },
        { $set: { IsRead: true, isRead: true } } // Update both field variants
      );
      
      if (altResult.matchedCount === 0) {
        return res.status(404).json({ message: 'Alarm not found' });
      }
      
      // Find and return the updated alarm
      const updatedAlarmDoc = await alarmsCollection.findOne({ AlarmId: alarmId });
      if (updatedAlarmDoc) {
        console.log(`✅ Successfully marked alarm as read (via AlarmId)`);
        const normalizedAlarm = normalizeAlarmObject(updatedAlarmDoc);
        return res.status(200).json(normalizedAlarm);
      }
    } else {
      // Find and return the updated alarm
      const updatedAlarmDoc = await alarmsCollection.findOne(query);
      if (updatedAlarmDoc) {
        console.log(`✅ Successfully marked alarm as read`);
        const normalizedAlarm = normalizeAlarmObject(updatedAlarmDoc);
        return res.status(200).json(normalizedAlarm);
      }
    }

    // If we reach here, something unexpected happened
    return res.status(200).json({ message: 'Alarm marked as read, but could not retrieve updated document' });
  } catch (error) {
    console.error(`❌ Error marking alarm ${req.params.alarmId} as read:`, error);
    res.status(500).json({ message: `Failed to mark alarm as read: ${error.message}` });
  }
};

// Mark all alarms as read
exports.markAllAlarmsAsRead = async (req, res) => {
  try {
    console.log('📋 Marking all alarms as read...');
    
    // Get direct connection to the database
    const telemetryDB = getTelemetryDB();
    
    if (!telemetryDB) {
      console.error('❌ Telemetry database connection not available');
      return res.status(500).json({ message: 'Database connection not available' });
    }
    
    // Access the alarms collection directly
    const alarmsCollection = telemetryDB.collection('alarms');
    
    // Get a count of unread alarms before the update
    const unreadCount = await alarmsCollection.countDocuments({ IsRead: false });
    console.log(`📄 Found ${unreadCount} unread alarms to mark as read`);
    
    // Mark all alarms as read - try both casing versions for maximum compatibility
    const result = await alarmsCollection.updateMany(
      { $or: [{ IsRead: false }, { isRead: false }] },
      { $set: { IsRead: true, isRead: true } } // Update both field variants
    );
    
    console.log(`✅ Successfully marked ${result.modifiedCount} alarms as read`);
    res.status(200).json({ 
      message: 'All alarms marked as read', 
      count: result.modifiedCount 
    });
  } catch (error) {
    console.error('❌ Error marking all alarms as read:', error);
    res.status(500).json({ message: `Failed to mark all alarms as read: ${error.message}` });
  }
};
