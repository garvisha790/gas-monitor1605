/**
 * WebSocket Service
 * Provides methods to handle WebSocket connections and events
 */

const { io } = require('../server');
const { getTelemetryDB } = require('../config/db');

/**
 * Initialize WebSocket event handlers
 * @param {Object} io - Socket.IO instance
 */
const initializeWebSocketEvents = () => {
  if (!io) {
    console.error('❌ Socket.IO instance not available');
    return;
  }

  console.log('🔌 Initializing WebSocket event handlers');

  // Handle client connections
  io.on('connection', (socket) => {
    console.log(`🔌 New client connected: ${socket.id}`);

    // Handle device subscription
    socket.on('subscribe', (deviceId) => {
      console.log(`👂 Client ${socket.id} subscribed to device: ${deviceId}`);
      socket.join(`device:${deviceId}`);
      
      // Send latest telemetry data for this device
      sendLatestTelemetryToClient(socket, deviceId);
    });

    // Handle plant subscription
    socket.on('subscribePlant', (plantId) => {
      console.log(`👂 Client ${socket.id} subscribed to plant: ${plantId}`);
      socket.join(`plant:${plantId}`);
      
      // Send latest telemetry data for all devices in this plant
      sendLatestPlantDataToClient(socket, plantId);
    });

    // Handle client disconnection
    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
    });
  });
};

/**
 * Send latest telemetry data to a client for a specific device
 * @param {Object} socket - Socket.IO socket
 * @param {string} deviceId - Device ID
 */
const sendLatestTelemetryToClient = async (socket, deviceId) => {
  try {
    const telemetryDB = getTelemetryDB();
    if (!telemetryDB) {
      console.error('❌ Telemetry database connection not available');
      return;
    }

    // Get telemetry collection
    const collection = telemetryDB.collection('telemetry');

    // Try multiple field name patterns to catch all possibilities
    const query = { 
      $or: [
        { DeviceId: deviceId },
        { deviceId: deviceId },
        { device: deviceId },
        { device_id: deviceId }
      ]
    };

    // Get latest telemetry data
    const latestData = await collection.find(query)
      .sort({ Timestamp: -1, timestamp: -1 })
      .limit(1)
      .toArray();

    if (latestData && latestData.length > 0) {
      // Normalize data format
      const normalizedData = {
        deviceId: deviceId,
        deviceName: latestData[0].DeviceName || latestData[0].deviceName || deviceId,
        temperature: latestData[0].Temperature || latestData[0].temperature || 0,
        humidity: latestData[0].Humidity || latestData[0].humidity || 0,
        oilLevel: latestData[0].OilLevel || latestData[0].oilLevel || 0,
        timestamp: latestData[0].Timestamp || latestData[0].timestamp || new Date()
      };

      // Send to client
      socket.emit('telemetry', normalizedData);
      console.log(`📡 Sent latest telemetry data to client ${socket.id} for device ${deviceId}`);
    }
  } catch (error) {
    console.error(`❌ Error sending latest telemetry data: ${error.message}`);
  }
};

/**
 * Send latest telemetry data to a client for all devices in a plant
 * @param {Object} socket - Socket.IO socket
 * @param {string} plantId - Plant ID
 */
const sendLatestPlantDataToClient = async (socket, plantId) => {
  try {
    // Map plant ID to plant name
    const plantName = plantId === '1' ? 'Plant C' : plantId === '2' ? 'Plant D' : null;
    
    if (!plantName) {
      console.error(`❌ Invalid plant ID: ${plantId}`);
      return;
    }

    const telemetryDB = getTelemetryDB();
    if (!telemetryDB) {
      console.error('❌ Telemetry database connection not available');
      return;
    }

    // Get telemetry collection
    const collection = telemetryDB.collection('telemetry');

    // Find all devices in this plant
    const deviceQuery = { 
      $or: [
        { PlantName: plantName },
        { plantName: plantName }
      ]
    };

    // Get distinct device names in this plant
    const deviceNames = await collection.distinct('DeviceName', deviceQuery);
    const deviceNamesLowerCase = await collection.distinct('deviceName', deviceQuery);
    
    // Combine both lists and remove duplicates
    const allDeviceNames = [...new Set([...deviceNames, ...deviceNamesLowerCase])];

    console.log(`🏭 Found ${allDeviceNames.length} devices in ${plantName}`);

    // Get latest telemetry for each device
    for (const deviceName of allDeviceNames) {
      if (!deviceName) continue;

      const query = { 
        $or: [
          { DeviceName: deviceName },
          { deviceName: deviceName }
        ]
      };

      // Get latest telemetry data
      const latestData = await collection.find(query)
        .sort({ Timestamp: -1, timestamp: -1 })
        .limit(1)
        .toArray();

      if (latestData && latestData.length > 0) {
        // Normalize data format
        const normalizedData = {
          deviceId: deviceName,
          deviceName: deviceName,
          temperature: latestData[0].Temperature || latestData[0].temperature || 0,
          humidity: latestData[0].Humidity || latestData[0].humidity || 0,
          oilLevel: latestData[0].OilLevel || latestData[0].oilLevel || 0,
          timestamp: latestData[0].Timestamp || latestData[0].timestamp || new Date(),
          plantName: plantName
        };

        // Send to client
        socket.emit('telemetry', normalizedData);
        console.log(`📡 Sent latest telemetry data to client ${socket.id} for device ${deviceName}`);
      }
    }
  } catch (error) {
    console.error(`❌ Error sending latest plant data: ${error.message}`);
  }
};

/**
 * Broadcast telemetry data to all subscribed clients
 * @param {Object} telemetryData - Telemetry data
 */
const broadcastTelemetryData = (telemetryData) => {
  if (!io) {
    console.error('❌ Socket.IO instance not available');
    return;
  }

  try {
    const deviceId = telemetryData.deviceId || telemetryData.device;
    const plantId = telemetryData.plantId || 
                   (telemetryData.plantName === 'Plant D' ? '2' : '1');

    // Emit to specific device room
    io.to(`device:${deviceId}`).emit('telemetry', telemetryData);
    
    // Also emit to plant room
    io.to(`plant:${plantId}`).emit('telemetry', telemetryData);
    
    console.log(`📡 Broadcasted telemetry data for device ${deviceId}`);
  } catch (error) {
    console.error(`❌ Error broadcasting telemetry data: ${error.message}`);
  }
};

/**
 * Broadcast alarm data to all subscribed clients
 * @param {Object} alarmData - Alarm data
 */
const broadcastAlarmData = (alarmData) => {
  if (!io) {
    console.error('❌ Socket.IO instance not available');
    return;
  }

  try {
    const deviceId = alarmData.deviceId || alarmData.DeviceId;
    const plantId = alarmData.plantId || 
                   (alarmData.plantName === 'Plant D' ? '2' : '1');

    // Emit to specific device room
    io.to(`device:${deviceId}`).emit('alarm', alarmData);
    
    // Also emit to plant room
    io.to(`plant:${plantId}`).emit('alarm', alarmData);
    
    // Broadcast to all clients for notifications
    io.emit('alarm_notification', {
      id: alarmData._id || alarmData.id,
      deviceId: deviceId,
      deviceName: alarmData.deviceName || alarmData.DeviceName,
      alarmCode: alarmData.alarmCode || alarmData.AlarmCode,
      description: alarmData.alarmDescription || alarmData.AlarmDescription,
      timestamp: alarmData.createdTimestamp || alarmData.CreatedTimestamp || new Date()
    });
    
    console.log(`🚨 Broadcasted alarm data for device ${deviceId}`);
  } catch (error) {
    console.error(`❌ Error broadcasting alarm data: ${error.message}`);
  }
};

module.exports = {
  initializeWebSocketEvents,
  broadcastTelemetryData,
  broadcastAlarmData
};
