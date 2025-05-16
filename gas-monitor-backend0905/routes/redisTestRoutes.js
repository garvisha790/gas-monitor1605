const express = require('express');
const router = express.Router();
const { redisClient } = require('../server');

// Test Redis connection
router.get('/connection', async (req, res) => {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return res.status(500).json({ 
        status: 'error',
        message: 'Redis client not connected',
        isConnected: false
      });
    }

    const pingResult = await redisClient.ping();
    console.log('Redis ping result:', pingResult);
    
    res.json({
      status: 'success',
      message: 'Redis connection is active',
      pingResult,
      isConnected: redisClient.isOpen
    });
  } catch (error) {
    console.error('❌ Redis connection test error:', error);
    res.status(500).json({ 
      status: 'error',
      message: error.message,
      isConnected: false
    });
  }
});

// Publish test data to Redis
router.post('/publish', async (req, res) => {
  try {
    const { channel, data } = req.body;
    
    if (!channel || !data) {
      return res.status(400).json({ 
        status: 'error',
        message: 'Both channel and data are required'
      });
    }

    if (!redisClient || !redisClient.isOpen) {
      return res.status(500).json({ 
        status: 'error',
        message: 'Redis client not connected'
      });
    }

    // Publish to Redis channel
    const result = await redisClient.publish(channel, JSON.stringify(data));
    console.log(`Published test data to Redis channel ${channel}, recipients: ${result}`);
    
    res.json({
      status: 'success',
      message: `Published to ${channel}`,
      recipients: result
    });
  } catch (error) {
    console.error('❌ Error publishing test data to Redis:', error);
    res.status(500).json({ 
      status: 'error',
      message: error.message
    });
  }
});

// Get active subscribers for a channel
router.get('/subscribers/:channel', async (req, res) => {
  try {
    const { channel } = req.params;
    
    if (!redisClient || !redisClient.isOpen) {
      return res.status(500).json({ 
        status: 'error',
        message: 'Redis client not connected'
      });
    }

    // In Redis, we can't directly get the number of subscribers
    // But we can publish a message and get the number of clients that received it
    const result = await redisClient.publish(`${channel}:ping`, JSON.stringify({
      type: 'ping',
      timestamp: new Date()
    }));
    
    res.json({
      status: 'success',
      channel,
      subscribers: result
    });
  } catch (error) {
    console.error(`❌ Error getting subscribers for channel ${req.params.channel}:`, error);
    res.status(500).json({ 
      status: 'error',
      message: error.message
    });
  }
});

// Monitor recent data from Redis channels
router.get('/monitor', async (req, res) => {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return res.status(500).json({ 
        status: 'error',
        message: 'Redis client not connected'
      });
    }

    const monitorClient = redisClient.duplicate();
    await monitorClient.connect();

    // Create a Promise that will resolve with the monitoring results
    const monitorPromise = new Promise((resolve, reject) => {
      let commands = [];
      
      const monitor = monitorClient.monitor();
      
      monitor.then(async (monitor) => {
        // Set a timeout to stop monitoring after 5 seconds
        setTimeout(async () => {
          await monitorClient.disconnect();
          resolve(commands);
        }, 5000);
        
        // Listen for Redis commands
        monitor.on('monitor', (time, args) => {
          commands.push({ time, args });
        });
      }).catch(reject);
    });

    // Wait for the monitoring results
    const results = await monitorPromise;
    
    res.json({
      status: 'success',
      message: 'Monitored Redis for 5 seconds',
      commands: results
    });
  } catch (error) {
    console.error('❌ Error monitoring Redis:', error);
    res.status(500).json({ 
      status: 'error',
      message: error.message
    });
  }
});

module.exports = router;
