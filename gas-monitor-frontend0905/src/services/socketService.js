import { io } from 'socket.io-client';
import eventBus from './eventBusService';

class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.listeners = new Map();
    this.activeListeners = new Map(); // Track active listeners to prevent duplicates
    this.pendingSubscriptions = new Set(); // Track device subscriptions that need to be processed on connect
    this.connectionAttempts = 0;
    this.connectionCallbacks = [];
    this.disconnectionCallbacks = [];
    
    // Cache for persisting data between tab switches
    this.cache = {
      alarmsInitialDataLoaded: false,
      alarmData: [], // Cache for alarm data
      notificationsInitialDataLoaded: false,
      notificationData: [], // Cache for notification data
      lastFetchTime: null, // Timestamp of last API fetch
      lastNotificationFetchTime: null, // Timestamp of last notification API fetch
      currentPlant: null, // Currently selected plant
      currentDevice: null // Currently selected device
    };
  }
  
  // Get cached alarm data for persistence between navigation
  getCachedAlarmData() {
    return {
      isLoaded: this.cache.alarmsInitialDataLoaded,
      data: this.cache.alarmData || [],
      lastFetchTime: this.cache.lastFetchTime
    };
  }
  
  // Cache alarm data for persistence
  cacheAlarmData(data = []) {
    this.cache.alarmsInitialDataLoaded = true;
    this.cache.alarmData = data;
    this.cache.lastFetchTime = Date.now();
    console.log(`📦 Cached ${data.length} alarms at ${new Date().toLocaleString()}`);
    return true;
  }
  
  // Clear the alarm cache when switching plants/devices
  clearAlarmCache() {
    console.log(`🚮 Clearing alarm cache`);
    this.cache.alarmsInitialDataLoaded = false;
    this.cache.alarmData = [];
    this.cache.lastFetchTime = null;
    this.cache.currentPlant = null;
    this.cache.currentDevice = null;
    return true;
  }

  connect(url = process.env.REACT_APP_API_URL || 'http://localhost:5000') {
    // Clean up any existing socket connection first
    if (this.socket) {
      try {
        console.log('Cleaning up existing socket connection');
        this.socket.disconnect();
        this.socket.removeAllListeners();
        this.socket = null;
      } catch (err) {
        console.error('Error cleaning up socket:', err);
      }
    }

    console.log(`Connecting to WebSocket server at ${url}`);
    
    // CRITICAL: Add withCredentials & proper CORS options for cross-origin connections
    this.socket = io(url, {
      transports: ['websocket', 'polling'],  // Allow both for better reliability
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 20000,
      withCredentials: false,  // Important for cross-origin requests
      reconnection: true,      // Enable auto-reconnection
      autoConnect: true,       // Connect on instantiation
      extraHeaders: {
        "Access-Control-Allow-Origin": "*"
      }
    });
    
    console.log('WebSocket connection options set to force WebSocket transport');
    
    // Force close any existing connections to ensure clean state
    if (window.existingSocket) {
      try {
        window.existingSocket.disconnect();
      } catch (e) {}
    }
    
    // Store socket in global space for debugging
    window.existingSocket = this.socket;

    // Handle connection
    this.socket.on('connect', () => {
      console.log('🌐 Connected to WebSocket server');
      this.connected = true;
      
      // Process any pending subscriptions
      if (this.pendingSubscriptions && this.pendingSubscriptions.size > 0) {
        console.log(`📨 Processing ${this.pendingSubscriptions.size} pending subscriptions`);
        
        this.pendingSubscriptions.forEach(sub => {
          if (sub.startsWith('plant-')) {
            const plantId = sub.replace('plant-', '');
            console.log(`🏭 Resubscribing to plant: ${plantId}`);
            this.socket.emit('subscribe-plant', plantId);
          } else {
            console.log(`📡 Resubscribing to device: ${sub}`);
            this.socket.emit('subscribe', sub);
          }
        });
      }
      
      // Process any pending listeners
      ['_pending_alarm', '_pending_alarm_notification', '_pending_telemetry'].forEach(pendingType => {
        const eventType = pendingType.replace('_pending_', '');
        
        if (this.listeners.has(pendingType) && this.listeners.get(pendingType).length > 0) {
          console.log(`📨 Processing ${this.listeners.get(pendingType).length} pending ${eventType} listeners`);
          
          // Setup actual listeners and call their callbacks
          this.listeners.get(pendingType).forEach(cb => {
            if (eventType === 'alarm') this.onAlarm(cb);
            else if (eventType === 'alarm_notification') this.onAlarmNotification(cb);
            else if (eventType === 'telemetry') this.onTelemetry(cb);
          });
          
          // Clear pending listeners
          this.listeners.delete(pendingType);
        }
      });
      
      // Notify connection callbacks
      this.connectionCallbacks.forEach(callback => {
        try {
          callback();
        } catch (err) {
          console.error('❌ Error in connection callback:', err);
        }
      });
    });

    // Handle disconnection
    this.socket.on('disconnect', (reason) => {
      console.log(`Disconnected from WebSocket server: ${reason}`);
      this.connected = false;
      this.disconnectionCallbacks.forEach(callback => callback(reason));
    });

    // Handle connection error
    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.connected = false;
    });
  }

  disconnect() {
    if (this.socket) {
      console.log('Disconnecting from WebSocket server');
      
      // Properly cleanup any subscriptions before disconnecting
      this.pendingSubscriptions.clear();
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }
  
  // Unsubscribe from a device
  unsubscribeFromDevice(deviceId) {
    if (!deviceId || !this.socket || !this.connected) {
      return;
    }
    
    console.log(`Unsubscribing from device: ${deviceId}`);
    this.socket.emit('unsubscribe', deviceId);
    
    // Remove from pending subscriptions
    if (this.pendingSubscriptions && this.pendingSubscriptions.has(deviceId)) {
      this.pendingSubscriptions.delete(deviceId);
    }
  }
  
  // Unsubscribe from a plant
  unsubscribeFromPlant(plantId) {
    if ((!plantId && plantId !== 0) || !this.socket || !this.connected) {
      return;
    }
    
    const plantKey = `plant-${plantId}`;
    console.log(`Unsubscribing from plant: ${plantId}`);
    this.socket.emit('unsubscribe-plant', plantId);
    
    // Remove from pending subscriptions
    if (this.pendingSubscriptions && this.pendingSubscriptions.has(plantKey)) {
      this.pendingSubscriptions.delete(plantKey);
    }
  }

  // Subscribe to device data
  subscribeToDevice(deviceId) {
    if (!deviceId) {
      console.error('Cannot subscribe to null/undefined device');
      return;
    }

    // Check if already subscribed to this device to prevent duplicates
    if (this.pendingSubscriptions && this.pendingSubscriptions.has(deviceId)) {
      console.log(`Already subscribed to device: ${deviceId}, skipping duplicate subscription`);
      return;
    }

    // Save to pending subscriptions to reapply on reconnection
    this.pendingSubscriptions = this.pendingSubscriptions || new Set();
    
    // Clear any other device subscriptions to prevent multiple connections
    this.pendingSubscriptions.forEach(sub => {
      if (sub !== `plant-${this.cache.currentPlant}` && sub !== deviceId) {
        console.log(`Removing previous device subscription: ${sub}`);
        this.pendingSubscriptions.delete(sub);
      }
    });
    
    // Add the new device subscription
    this.pendingSubscriptions.add(deviceId);

    if (!this.socket || !this.connected) {
      console.warn(`Socket not connected. Added ${deviceId} to pending subscriptions`);
      this.connect(); // Try to connect
      return;
    }

    console.log(`Subscribing to device: ${deviceId}`);
    this.socket.emit('subscribe', deviceId);
  }

  // Listen for telemetry data for a specific plant
  subscribeToPlant(plantId) {
    if (!plantId && plantId !== 0) {
      console.error('Cannot subscribe to null/undefined plant');
      return;
    }
    
    const plantKey = `plant-${plantId}`;
    
    // Check if already subscribed to this plant to prevent duplicates
    if (this.pendingSubscriptions && this.pendingSubscriptions.has(plantKey)) {
      console.log(`Already subscribed to plant: ${plantId}, skipping duplicate subscription`);
      return;
    }

    // Save to pending subscriptions to reapply on reconnection
    this.pendingSubscriptions = this.pendingSubscriptions || new Set();
    
    // Clear any other plant subscriptions to prevent multiple connections
    this.pendingSubscriptions.forEach(sub => {
      if (sub.startsWith('plant-') && sub !== plantKey) {
        console.log(`Removing previous plant subscription: ${sub}`);
        this.pendingSubscriptions.delete(sub);
      }
    });
    
    // Add the new plant subscription
    this.pendingSubscriptions.add(plantKey);

    if (!this.socket || !this.connected) {
      console.warn(`Socket not connected. Added plant ${plantId} to pending subscriptions`);
      this.connect(); // Try to connect
      return;
    }
    
    console.log(`Subscribing to plant: ${plantId}`);
    this.socket.emit('subscribe-plant', plantId);
  }

  // Keep track of active listeners to prevent duplicates
  activeListeners = new Map();

  // Listen for telemetry data
  onTelemetry(callback, device) {
    if (!this.socket) {
      console.error('❌ CRITICAL ERROR: Socket not initialized - trying to reconnect');
      this.connect();
      
      // Return a dummy cleanup function since we couldn't set up the actual listener
      return () => {};
    }
    
    // Check if socket is actually connected, if not, reconnect
    if (!this.isConnected()) {
      console.warn('⚠️ Socket exists but is not connected - reconnecting...');
      this.connect();
    }

    if (!this.listeners.has('telemetry')) {
      this.listeners.set('telemetry', []);
    }

    // Clean up any existing listeners for telemetry to prevent duplicates
    this.removeAllTelemetryListeners();

    // Generate a unique key for this callback-device combination
    const listenerKey = device ? `telemetry-${device}` : 'telemetry-global';
    
    // Store this callback with its key for later cleanup
    this.activeListeners.set(listenerKey, callback);
    
    console.log(`🎯 Setting up single telemetry listener for ${device || 'global'}`);
    
    // Just use one listener for the global telemetry channel with device filtering
    this.socket.on('telemetry', (data) => {
      const deviceId = data?.device || data?.deviceId || 'unknown';
      
      // Only process data for this device if a specific device was requested
      if (!device || deviceId === device || 
          (data && (deviceId.includes(device) || (device && device.includes(deviceId))))) {
        console.log(`📡 Received telemetry data for device: ${deviceId}`);
        // Add a unique ID to prevent duplicate processing
        data._uniqueId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        callback(data);
      }
    });
    
    // Add to the general listeners map
    this.listeners.get('telemetry').push(callback);

    // Return function to remove this specific listener
    return () => {
      this.removeListener('telemetry', callback);
      if (this.activeListeners.has(listenerKey)) {
        this.activeListeners.delete(listenerKey);
      }
      // Remove socket listener
      this.socket.off('telemetry');
    };
  }
  
  // Helper to remove all telemetry-related listeners
  removeAllTelemetryListeners() {
    if (this.socket) {
      console.log('🧹 Removing all telemetry-related listeners');
      
      // Remove device-specific telemetry listeners
      if (this.cache.currentDevice) {
        this.socket.off(`telemetry_${this.cache.currentDevice}`);
        this.socket.off(`telemetry-${this.cache.currentDevice}`);
      }
      
      // Remove general telemetry listener
      this.socket.off('telemetry');
      
      // Clear active listener tracking for telemetry
      if (this.activeListeners.has('telemetry')) {
        this.activeListeners.delete('telemetry');
      }
    }
  }
  
  // Helper to remove all notification-related listeners
  removeNotificationListeners() {
    if (this.socket) {
      console.log('🧹 Removing all notification-related listeners');
      
      // Remove notification listener
      this.socket.off('notification');
      
      // Clear active listener tracking for notifications
      if (this.activeListeners.has('notification')) {
        this.activeListeners.delete('notification');
      }
    }
  }

  // Listen for alarm data
  onAlarm(callback) {
    if (!this.socket) {
      console.error('❌ Cannot listen: Socket not initialized');
      this.connect(); // Auto-connect if needed
      
      // Store the callback to connect later when socket is available
      if (!this.listeners.has('_pending_alarm')) {
        this.listeners.set('_pending_alarm', []);
      }
      this.listeners.get('_pending_alarm').push(callback);
      return;
    }

    // Always clean up existing alarm listeners to prevent duplication
    if (this.socket.hasListeners && this.socket.hasListeners('alarm')) {
      console.log('🧹 Cleaning up existing alarm listeners before adding new ones');
      this.socket.off('alarm');
    }
    
    // Initialize/reset the listeners collection
    if (!this.listeners.has('alarm')) {
      this.listeners.set('alarm', []);
    } else {
      // Clear existing callbacks to prevent duplicates
      this.listeners.set('alarm', []);
    }
    
    // Add this callback to the listeners
    this.listeners.get('alarm').push(callback);
    
    // Add event listener to socket
    this.socket.on('alarm', (data) => {
      console.log('📥 Received alarm data via WebSocket:', data);
      // Add a unique timestamp to prevent duplicate processing
      data._receivedAt = Date.now();
      data._uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Add the alarm to our persistent cache
      this.addAlarmToCache(data);
      
      // CRITICAL: Broadcast the alarm via the event bus for synchronization
      // This ensures the notification component receives the same alarm data as the alarms tab
      eventBus.emit('new-alarm', data);
      
      const callbacks = this.listeners.get('alarm') || [];
      console.log(`🔔 Executing ${callbacks.length} alarm callbacks for new data`);
      
      callbacks.forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error('❌ Error in alarm callback:', err);
        }
      });
    });
    
    console.log('✅ Registered socket listener for "alarm" events with callback');
    console.log(`👂 Total alarm listeners: ${this.listeners.get('alarm').length}`);
    
    // If already connected, test the socket connection
    if (this.isConnected()) {
      console.log('🔄 Connection active - testing alarm channel');
      this.socket.emit('test-connection', { channel: 'alarm', timestamp: Date.now() });
    }
    
    // Return a cleanup function
    return () => this.removeListener('alarm', callback);
  }

  // Listen for alarm notifications
  onAlarmNotification(callback) {
    if (!this.socket) {
      console.error('❌ Cannot listen: Socket not initialized');
      this.connect(); // Auto-connect if needed
      
      // Store the callback to connect later when socket is available
      if (!this.listeners.has('_pending_alarm_notification')) {
        this.listeners.set('_pending_alarm_notification', []);
      }
      this.listeners.get('_pending_alarm_notification').push(callback);
      return;
    }

    // Always clean up existing alarm notification listeners to prevent duplication
    if (this.socket.hasListeners && this.socket.hasListeners('alarm_notification')) {
      console.log('🧹 Cleaning up existing alarm notification listeners before adding new ones');
      this.socket.off('alarm_notification');
    }
    
    // Initialize/reset the listeners collection
    if (!this.listeners.has('alarm_notification')) {
      this.listeners.set('alarm_notification', []);
    } else {
      // Clear existing callbacks to prevent duplicates
      this.listeners.set('alarm_notification', []);
    }
    
    // Add this callback to the listeners
    this.listeners.get('alarm_notification').push(callback);
    
    // Add event listener to socket
    this.socket.on('alarm_notification', (data) => {
      console.log('🔔 Received alarm notification via WebSocket:', data);
      // Add a unique timestamp to prevent duplicate processing
      data._receivedAt = Date.now();
      data._uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Add the alarm to our persistent cache
      this.addAlarmToCache(data);
      
      // CRITICAL: Broadcast the alarm notification via the event bus for synchronization
      // This ensures the notification component receives the same alarm data as the alarms tab
      eventBus.emit('new-alarm', data);
      
      const callbacks = this.listeners.get('alarm_notification') || [];
      console.log(`🔔 Executing ${callbacks.length} alarm notification callbacks for new data`);
      
      callbacks.forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error('❌ Error in alarm_notification callback:', err);
        }
      });
    });
    
    console.log('✅ Registered socket listener for "alarm_notification" events');
    console.log(`👂 Total alarm notification listeners: ${this.listeners.get('alarm_notification').length}`);
    
    // If already connected, test the socket connection
    if (this.isConnected()) {
      console.log('🔄 Connection active - testing alarm notification channel');
      this.socket.emit('test-connection', { channel: 'alarm_notification', timestamp: Date.now() });
    }
    
    // Return a cleanup function
    return () => this.removeListener('alarm_notification', callback);
  }

  // Remove a specific callback from a listener
  removeListener(event, callback) {
    if (!this.listeners.has(event)) return;

    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index !== -1) {
      callbacks.splice(index, 1);
    }
  }

  // Add a connection callback
  onConnect(callback) {
    this.connectionCallbacks.push(callback);
    // If already connected, call the callback immediately
    if (this.connected) {
      callback();
    }
  }

  // Add a disconnection callback
  onDisconnect(callback) {
    this.disconnectionCallbacks.push(callback);
  }

  // Remove a connection callback
  removeConnectCallback(callback) {
    const index = this.connectionCallbacks.indexOf(callback);
    if (index !== -1) {
      this.connectionCallbacks.splice(index, 1);
    }
  }

  // Remove a disconnection callback
  removeDisconnectCallback(callback) {
    const index = this.disconnectionCallbacks.indexOf(callback);
    if (index !== -1) {
      this.disconnectionCallbacks.splice(index, 1);
    }
  }

  // Check if socket is connected - more robust check
  isConnected() {
    return this.connected && this.socket && this.socket.connected;
  }

  // Methods to handle alarm data persistence between tab changes
  cacheAlarmData(alarmData) {
    if (Array.isArray(alarmData) && alarmData.length > 0) {
      this.cache.alarmData = [...alarmData];
      this.cache.alarmsInitialDataLoaded = true;
      this.cache.lastFetchTime = Date.now();
      console.log('📦 Cached alarm data:', this.cache.alarmData.length, 'items');
    }
  }

  getCachedAlarmData() {
    return {
      data: this.cache.alarmData,
      isLoaded: this.cache.alarmsInitialDataLoaded,
      lastFetchTime: this.cache.lastFetchTime
    };
  }

  // Add a new alarm to the cache
  addAlarmToCache(newAlarm) {
    if (!newAlarm) return;

    // Check if this alarm already exists to prevent duplicates
    const alarmId = newAlarm.id || newAlarm._id || newAlarm.AlarmId || '';
    const existingAlarmIndex = this.cache.alarmData.findIndex(a => 
      (a._id === alarmId) || (a.AlarmId === alarmId) ||
      (newAlarm.timestamp && a.CreatedTimestamp === newAlarm.timestamp)
    );
    
    if (existingAlarmIndex >= 0) {
      console.log(`Skipping duplicate alarm with ID ${alarmId} - already in cache`);
      return;
    }

    // Format alarm data consistently
    const formattedAlarm = {
      _id: alarmId || `alarm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      AlarmId: newAlarm.id || newAlarm.alarmId || newAlarm.AlarmId || '',
      AlarmCode: newAlarm.alarmCode || newAlarm.AlarmCode || '',
      AlarmDescription: newAlarm.description || newAlarm.alarmDescription || newAlarm.AlarmDescription || '',
      CreatedTimestamp: newAlarm.timestamp || newAlarm.createdTimestamp || newAlarm.CreatedTimestamp || new Date().toISOString(),
      DeviceId: newAlarm.deviceId || newAlarm.DeviceId || '',
      DeviceName: newAlarm.deviceName || newAlarm.DeviceName || '',
      PlantName: newAlarm.plantName || newAlarm.PlantName || '',
      IsActive: true,
      IsRead: false
    };
    
    // Add the new alarm at the top of the list (maintain descending timestamp order)
    this.cache.alarmData = [formattedAlarm, ...this.cache.alarmData];
    console.log(`📝 Added new alarm to cache: ${formattedAlarm.AlarmCode}`);
  }

  markAlarmAsRead(alarmId) {
    if (!alarmId) return;
    
    this.cache.alarmData = this.cache.alarmData.map(alarm => 
      alarm._id === alarmId ? { ...alarm, IsRead: true } : alarm
    );
  }

  clearAlarmCache() {
    this.cache.alarmData = [];
    this.cache.alarmsInitialDataLoaded = false;
    this.cache.lastFetchTime = null;
    console.log('🧹 Cleared alarm data cache');
  }
  
  // NOTIFICATION METHODS
  
  // Cache notification data for persistence
  cacheNotificationData(data = []) {
    this.cache.notificationsInitialDataLoaded = true;
    this.cache.notificationData = data;
    this.cache.lastNotificationFetchTime = Date.now();
    console.log(`📦 Cached ${data.length} notifications at ${new Date().toLocaleString()}`);
    return true;
  }
  
  // Get cached notification data for persistence between navigation
  getCachedNotificationData() {
    return {
      isLoaded: this.cache.notificationsInitialDataLoaded,
      data: this.cache.notificationData || [],
      lastFetchTime: this.cache.lastNotificationFetchTime
    };
  }
  
  // Add a new notification to the cache
  addNotificationToCache(newNotification) {
    if (!newNotification) return;

    // Check if this notification already exists to prevent duplicates
    const notificationId = newNotification.id || newNotification._id || newNotification.NotificationId || '';
    const existingNotificationIndex = this.cache.notificationData.findIndex(n => 
      (n._id === notificationId) || (n.NotificationId === notificationId) ||
      (newNotification.timestamp && n.CreatedTimestamp === newNotification.timestamp)
    );
    
    if (existingNotificationIndex >= 0) {
      console.log(`Skipping duplicate notification with ID ${notificationId} - already in cache`);
      return;
    }

    // Format notification data consistently
    const formattedNotification = {
      _id: notificationId || `notification-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      NotificationId: newNotification.id || newNotification.notificationId || newNotification.NotificationId || '',
      Type: newNotification.type || newNotification.Type || 'general',
      Message: newNotification.message || newNotification.Message || '',
      Title: newNotification.title || newNotification.Title || '',
      CreatedTimestamp: newNotification.timestamp || newNotification.createdTimestamp || newNotification.CreatedTimestamp || new Date().toISOString(),
      DeviceId: newNotification.deviceId || newNotification.DeviceId || '',
      DeviceName: newNotification.deviceName || newNotification.DeviceName || '',
      PlantId: newNotification.plantId || newNotification.PlantId || '',
      PlantName: newNotification.plantName || newNotification.PlantName || '',
      IsRead: false
    };
    
    // Add the new notification at the top of the list (maintain descending timestamp order)
    this.cache.notificationData = [formattedNotification, ...this.cache.notificationData];
    console.log(`📝 Added new notification to cache: ${formattedNotification.Type}`);
  }
  
  // Mark notification as read
  markNotificationAsRead(notificationId) {
    if (!notificationId) return;
    
    this.cache.notificationData = this.cache.notificationData.map(notification => 
      notification._id === notificationId ? { ...notification, IsRead: true } : notification
    );
  }
  
  // Clear notification cache
  clearNotificationCache() {
    this.cache.notificationData = [];
    this.cache.notificationsInitialDataLoaded = false;
    this.cache.lastNotificationFetchTime = null;
    console.log('🧹 Cleared notification data cache');
  }
  
  // Subscribe to notifications
  subscribeToNotifications(type = null) {
    if (!this.socket || !this.connected) {
      console.log('📬 Socket not connected, adding notification subscription to pending list');
      this.pendingSubscriptions.add('notifications');
      return;
    }
    
    console.log(`📬 Subscribing to notifications${type ? ` of type: ${type}` : ''}`);
    
    // Send subscription request to server
    this.socket.emit('subscribe-notifications', { type });
    
    // Store in pending subscriptions for reconnection handling
    this.pendingSubscriptions.add('notifications');
    
    if (type) {
      this.pendingSubscriptions.add(`notification-${type}`);
    }
  }
  
  // Listen for notification data
  onNotification(callback) {
    if (!callback || typeof callback !== 'function') {
      console.error('Invalid callback provided to onNotification');
      return;
    }
    
    // Track this listener
    if (!this.listeners.has('notification')) {
      this.listeners.set('notification', []);
    }
    
    const callbacks = this.listeners.get('notification');
    callbacks.push(callback);
    
    // Set up socket listener if not already active
    if (!this.activeListeners.has('notification') && this.socket) {
      console.log('📬 Setting up notification listener on socket');
      
      this.socket.on('notification', (data) => {
        console.log('📬 Received notification:', data);
        
        // Cache this notification
        this.addNotificationToCache(data);
        
        // Call all registered callbacks
        const allCallbacks = this.listeners.get('notification') || [];
        allCallbacks.forEach(cb => {
          try {
            cb(data);
          } catch (err) {
            console.error('Error in notification callback:', err);
          }
        });
      });
      
      this.activeListeners.set('notification', true);
    }
    
    // If socket not connected, queue the subscription for when we connect
    if (!this.socket || !this.connected) {
      console.log('📬 Socket not connected, queuing notification subscription');
      this.subscribeToNotifications();
    } else {
      // Socket is connected, subscribe now
      this.subscribeToNotifications();
    }
  }
}

// Create a singleton instance
const socketService = new SocketService();

// Auto-connect when the service is imported
socketService.connect();

// Setup auto-reconnect on window focus
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    if (!socketService.isConnected()) {
      console.log('Window focused - reconnecting socket if needed');
      socketService.connect();
    }
  });
}

export default socketService;
