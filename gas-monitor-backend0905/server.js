require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const redis = require("redis");

const { connectDB } = require("./config/db");

// Route imports - wait for database before importing
let authRoutes, plantRoutes, deviceRoutes, telemetryRoutes, azureDeviceRoutes, alarmRoutes;

// Redis test routes - can be imported immediately
const redisTestRoutes = require('./routes/redisTestRoutes');

const app = express();

// Apply CORS middleware to Express app
app.use(cors({
  origin: '*',  // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

const server = http.createServer(app);

// Initialize Socket.IO with comprehensive CORS settings for WebSockets
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: false,  // Set to false for simpler cross-origin
    allowedHeaders: ["*"],
    exposedHeaders: ["*"]
  },
  allowEIO3: true,  // Allow Engine.IO 3 compatibility
  transports: ['websocket', 'polling'],
  pingInterval: 10000,  // More frequent pings
  pingTimeout: 5000,
  cookie: false  // Disable cookies for simpler cross-origin
});

// Enable detailed Socket.IO logging
io.engine.on("connection_error", (err) => {
  console.log("Connection error:", err);
});

// Log when Socket.IO server starts
console.log('🔌 Enhanced Socket.IO server configured for cross-origin communication');

// Initialize Redis client with detailed logging
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    reconnectStrategy: (retries) => {
      console.log(`🔴 Redis reconnection attempt: ${retries}`);
      return Math.min(retries * 50, 2000); // Exponential backoff with cap
    }
  }
});

// Add Redis client event listeners for debugging
redisClient.on('connect', () => {
  console.log(`🟢 Redis client connected to ${process.env.REDIS_URL || "redis://localhost:6379"}`);
});

redisClient.on('error', (err) => {
  console.error(`🔴 Redis client error: ${err}`);
});

redisClient.on('end', () => {
  console.log(`🔴 Redis client connection closed`);
});

// Handle Redis connection events
redisClient.on("error", (err) => {
  console.error("❌ Redis Client Error:", err);
});

redisClient.on("connect", () => {
  console.log("✅ Connected to Redis server");
});

redisClient.on("ready", () => {
  console.log("✅ Redis client is ready to use");
});

// Connect to Redis
(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.error("❌ Failed to connect to Redis:", err);
  }
})();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize routes after DB connection
try {
  // Import route handlers
  if (!alarmRoutes) {
    console.log('Attempting to load route modules...');
    try {
      alarmRoutes = require('./routes/alarmRoutes');
      console.log('✅ Alarm routes loaded successfully');
    } catch (err) {
      console.warn('⚠️ Could not load alarm routes:', err.message);
      // Will fall back to the temporary routes defined below
    }
  }
} catch (err) {
  console.error('❌ Error initializing routes:', err);
}

// Check if alarmRoutes is defined
if (!alarmRoutes) {
  console.log('ℹ️ Creating MongoDB-connected alarm routes');
  
  // Create a router for alarms
  const alarmRouter = express.Router();
  
  // Connect to the MongoDB collection directly
  const { MongoClient } = require('mongodb');
  // Use the exact connection string and database name
  const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://garvisha:apphelix@oxygen-monitor.ivkylso.mongodb.net/?retryWrites=true&w=majority&appName=Oxygen-Monitor';
  const dbName = 'oxygen-monitor'; // Exact database name with hyphen
  
  // Function to transform alarm documents to match frontend expectations
  function transformAlarmDocument(doc) {
    if (!doc) return null;
    
    // Log the original document for debugging
    console.log('Original document fields:', Object.keys(doc));
    
    // Create a standardized alarm object
    const transformedDoc = {
      _id: doc._id || doc.id || `alarm-${Date.now()}`,
      AlarmId: doc.AlarmId || doc.alarmId || doc.AlarmCode || '',
      AlarmCode: doc.AlarmCode || doc.alarmCode || '',
      AlarmDescription: doc.AlarmDescription || doc.alarmDescription || '',
      CreatedTimestamp: doc.CreatedTimestamp || doc.createdTimestamp || new Date().toISOString(),
      DeviceId: doc.DeviceId || doc.deviceId || '',
      DeviceName: doc.DeviceName || doc.deviceName || '',
      PlantName: doc.PlantName || doc.plantName || '',
      IsActive: doc.IsActive !== undefined ? doc.IsActive : (doc.isActive !== undefined ? doc.isActive : true),
      IsRead: doc.IsRead !== undefined ? doc.IsRead : (doc.isRead !== undefined ? doc.isRead : false)
    };
    
    console.log('Transformed document fields:', Object.keys(transformedDoc));
    return transformedDoc;
  }
  
  console.log(`🔄 Connecting directly to MongoDB: ${mongoUri} (DB: ${dbName})`);
  
  // MongoDB client for alarm routes - use the direct connection string
  let mongoClient;
  try {
    // Use the full connection string directly
    console.log(`🔌 Connecting to MongoDB Atlas...`);
    
    mongoClient = new MongoClient(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 15000,         // Increase timeout for connection issues
      socketTimeoutMS: 30000,          // Increase timeout for operations
      serverSelectionTimeoutMS: 15000  // Maximum wait time for server selection
    });
  } catch (err) {
    console.error('❌ Error configuring MongoDB client:', err);
    // Fallback to simple connection
    mongoClient = new MongoClient('mongodb://localhost:27017');
  }
  
  // Connect to MongoDB immediately
  (async () => {
    try {
      await mongoClient.connect();
      console.log('✅ Direct MongoDB connection established for alarm routes');
      
      // Verify database and collection existence
      const db = mongoClient.db(dbName);
      const collections = await db.listCollections({ name: 'alarms' }).toArray();
      
      if (collections.length > 0) {
        console.log(`✅ Collection 'alarms' found in database '${dbName}'`);
        
        // Count documents in the collection to verify access
        const alarmsCollection = db.collection('alarms');
        const count = await alarmsCollection.countDocuments({});
        console.log(`📊 Found ${count} total alarms in collection`);
      } else {
        console.error(`❌ Collection 'alarms' NOT found in database '${dbName}'!`);
        console.log('Available collections:');
        const allCollections = await db.listCollections().toArray();
        allCollections.forEach(coll => console.log(`- ${coll.name}`));
      }
    } catch (err) {
      console.error('❌ Failed to connect to MongoDB for alarm routes:', err);
    }
  })();
  
  // GET all alarms endpoint
  alarmRouter.get('/', async (req, res) => {
    console.log('GET /api/alarms endpoint called');
    try {
      // Connect to the alarms collection
      const db = mongoClient.db(dbName);
      const alarmsCollection = db.collection('alarms');
      
      // Log the collection information
      console.log(`🔎 Querying collection: ${alarmsCollection.namespace}`);
      
      // Add debug logging for database and collection
      console.log(`Current database: ${db.databaseName}`);
      
      try {
        // List all databases to verify connection
        const adminDb = mongoClient.db('admin');
        const dbs = await adminDb.admin().listDatabases();
        console.log('Available databases:');
        dbs.databases.forEach(d => console.log(`- ${d.name} (${d.sizeOnDisk} bytes)`));
        
        // Get stats for the current database
        const dbStats = await db.stats();
        console.log(`Database stats: ${dbStats.collections} collections, ${dbStats.objects} objects`);
        
        // Then get collection stats
        try {
          const stats = await db.command({ collStats: 'alarms' });
          console.log(`Collection stats: ${stats.count} documents, ${stats.size} bytes`);
        } catch (statsErr) {
          console.log(`Could not get collection stats: ${statsErr.message}`);
        }
      } catch (dbErr) {
        console.log(`Database admin operations failed: ${dbErr.message}`);
      }
      
      // Fetch alarms from MongoDB - use an empty query to get everything
      console.log('Executing find() on alarms collection with empty query...');
      let rawAlarms = [];
      
      try {
        // First try a find with no criteria to get any documents at all
        rawAlarms = await alarmsCollection.find({}).limit(100).toArray();
        console.log(`First query returned ${rawAlarms.length} documents`);
        
        if (rawAlarms.length === 0) {
          // If no documents found, log available collections and their counts
          console.log('No documents found. Checking all collections in database...');
          const allCollections = await db.listCollections().toArray();
          let sampleDocLogged = false;
          
          for (const coll of allCollections) {
            const count = await db.collection(coll.name).countDocuments();
            console.log(`Collection ${coll.name}: ${count} documents`);
            
            // If this is the first collection with documents, sample one
            if (count > 0 && !sampleDocLogged) {
              const sampleDoc = await db.collection(coll.name).findOne({});
              console.log(`Sample document from ${coll.name}:`, sampleDoc);
              sampleDocLogged = true;
            }
          }
        }
      } catch (findErr) {
        console.error('Error executing find() query:', findErr);
      }
      
      console.log(`📊 Raw query found ${rawAlarms.length} alarms from MongoDB`);
      
      // Transform the documents to match frontend expectations
      if (rawAlarms && rawAlarms.length > 0) {
        // Before transformation, log a sample document
        console.log('Sample raw document:', JSON.stringify(rawAlarms[0]).substring(0, 300) + '...');
        
        const alarms = rawAlarms.map(transformAlarmDocument)
          .sort((a, b) => new Date(b.CreatedTimestamp) - new Date(a.CreatedTimestamp));
        
        console.log(`📊 Transformed ${alarms.length} alarms for the frontend`);
        console.log('Sample alarm fields:', alarms.length > 0 ? Object.keys(alarms[0]).join(', ') : 'No alarms found');
        
        res.json(alarms);
      } else {
        // No documents found, return empty array
        console.log('No documents found in alarms collection');
        res.json([]);
      }
    } catch (error) {
      console.error('Error in /api/alarms endpoint:', error);
      // Fall back to test data if MongoDB fails
      console.log('⚠️ Falling back to test data');
      res.json([
        {
          _id: 'test-1',
          AlarmId: 'ALM001',
          AlarmCode: 'IO_ALR_108',
          AlarmDescription: 'Test alarm (MongoDB fallback)',
          CreatedTimestamp: new Date().toISOString(),
          DeviceId: 'esp32_04',
          DeviceName: 'ESP32 Device',
          PlantName: 'Plant D',
          IsActive: true,
          IsRead: false
        }
      ]);
    }
  });
  
  // GET alarms by device endpoint
  alarmRouter.get('/device/:deviceId', async (req, res) => {
    console.log(`GET /api/alarms/device/${req.params.deviceId} endpoint called`);
    try {
      // Connect to the alarms collection
      const db = mongoClient.db(dbName);
      const alarmsCollection = db.collection('alarms');
      
      // Fetch device-specific alarms from MongoDB - use exact field name from the document
      const query = { DeviceId: req.params.deviceId };
      
      console.log(`🔎 Querying for device with query:`, query);
      
      const rawAlarms = await alarmsCollection.find(query).limit(100).toArray();
      
      console.log(`📊 Raw query found ${rawAlarms.length} alarms for device ${req.params.deviceId}`);
      
      // Transform the documents to match frontend expectations
      const alarms = rawAlarms.map(transformAlarmDocument)
        .sort((a, b) => new Date(b.CreatedTimestamp) - new Date(a.CreatedTimestamp));
      
      console.log(`📊 Transformed ${alarms.length} alarms for device ${req.params.deviceId}`);
      res.json(alarms);
    } catch (error) {
      console.error(`Error in /api/alarms/device/${req.params.deviceId} endpoint:`, error);
      // Fall back to test data if MongoDB fails
      console.log('⚠️ Falling back to test data for device');
      res.json([
        {
          _id: 'test-device-1',
          AlarmId: 'ALM002',
          AlarmCode: 'IO_ALR_106',
          AlarmDescription: `Test alarm for device ${req.params.deviceId} (MongoDB fallback)`,
          CreatedTimestamp: new Date().toISOString(),
          DeviceId: req.params.deviceId,
          DeviceName: 'ESP32 Device',
          PlantName: 'Plant D',
          IsActive: true,
          IsRead: false
        }
      ]);
    }
  });
  
  // GET unread alarms count endpoint
  alarmRouter.get('/unread/count', async (req, res) => {
    console.log('GET /api/alarms/unread/count endpoint called');
    try {
      // Connect to the alarms collection
      const db = mongoClient.db(dbName);
      const alarmsCollection = db.collection('alarms');
      
      // Count unread alarms - use correct field name from document
      const query = { IsRead: false };
      
      console.log(`🔎 Querying for unread alarms with query:`, query);
      
      const count = await alarmsCollection.countDocuments(query);
      
      console.log(`📊 Found ${count} unread alarms in MongoDB`);
      res.json({ count });
    } catch (error) {
      console.error('Error in /api/alarms/unread/count endpoint:', error);
      // Fall back to test data
      console.log('⚠️ Falling back to test count data');
      res.json({ count: 1 });
    }
  });
  
  // Mark alarm as read endpoint
  alarmRouter.put('/:alarmId/read', async (req, res) => {
    console.log(`PUT /api/alarms/${req.params.alarmId}/read endpoint called`);
    try {
      // Connect to the alarms collection
      const db = mongoClient.db(dbName);
      const alarmsCollection = db.collection('alarms');
      
      // Try different ID formats (MongoDB ObjectID or string ID)
      let result;
      try {
        // Try with MongoDB ObjectID
        const { ObjectId } = require('mongodb');
        const objectId = new ObjectId(req.params.alarmId);
        
        // Update using exact field name - IsRead, not isRead
        result = await alarmsCollection.updateOne(
          { _id: objectId },
          { $set: { IsRead: true } }
        );
        
        console.log(`🔎 Updated alarm with ObjectId: ${objectId}`);
      } catch (err) {
        // If ObjectID conversion fails, try with AlarmId field
        console.log(`💥 ObjectId conversion failed, trying with AlarmId: ${req.params.alarmId}`);
        result = await alarmsCollection.updateOne(
          { AlarmId: parseInt(req.params.alarmId) || req.params.alarmId },
          { $set: { IsRead: true } }
        );
      }
      
      console.log(`📊 Updated alarm ${req.params.alarmId} to read. Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
      res.json({ 
        success: result.matchedCount > 0,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount
      });
    } catch (error) {
      console.error(`Error in /api/alarms/${req.params.alarmId}/read endpoint:`, error);
      // Fall back to test response
      console.log('⚠️ Falling back to test success response');
      res.json({ success: true });
    }
  });
  
  // Mark all alarms as read endpoint
  alarmRouter.put('/read/all', async (req, res) => {
    console.log('PUT /api/alarms/read/all endpoint called');
    try {
      // Connect to the alarms collection
      const db = mongoClient.db(dbName);
      const alarmsCollection = db.collection('alarms');
      
      // Update all unread alarms - use the correct field name
      const result = await alarmsCollection.updateMany(
        { IsRead: false },
        { $set: { IsRead: true } }
      );
      
      console.log(`📊 Marked all alarms as read. Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
      res.json({ 
        success: true,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount
      });
    } catch (error) {
      console.error('Error in /api/alarms/read/all endpoint:', error);
      // Fall back to test response
      console.log('⚠️ Falling back to test success response');
      res.json({ success: true });
    }
  });
  
  // Use the temporary router for alarm routes
  app.use('/api/alarms', alarmRouter);
} else {
  // Use the existing alarm routes if they're defined
  app.use('/api/alarms', alarmRoutes);
}

// Add a basic test endpoint for API verification
app.get('/api/test', (req, res) => {
  console.log('GET /api/test endpoint called');
  res.json({ message: 'API is working' });
});

// Serve static files from the public directory
app.use(express.static('public'));

// Route for the dashboard
app.get('/dashboard', (req, res) => {
  res.sendFile(__dirname + '/public/dashboard.html');
});

// Redis test routes
app.use('/api/redis', redisTestRoutes);

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log(`🔌 New client connected: ${socket.id}`);
  
  // Handle device subscription
  socket.on("subscribe", (deviceId) => {
    console.log(`👂 Client ${socket.id} subscribed to device: ${deviceId}`);
    socket.join(`device:${deviceId}`);
  });
  
  // Handle plant subscription
  socket.on("subscribePlant", (plantId) => {
    console.log(`👂 Client ${socket.id} subscribed to plant: ${plantId}`);
    socket.join(`plant:${plantId}`);
  });
  
  // Handle client disconnection
  socket.on("disconnect", () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// Redis subscriber for telemetry and alarm data
const redisSub = redisClient.duplicate();

// Keep track of last message time to prevent flooding
let lastMessageTime = {};

// Add telemetry message counter for debugging
let telemetryMsgCount = 0;
let alarmMsgCount = 0;

// Debug Redis connection by pinging it periodically
setInterval(async () => {
  try {
    if (redisClient.isOpen) {
      const result = await redisClient.ping();
      console.log(`🟡 REDIS PING: ${result} (Connected: ${redisClient.isOpen}, Telemetry msgs: ${telemetryMsgCount}, Alarm msgs: ${alarmMsgCount})`);
    } else {
      console.log(`🔴 REDIS CONNECTION CLOSED - Attempting to reconnect...`);
      try { await redisClient.connect(); } catch (e) { console.error(e); }
    }
  } catch (err) {
    console.error(`🔴 Error pinging Redis: ${err}`);
  }
}, 10000);

// Connect Redis subscriber
(async () => {
  try {
    console.log('🔌 Connecting to Redis subscriber...');
    await redisSub.connect();
    console.log('🟢 Redis subscriber connected successfully!');
    
    // Subscribe to telemetry channel with enhanced logging
    console.log('🔎 Subscribing to "telemetry" Redis channel...');
    await redisSub.subscribe("telemetry", (message) => {
      telemetryMsgCount++;
      console.log(`🟢 [REDIS] Received telemetry message #${telemetryMsgCount} from Redis: ${message.substring(0, 50)}...`);
      
      try {
        // Attempt to parse to verify it's valid JSON
        const parsed = JSON.parse(message);
        console.log(`🟢 [REDIS] Valid JSON message with keys: ${Object.keys(parsed).join(', ')}`);
      } catch (err) {
        console.error(`🔴 [REDIS] Invalid JSON message: ${err.message}`);
      }
      try {
        const telemetryData = JSON.parse(message);
        const deviceId = telemetryData.deviceId || telemetryData.device;
        const deviceName = telemetryData.deviceName || telemetryData.DeviceName || deviceId;
        
        // Check if this is from esp32_04 - various ways to identify it
        const isEsp32_04 = deviceId === 'esp32_04' || 
                          deviceName?.toLowerCase().includes('esp32_04') || 
                          telemetryData?.device?.toLowerCase() === 'esp32_04' ||
                          telemetryData?.deviceId?.toLowerCase() === 'esp32_04';
        
        // Enhanced logging for ESP32_04
        if (isEsp32_04) {
          console.log(`🔵 CRITICAL: Received ESP32_04 telemetry: ${JSON.stringify(telemetryData).substring(0, 200)}...`);
          
          // BROADCAST ESP32_04 DATA DIRECTLY TO ALL CLIENTS in multiple ways to ensure reception
          console.log(`💥 Broadcasting ESP32_04 data to ALL clients via MULTIPLE channels`);
          
          // Method 1: Direct broadcast to all sockets
          io.emit("telemetry", telemetryData);
          
          // Method 2: ESP32_04 specific channel
          io.emit("telemetry_esp32_04", telemetryData);
          
          // Method 3: Device-specific room
          io.to(`device:esp32_04`).emit("telemetry-esp32_04", telemetryData);
          
          // Method 4: Global broadcast with type identifier
          io.emit("broadcast", { type: "esp32_04_data", data: telemetryData });
          
          // Method 5: Send to all connected socket clients individually for maximum reliability
          const connectedSockets = Array.from(io.sockets.sockets).map(socket => socket[1]);
          console.log(`💿 Sending to ${connectedSockets.length} individual sockets`);
          
          connectedSockets.forEach(socket => {
            socket.emit("telemetry-esp32_04", telemetryData);
          });
          
        } else {
          // Normal handling for other devices
          console.log(`📡 Received telemetry data for device: ${deviceName}`);
          
          // Emit to specific device room
          io.to(`device:${deviceId}`).emit("telemetry", telemetryData);
        }
        
        // Also emit to plant room if we can determine the plant
        const plantName = telemetryData.plantName || 
                         (deviceName.includes("esp32_04") ? "Plant D" : "Plant C");
        const plantId = plantName === "Plant D" ? 2 : 1; // Map plant names to IDs
        
        console.log(`Emitting to plant:${plantId} for device ${deviceName}`);
        io.to(`plant:${plantId}`).emit("telemetry", telemetryData);
      } catch (err) {
        console.error("❌ Error processing telemetry message:", err);
      }
    });
    
    // Subscribe to alarm channel with enhanced logging
    console.log('🔎 Subscribing to "alarms" Redis channel...');
    await redisSub.subscribe("alarms", (message) => {
      alarmMsgCount++;
      console.log(`🟢 [REDIS] Received alarm message #${alarmMsgCount} from Redis: ${message.substring(0, 50)}...`);
      
      try {
        // Attempt to parse to verify it's valid JSON
        const parsed = JSON.parse(message);
        console.log(`🟢 [REDIS] Valid alarm JSON with keys: ${Object.keys(parsed).join(', ')}`);
        
        const alarmData = parsed;
        const deviceId = alarmData.deviceId || alarmData.DeviceId;
        
        console.log(`🚨 Received alarm data for device: ${deviceId}`);
        
        // Emit to all clients
        io.emit("alarm", alarmData);
        console.log(`💥 Broadcasting alarm to ALL connected clients (${io.engine.clientsCount} clients)`);
        
        // Emit to specific device room
        if (deviceId) {
          io.to(`device:${deviceId}`).emit("alarm", alarmData);
          console.log(`💢 Emitting alarm to device room: device:${deviceId}`);
        }
        
        // Also emit to plant room
        const plantId = alarmData.plantId || 
                      (alarmData.plantName === "Plant D" ? 2 : 1);
        
        io.to(`plant:${plantId}`).emit("alarm", alarmData);
        console.log(`🏭 Emitting alarm to plant room: plant:${plantId}`);
        
        // Extra processing for alarms to maintain ordering
        setTimeout(() => {
          // Broadcast to all clients for notifications with complete information
          // Ensure ALL required fields are included for proper display
          const notificationData = {
            id: alarmData._id || alarmData.id || `alarm-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            deviceId: deviceId,
            deviceName: alarmData.deviceName || alarmData.DeviceName || 'Unknown Device',
            plantName: alarmData.plantName || alarmData.PlantName || (deviceId.includes('esp32_04') ? 'Plant D' : 'Plant C'),
            alarmCode: alarmData.alarmCode || alarmData.AlarmCode || 'ALARM',
            alarmDescription: alarmData.alarmDescription || alarmData.AlarmDescription || 'New alarm',
            alarmValue: alarmData.alarmValue || alarmData.value || '',
            message: alarmData.message || alarmData.Message || '',
            description: alarmData.description || alarmData.desc || alarmData.alarmDescription || alarmData.AlarmDescription || '',
            status: alarmData.status || 'New',
            severity: alarmData.severity || 'Warning',
            createdTimestamp: alarmData.createdTimestamp || alarmData.CreatedTimestamp || new Date().toISOString(),
            isRead: false
          };
          
          console.log(`🔔 Broadcasting COMPLETE notification: ${JSON.stringify(notificationData).substring(0, 100)}...`);
          
          // Send to all clients with a small delay to ensure they're processed one by one
          io.emit("alarm_notification", notificationData);
        }, 200); // Add a 200ms delay between notifications to ensure they're processed one by one
      } catch (err) {
        console.error("❌ Error processing alarm message:", err);
      }
    });
    
    console.log("✅ Redis subscriber connected and listening");
  } catch (err) {
    console.error("❌ Failed to connect Redis subscriber:", err);
  }
})();

// Initialize routes only after database connections are established
const initializeRoutes = () => {
  // Now import all route files after DB connections are ready
  authRoutes = require("./routes/authRoutes");
  plantRoutes = require("./routes/plantRoutes");
  deviceRoutes = require("./routes/deviceRoutes");
  telemetryRoutes = require("./routes/telemetryRoutes");
  azureDeviceRoutes = require("./routes/azureDevice");
  alarmRoutes = require("./routes/alarmRoutes");
  
  // Set up routes
  app.use("/api/auth", authRoutes);
  app.use("/api/plants", plantRoutes);
  app.use("/api/devices", deviceRoutes);
  app.use("/api/telemetry", telemetryRoutes);
  app.use("/api/azure", azureDeviceRoutes);
  app.use("/api/alarms", alarmRoutes);
};

// Connect to multiple MongoDB databases (test and oxygen_monitor)
connectDB()
  .then(() => {
    console.log("✅ Databases initialized successfully!");
    
    // Import telemetry model initialization only after DB is connected
    const TelemetryModel = require("./models/telemetryModel");
    // Initialize the telemetry model with the correct database connection
    TelemetryModel.initModel();
    
    // Now that the database connections are ready, initialize routes
    initializeRoutes();
    
    // Export Redis client for use in other modules
    app.set('redisClient', redisClient);
    app.set('io', io);

    // Initialize WebSocket service
    const webSocketService = require('./services/websocketService');
    webSocketService.initializeWebSocketEvents();
    console.log("✅ WebSocket service initialized");

    // Add test route to verify Redis connectivity and data flow
    app.get('/api/test-redis-publish', async (req, res) => {
      try {
        const testData = {
          msgCount: Math.floor(Math.random() * 1000),
          device: 'esp32_04',
          temperature: Math.floor(Math.random() * 50),
          humidity: Math.floor(Math.random() * 100),
          alcoholLevel: Math.floor(Math.random() * 500),
          distance: Math.floor(Math.random() * 100) + Math.random(),
          oilLevel: 0,
          ledState: false,
          alerts: [{code: 'IO_ALR_109', desc: 'Oil tank refilled', value: 0}],
          _hasRelevantParameterChanges: true,
          Category: '2025-05',
          id: `test-${Date.now()}`,
          receivedTimestamp: new Date().toISOString(),
          deviceId: 'esp32_04',
          plantName: 'Plant D'
        };

        // Check if Redis is connected
        if (!redisClient.isOpen) {
          console.log('🔴 Redis not connected - trying to reconnect');
          await redisClient.connect();
        }
        
        console.log('🔵 Publishing test message to telemetry channel');
        const publishResult = await redisClient.publish('telemetry', JSON.stringify(testData));
        console.log(`🔵 Published test message, received by ${publishResult} subscribers`);
        
        // Also broadcast directly via WebSocket
        console.log('🔵 Broadcasting test message directly via WebSocket');
        io.emit('telemetry', testData);
        io.emit('telemetry_esp32_04', testData);
        io.emit('telemetry-esp32_04', testData);
        
        res.json({
          success: true,
          message: `Test data published to Redis (${publishResult} subscribers) and WebSocket`,
          data: testData
        });
      } catch (err) {
        console.error('❌ Error publishing test data:', err);
        res.status(500).json({
          success: false,
          message: `Error publishing test data: ${err.message}`,
          error: err.stack
        });
      }
    });

    // Add direct WebSocket test route
    app.get('/api/test-websocket', (req, res) => {
      try {
        const testData = {
          msgCount: Math.floor(Math.random() * 1000),
          device: 'esp32_04',
          temperature: Math.floor(Math.random() * 50),
          humidity: Math.floor(Math.random() * 100),
          timestamp: new Date().toISOString(),
          deviceId: 'esp32_04',
          plantName: 'Plant D',
          test: true
        };
        
        console.log(`🔵 Clients connected: ${io.engine.clientsCount}`);
        console.log('🔵 Broadcasting test message directly via WebSocket');
        
        // Broadcast to all channels
        io.emit('telemetry', testData);
        io.emit('telemetry_esp32_04', testData);
        io.emit('telemetry-esp32_04', testData);
        io.to('device:esp32_04').emit('telemetry', testData);
        
        res.json({
          success: true,
          message: `Test data broadcast directly via WebSocket to ${io.engine.clientsCount} clients`,
          data: testData
        });
      } catch (err) {
        console.error('❌ Error broadcasting test data:', err);
        res.status(500).json({
          success: false,
          message: `Error broadcasting test data: ${err.message}`,
          error: err.stack
        });
      }
    });

    // Start the server
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Test Redis: http://localhost:${PORT}/api/test-redis-publish`);
      console.log(`🌐 Test WebSocket: http://localhost:${PORT}/api/test-websocket`);
    });
    console.log(`✅ WebSocket server initialized on port ${PORT}`);
  })
  .catch((err) => {
    console.error("❌ Database initialization failed:", err);
    process.exit(1);
  });

// Export Redis client and io for use in other files
module.exports = { redisClient, io };

// Default route for API health check
app.get("/", (req, res) => {
  res.json({ status: "API is running", message: "Gas Monitoring Backend" });
});
