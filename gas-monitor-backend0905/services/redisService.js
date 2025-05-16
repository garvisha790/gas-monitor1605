/**
 * Redis Service for handling telemetry and alarm data
 * This service provides methods to publish data to Redis channels
 */

const { redisClient } = require('../server');

/**
 * Publish telemetry data to Redis channel
 * @param {Object} telemetryData - Telemetry data to publish
 * @returns {Promise<void>}
 */
const publishTelemetryData = async (telemetryData) => {
  try {
    // Ensure we have a connected Redis client
    if (!redisClient || !redisClient.isOpen) {
      console.error('❌ Redis client not connected when trying to publish telemetry');
      return;
    }

    // Normalize data to ensure consistent format
    const normalizedData = {
      deviceId: telemetryData.deviceId || telemetryData.device || telemetryData.device_id,
      deviceName: telemetryData.deviceName || telemetryData.DeviceName,
      temperature: telemetryData.temperature || telemetryData.Temperature || 0,
      humidity: telemetryData.humidity || telemetryData.Humidity || 0,
      oilLevel: telemetryData.oilLevel || telemetryData.OilLevel || 0,
      timestamp: telemetryData.timestamp || telemetryData.Timestamp || new Date(),
      plantName: telemetryData.plantName || 
                (telemetryData.deviceName?.includes('esp32_04') || 
                 telemetryData.device?.includes('esp32_04') ? 'Plant D' : 'Plant C')
    };

    // Publish to Redis telemetry channel
    await redisClient.publish('telemetry', JSON.stringify(normalizedData));
    console.log(`📡 Published telemetry data to Redis for device: ${normalizedData.deviceName || normalizedData.deviceId}`);
    
    return true;
  } catch (error) {
    console.error('❌ Error publishing telemetry data to Redis:', error);
    return false;
  }
};

/**
 * Publish alarm data to Redis channel
 * @param {Object} alarmData - Alarm data to publish
 * @returns {Promise<void>}
 */
const publishAlarmData = async (alarmData) => {
  try {
    // Ensure we have a connected Redis client
    if (!redisClient || !redisClient.isOpen) {
      console.error('❌ Redis client not connected when trying to publish alarm');
      return;
    }

    // Normalize data to ensure consistent format
    const normalizedData = {
      id: alarmData._id || alarmData.id,
      deviceId: alarmData.deviceId || alarmData.DeviceId,
      deviceName: alarmData.deviceName || alarmData.DeviceName,
      alarmCode: alarmData.alarmCode || alarmData.AlarmCode,
      alarmDescription: alarmData.alarmDescription || alarmData.AlarmDescription,
      alarmValue: alarmData.alarmValue || alarmData.AlarmValue,
      createdTimestamp: alarmData.createdTimestamp || alarmData.CreatedTimestamp || new Date(),
      plantName: alarmData.plantName || alarmData.PlantName ||
                (alarmData.deviceName?.includes('esp32_04') || 
                 alarmData.DeviceName?.includes('esp32_04') ? 'Plant D' : 'Plant C')
    };

    // Publish to Redis alarms channel
    await redisClient.publish('alarms', JSON.stringify(normalizedData));
    console.log(`🚨 Published alarm data to Redis for device: ${normalizedData.deviceName || normalizedData.deviceId}`);
    
    return true;
  } catch (error) {
    console.error('❌ Error publishing alarm data to Redis:', error);
    return false;
  }
};

module.exports = {
  publishTelemetryData,
  publishAlarmData
};
