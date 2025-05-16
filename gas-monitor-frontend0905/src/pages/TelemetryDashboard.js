import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getPlants } from "../services/plantService";
import { getDevices } from "../services/deviceService";
import { getThresholdValue, updateThresholdValue, getToleranceValue, updateToleranceValue } from '../services/telemetryService';
import { fetchLatestTelemetry, fetchTelemetryData, fetchRealtimeTelemetry } from '../services/telemetryService';
import socketService from '../services/socketService';
import axios from 'axios';
import Layout from "../components/Layout";
import AlarmsTab from '../components/siteView/AlarmsTab';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  getLatestTelemetryEntry, 
  getRealtimeTelemetryData, 
  getTelemetryData,
  clearDeviceCache,
  restartDevice
} from "../services/telemetryService";
import { Line } from "react-chartjs-2";
import TextField from '@mui/material/TextField';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";

ChartJS.register(
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  Title, 
  Tooltip, 
  Legend,
  ArcElement
);

import {
  Container,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Paper,
  Box,
  Typography,
  CircularProgress,
  Button,
  Grid,
  Divider,
  TableContainer,
  Tabs,
  Tab,
  IconButton,
  Badge,
  Menu,
  Popover
} from "@mui/material";
import NotificationsIcon from '@mui/icons-material/Notifications';

import { useTheme } from '@mui/material/styles';

function TabPanel(props) {
  const { children, value, index, ...other } = props;
 
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

// Custom circular progress visualization component that matches the reference UI
const MetricCircle = ({ value, label, color, size = 100, thickness = 5 }) => {
  const theme = useTheme();
  const displayValue = value || 0;
  
  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center',
      m: 2
    }}>
      <Box sx={{ 
        position: 'relative', 
        display: 'inline-flex',
        mb: 1
      }}>
        <CircularProgress
          variant="determinate"
          value={100} // Fixed angle for the visual style
          size={size}
          thickness={thickness}
          sx={{ 
            color: color || theme.palette.primary.main,
            transform: 'rotate(135deg)',
            '& .MuiCircularProgress-circle': {
              strokeLinecap: 'round',
            }
          }}
        />
        <Box
          sx={{
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
            position: 'absolute',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography variant="h5" component="div" fontWeight="bold">
            {displayValue}
            {label === 'Temperature' ? '°C' : label === 'Humidity' || label === 'Oil Level' ? '%' : ''}
          </Typography>
        </Box>
      </Box>
      <Typography variant="body1" component="div">
        {label}
      </Typography>
    </Box>
  );
};

const TelemetryDashboard = () => {
  const [selectedConfigType, setSelectedConfigType] = useState('');
  const [selectedCommandType, setSelectedCommandType] = useState("");
  const [liveCommandValue, setLiveCommandValue] = useState('');
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [currentThreshold, setCurrentThreshold] = useState('');
  const [threshold, setThreshold] = useState('');
  const [newThreshold, setNewThreshold] = useState('');
  
  // For tolerance values
  const [selectedToleranceMetric, setSelectedToleranceMetric] = useState('');
  const [currentTolerance, setCurrentTolerance] = useState('');
  const [newTolerance, setNewTolerance] = useState('');
  
  const theme = useTheme();
  const location = useLocation();
  const [plants, setPlants] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedPlant, setSelectedPlant] = useState("");
  const [selectedDevice, setSelectedDevice] = useState('');
  const [dataPeriod, setDataPeriod] = useState('1h');
  const [telemetryData, setTelemetryData] = useState([]);
  const [realtimeData, setRealtimeData] = useState([]);
  const [latestEntry, setLatestEntry] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [realtimeEnabled, setRealtimeEnabled] = useState(true);
  const [localAlarmCount, setLocalAlarmCount] = useState(0);
  // Track if we've loaded initial alarms data
  const [alarmsInitialized, setAlarmsInitialized] = useState(false);
  
  // Refs to track subscriptions
  const activeDeviceRef = useRef(null);
  const activePlantRef = useRef(null);
  
  // Ref to store socket cleanup functions
  const socketCleanupRef = useRef(null);
  
  // Ref to track processed data to prevent duplicates
  const processedDataRef = useRef(new Set());
  
  // Map MongoDB device IDs to actual device identifiers used in EventHub
  // This mapping ensures we subscribe to the right WebSocket channels
  const [deviceIdMap, setDeviceIdMap] = useState({});

  // Get tab from URL or use default
  const tabFromURL = new URLSearchParams(location.search).get('tab');
  const [activeTab, setActiveTab] = useState('status'); // default is 'status'

  // Update active tab based on URL when component mounts or URL changes
  useEffect(() => {
    if (tabFromURL) {
      setActiveTab(tabFromURL);
    }
  }, [tabFromURL]);

  // The handleTabChange function is defined below, around line 290

  // Get location search parameters (if any)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab) {
      setActiveTab(tab);
    }
  }, [location.search]);
  
  // Fetch alarm count from the backend
  useEffect(() => {
    // Initial alarm count and notifications are loaded from API, subsequent updates are via WebSocket only
    const fetchAlarmCount = async () => {
      if (!selectedDevice && selectedPlant) {
        // If device is not selected but plant is, try to load alarms for the plant
        try {
          console.log(' Initial fetch of alarm count and notifications via API');
          setDataSource('loading'); // Show loading state
          
          const response = await axios.get('http://localhost:5000/api/alarms');
          const alarms = response.data;
          
          // Update alarm count
          setLocalAlarmCount(alarms.length);
          
          // Store the most recent 5 alarms for the notifications dropdown
          if (alarms.length > 0 && !alarmsInitialized) {
            const formattedAlarms = alarms.slice(0, 5).map(alarm => ({
              id: alarm._id || `alarm-${Date.now()}-${Math.random()}`,
              alarmCode: alarm.AlarmCode || '',
              description: alarm.AlarmDescription || '',
              timestamp: new Date(alarm.CreatedTimestamp || new Date()).toISOString(),
              deviceName: alarm.DeviceName || 'Unknown Device',
              isRead: alarm.IsRead || false
            }));
            
            setRecentNotifications(formattedAlarms);
            setAlarmsInitialized(true); // Mark that we've initialized alarms
            console.log(' Loaded initial notifications:', formattedAlarms);
          }
          
          setDataSource('api'); // Mark data as coming from API
          
          // After initial load, set a timeout to ensure we switch to WebSocket
          // This helps if WebSocket connection is slow or if API is faster
          setTimeout(() => {
            if (socketService.isConnected()) {
              setDataSource('websocket'); // Now using WebSockets
              console.log(' Switched to WebSocket for alarm updates');
            }
          }, 2000);
          
        } catch (error) {
          console.error('Error fetching alarm count:', error);
          // If API fails, still try to use WebSocket data
          setDataSource('websocket');
        }
      }
    };
    
    fetchAlarmCount();
    
    // Refresh alarm count periodically if needed
    // const interval = setInterval(fetchAlarmCount, 30000);
  
    // return () => clearInterval(interval);
    return () => {};
  }, [selectedDevice, selectedPlant, alarmsInitialized]);

  const navigate = useNavigate();

  const handleTabChange = (event, newValue) => {
    // Update URL with the new tab
    const searchParams = new URLSearchParams(location.search);
    searchParams.set('tab', newValue);
    navigate(`?${searchParams.toString()}`);
    
    // Store current tab
    setActiveTab(newValue);
    
    // When switching back to status tab, ensure we maintain data
    if (newValue === 'status') {
      // If we have deviceData but latestEntry is null, restore it
      if (deviceData && (!latestEntry || !latestEntry.temperature)) {
        console.log(' Restoring device data after tab switch');
        setLatestEntry({
          temperature: deviceData.temperature || 0,
          humidity: deviceData.humidity || 0,
          oilLevel: deviceData.oilLevel || 0
        });
      }
    }
  };

  // Chart configuration options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: {
          display: false
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: '#f0f0f0'
        }
      }
    },
    plugins: {
      legend: {
        display: false
      }
    }
  };
  
  useEffect(() => {
    const fetchPlants = async () => {
      try {
        setLoading(true);
        const plantData = await getPlants();
        setPlants(plantData);
        if (plantData.length > 0) {
          setSelectedPlant(plantData[0]._id);
        }
      } catch (error) {
        console.error(" Error fetching plants:", error);
        setError("Failed to load plants. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchPlants();
  }, []);  // Function to fetch alarm count (defined at component scope level so it can be used by WebSocket handlers)
  const fetchAlarmCount = useCallback(async () => {
    if (!selectedDevice) return;
    
    try {
      // If you have an API endpoint for alarm count, use it here
      // Example: const response = await axios.get(`/api/alarms/count?deviceId=${selectedDevice}`);
      // setLocalAlarmCount(response.data.count);
      
      // For now, we'll just increment the local count
      console.log('Refreshing alarm count');
    } catch (error) {
      console.error('Error fetching alarm count:', error);
    }
  }, [selectedDevice]);

  // Load initial alarm count
  useEffect(() => {
    fetchAlarmCount();
    
    // Set up interval to refresh alarm count (optional)
    // const interval = setInterval(fetchAlarmCount, 60000); // Every minute
    
    // return () => clearInterval(interval);
    return () => {};
  }, [selectedDevice]);
  
  // Define API fetch functions using useCallback to prevent unnecessary re-renders
  
  // Function to fetch latest telemetry entry via API
  const fetchLatestEntry = useCallback(async () => {
    if (!selectedDevice) return;
  
    try {
      const data = await getLatestTelemetryEntry(selectedDevice);
      console.log("Latest telemetry entry:", data);
      if (data) {
        // Properly normalize the data structure
        const normalized = {
          alerts: Array.isArray(data.alerts) ? data.alerts : [],
          temperature: typeof data.temperature === 'object' ? 
            data.temperature.value : 
            typeof data.temperature === 'number' ? 
              data.temperature : 0,
          humidity: typeof data.humidity === 'object' ? 
            data.humidity.value : 
            typeof data.humidity === 'number' ? 
              data.humidity : 0,
          oilLevel: typeof data.oilLevel === 'object' ? 
            data.oilLevel.value : 
            typeof data.oilLevel === 'number' ? 
              data.oilLevel : 0
        };

        console.log("Normalized latest entry:", normalized);
        setLatestEntry(normalized);
        setConnectionStatus("connected");
      } else {
        setLatestEntry(null);
        setConnectionStatus("no data");
      }
    } catch (error) {
      console.error(" Error fetching latest telemetry:", error);
      setLatestEntry(null);
      setConnectionStatus("error");
    }
  }, [selectedDevice]);

  // Function to fetch realtime telemetry data via API
  const fetchRealtimeData = useCallback(async () => {
    if (!selectedDevice) return;

    try {
      const data = await getRealtimeTelemetryData(selectedDevice);
      setRealtimeData(data);
    } catch (error) {
      console.error(" Error fetching realtime data:", error);
      setError("Failed to fetch realtime data.");
    }
  }, [selectedDevice]);
  
  // Function to fetch historical telemetry data via API
  const fetchHistoricalData = useCallback(async () => {
    if (!selectedDevice) {
      setTelemetryData([]);
      return;
    }
   
    try {
      const data = await getTelemetryData(selectedDevice);
      if (data?.length > 0) {
        const processedData = data.map(entry => ({
          ...entry,
          temperature: entry.temperature?.value || entry.temperature || 0,
          oilLevel: entry.oilLevel?.value || entry.oilLevel || 0,
          timestamp: entry.timestamp
        }));
        
        setTelemetryData(processedData.slice(0, 20));
        setError(null);
      }
    } catch (error) {
      console.error(" Error fetching historical data:", error);
      setError("Failed to fetch telemetry data.");
    }
  }, [selectedDevice]);
  
  // Track initial data loading state
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  // Track data source for UI display
  const [dataSource, setDataSource] = useState('loading');
  // Add device data state to store current telemetry values
  const [deviceData, setDeviceData] = useState({});
  
  // Function to add new data points to real-time graphs
  const addRealtimeDataPoint = useCallback((data) => {
    // Add the new data point to telemetryData for graph updates
    // This is helpful to keep the graphs updating with real-time data
    setTelemetryData(prevData => {
      // If we have no previous data, just return the new data point as an array
      if (!prevData || prevData.length === 0) {
        return [data];
      }
      
      // Create a copy of previous data and add the new point
      const newData = [...prevData];
      
      // Add the new point at the beginning (most recent)
      newData.unshift({
        ...data,
        // Ensure timestamp is properly formatted
        timestamp: new Date(data.timestamp).toISOString()
      });
      
      // Keep only the latest 50 points to prevent memory issues
      return newData.slice(0, 50);
    });
  }, []);
  
  // Key useEffect to implement the hybrid approach: 
  // 1. Initial data load via API
  // 2. Then WebSockets for real-time updates
  useEffect(() => {
    // Initial connection setup - do this regardless of device selection
    // Ensure socket is connected when component mounts
    if (!socketService.isConnected()) {
      console.log('🔌 TelemetryDashboard: Initializing socket connection');
      socketService.connect();
    }
    
    if (!selectedDevice) return;
    
    // Function to fetch latest telemetry entry via API
    const fetchLatestEntry = async () => {
      try {
        console.log('Fetching latest telemetry data for device:', selectedDevice);
        const data = await getLatestTelemetryEntry(selectedDevice);
        if (data) {
          console.log('Latest telemetry data:', data);
          setLatestEntry(data);
          // Also update device data with this entry
          setDeviceData(prevData => ({
            ...prevData,
            ...data
          }));
        }
      } catch (error) {
        console.error('Error fetching latest telemetry entry:', error);
      }
    };
    
    // Mark that we're starting to load initial data
    window.initialDataLoadTime = Date.now();
    setInitialDataLoaded(false);
    setDataSource('loading');
    
    // Set up WebSocket listeners right away
    const actualDeviceId = deviceIdMap[selectedDevice] || selectedDevice;
    if (typeof setupWebSocketListeners === 'function') {
      setupWebSocketListeners(actualDeviceId, selectedPlant);
    }
    
    // Get initial data via API
    fetchLatestEntry();
    fetchRealtimeData();
    
    // Force a small delay and then resubscribe to ensure socket subscription works
    setTimeout(() => {
      if (socketService.isConnected()) {
        console.log(`🔄 Resubscribing to ${actualDeviceId} to ensure connection`);
        socketService.subscribeToDevice(actualDeviceId);
      }
    }, 2000);
  }, [selectedDevice, selectedPlant, deviceIdMap, fetchRealtimeData]);

  // ...

  // Function to clean up any existing WebSocket subscriptions
  const cleanupWebSockets = () => {
    console.log('WebSocket cleanup - removing listeners and subscriptions');
    
    // Use the cleanup function returned by socketService
    if (socketCleanupRef.current) {
      socketCleanupRef.current();
      socketCleanupRef.current = null;
    }
    
    // Reset processed data cache to avoid missing future updates
    processedDataRef.current.clear();
    
    // Clear existing subscriptions
    if (activeDeviceRef.current && socketService.isConnected()) {
      console.log(`Unsubscribing from device: ${activeDeviceRef.current}`);
      socketService.removeListener('telemetry', handleTelemetryData);
      socketService.removeListener('alarm', handleAlarmData);
      activeDeviceRef.current = null;
    }
    
    if (activePlantRef.current && socketService.isConnected()) {
      console.log(`Unsubscribing from plant: ${activePlantRef.current}`);
      activePlantRef.current = null;
    }
  };
  
  // Handler for telemetry data
  const handleTelemetryData = (data) => {
    // Check if this data is for our currently selected device
    const dataDeviceId = data?.device || data?.deviceId || '';
    
    // Check for duplicate data using the _uniqueId added by socketService
    const dataSignature = data._uniqueId || `${dataDeviceId}-${data.timestamp || Date.now()}`;
    
    // Log the incoming data for debugging
    console.log(`📊 Received telemetry data: ${dataSignature} for device ${dataDeviceId}`);
    
    // Skip if we've already processed this exact data packet
    if (processedDataRef.current.has(dataSignature)) {
      console.log(`⏭️ Skipping duplicate data: ${dataSignature}`);
      return;
    }
    
    // Add to processed set with limited size (keep last 100 entries)
    processedDataRef.current.add(dataSignature);
    if (processedDataRef.current.size > 100) {
      // Remove oldest entries when we have too many
      const iterator = processedDataRef.current.values();
      processedDataRef.current.delete(iterator.next().value);
    }
    
    // Always process WebSocket data
    console.log(`📡 Processing WebSocket telemetry for device: ${dataDeviceId}`);
    setDataSource('websocket'); // Update data source indicator
    
    // Update UI state with the new data
    if (data) {
      // Format the data for UI components
      const formattedData = {
        timestamp: new Date(data.receivedTimestamp || data.timestamp || new Date()).toISOString(),
        temperature: data.temperature || 0,
        humidity: data.humidity || 0,
        distance: data.distance || 0,
        alcoholLevel: data.alcoholLevel || data.alcohol || 0,
        oilLevel: data.oilLevel || 0,
        deviceId: data.deviceId || data.device,
        plantName: data.plantName
      };
      
      // Log important values for monitoring
      console.log(`📊 WebSocket data - Temp: ${formattedData.temperature}°C | Humidity: ${formattedData.humidity}% | Time: ${formattedData.timestamp}`);
      
      // 1. Update latest telemetry entry (for metric circles)
      setLatestEntry(prev => ({
        ...prev,
        temperature: formattedData.temperature,
        humidity: formattedData.humidity,
        oilLevel: formattedData.oilLevel
      }));
      
      // 2. Update device data (for dashboard header)
      setDeviceData(prevData => ({ ...prevData, ...formattedData }));
      
      // 3. Update real-time data table (add new entry at top)
      setRealtimeData(prevData => {
        // Create new array with new data at the beginning
        return [formattedData, ...prevData.slice(0, 19)];
      });
      
      // 4. Add new point to real-time graph
      addRealtimeDataPoint(formattedData);
      
      // Force WebSocket connection status to connected
      setConnectionStatus('connected');
    }
  };
  
  // Handler for alarm data
  const handleAlarmData = (data) => {
    // Only process data if we have it
    if (data) {
      console.log(`🚨 Received alarm data via WebSocket: ${data?.alarmCode || 'unknown alarm'}`);
      
      // Simply update the alarm count
      setLocalAlarmCount(prevCount => prevCount + 1);
    }
  };
  
  // Function to set up WebSocket listener for telemetry data
  const setupWebSocketListeners = (deviceId, plantId) => {
    console.log('Setting up WebSocket listeners for device:', deviceId, 'plant:', plantId);
    
    // First clean up any existing listeners
    cleanupWebSockets();
    
    // If socket isn't connected, connect it first
    if (!socketService.isConnected()) {
      console.log('🔄 Socket not connected - connecting first...');
      socketService.connect();
    }
    
    // Only proceed with WebSocket setup if we have a valid device ID
    if (!deviceId) {
      console.log('⚠️ No device selected, skipping WebSocket setup');
      return;
    }
    
    // Store the cleanup function returned by onTelemetry
    socketCleanupRef.current = socketService.onTelemetry(handleTelemetryData, deviceId);
    
    // Always subscribe to esp32_04 which generates the most data
    console.log('📡 Subscribing to esp32_04 device');
    
    socketService.subscribeToDevice('esp32_04');
    
    // Subscribe to this specific device
    console.log(`📡 Subscribing to device: ${deviceId}`);
    socketService.subscribeToDevice(deviceId);
    
    // Subscribe to selected plant
    if (plantId) {
      console.log(`🏭 Subscribing to plant: ${plantId}`);
      socketService.subscribeToPlant(plantId);
    }
    
    // Store active device for cleanup
    activeDeviceRef.current = deviceId;
    activePlantRef.current = plantId;
    
    // Also listen for alarm data
    socketService.onAlarm(handleAlarmData);
  };
  
  // Set up WebSocket data listeners when device changes
  useEffect(() => {
    if (!realtimeEnabled || !selectedDevice) return;
    
    const actualDeviceId = deviceIdMap[selectedDevice] || selectedDevice;
    console.log(`🔄 Device changed to ${actualDeviceId} - setting up new WebSocket listeners`);
    
    // Set up WebSocket listeners for the selected device
    setupWebSocketListeners(actualDeviceId, selectedPlant);
    
    // Clean up listeners on unmount or when device changes
    return () => {
      cleanupWebSockets();
    };
  }, [realtimeEnabled, selectedDevice, selectedPlant, deviceIdMap]);
  
  // Fetch devices when plant selection changes
  useEffect(() => {
    const fetchDevices = async () => {
      if (!selectedPlant) {
        setDevices([]);
        return;
      }

      try {
        setLoading(true);
        const data = await getDevices(selectedPlant);
        
        if (data && data.length > 0) {
          setDevices(data);
          
          // Build device ID mapping (MongoDB ID -> actual device ID)
          const mapping = {};
          data.forEach(device => {
            // Map specific devices based on naming conventions
            if (device.deviceName) {
              if (device.deviceName.toLowerCase().includes('esp32_04')) {
                mapping[device._id] = 'esp32_04';
              } else if (device.deviceName.toLowerCase().includes('esp32_02')) {
                mapping[device._id] = 'esp32_02';
              } else if (device.deviceName.toLowerCase().includes('esp32')) {
                mapping[device._id] = 'esp32';
              } else {
                // Use the MongoDB ID as a fallback
                mapping[device._id] = device._id;
              }
                  console.log(`Mapped ${device.deviceName} (${device._id}) → ${mapping[device._id]}`);
            }
          });
          
          console.log('Created device ID mapping:', mapping);
          setDeviceIdMap(mapping);
          
          // Default to first device if none selected
          if (!selectedDevice && data.length > 0) {
            setSelectedDevice(data[0]._id);
          }
        } else {
          setDevices([]);
        }
      } catch (error) {
        console.error('Error fetching devices:', error);
        setError("Failed to load devices. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    
    fetchDevices();
  }, [selectedPlant, selectedDevice]);
  
  useEffect(() => {
    const fetchThreshold = async () => {
      if (selectedDevice && selectedConfigType) {
        const threshold = await getThresholdValue(selectedDevice, selectedConfigType.toLowerCase());
        setCurrentThreshold(threshold);
      }
    };
    fetchThreshold();
  }, [selectedDevice, selectedConfigType]);

  const handleThresholdUpdate = async () => {
    if (!selectedMetric || !newThreshold || isNaN(newThreshold)) {
      alert("Please select a metric and enter a valid number");
      return;
    }
    
    try {
      const success = await updateThresholdValue(selectedDevice, selectedMetric, parseFloat(newThreshold));
      
      if (success) {
        alert(`${selectedMetric.charAt(0).toUpperCase() + selectedMetric.slice(1)} threshold updated successfully!`);
        setCurrentThreshold(newThreshold);
        setNewThreshold('');
        // Reset the dropdown selection to allow selecting other parameters
        setTimeout(() => {
          // Brief delay to prevent React state update conflicts
          setSelectedMetric('');
        }, 100);
      } else {
        alert("Failed to update threshold. Try again.");
      }
    } catch (error) {
      console.error("Error updating threshold:", error);
      alert("Failed to update threshold. Try again.");
    }
  };

  const handleRestartDevice = async () => {
    if (!selectedDevice) {
      alert("Please select a device first");
      return;
    }
    
    if (window.confirm(`Are you sure you want to restart this device?`)) {
      try {
        const success = await restartDevice(selectedDevice);
        
        if (success) {
          alert("Restart command sent successfully!");
        } else {
          alert("Failed to restart device. Try again.");
        }
      } catch (error) {
        console.error("Error restarting device:", error);
        alert("Failed to restart device. Try again.");
      }
    }
  };
  
  useEffect(() => {
    if (!selectedDevice) return;
    console.log(`Device selected: ${selectedDevice}, WebSocket enabled: ${realtimeEnabled}`);
    
    // HYBRID APPROACH: Always load initial data via API, then use WebSockets for updates
    console.log(' Loading initial data via API for device:', selectedDevice);
    setLoading(true);
    
    // Load initial data via API calls
    window.initialDataLoadTime = Date.now(); // Track when we started loading
    
    Promise.all([
      fetchLatestEntry(),
      fetchRealtimeData(),
      fetchHistoricalData()
    ]).then(() => {
      console.log(' Initial API data loaded successfully at', new Date().toLocaleTimeString());
      setLoading(false);
      setInitialDataLoaded(true); // Mark initial data as loaded
    }).catch(error => {
      console.error('Error loading initial data:', error);
      setLoading(false);
    });
    
    // Set up different intervals based on WebSocket connection status
    let latestInterval, realtimeInterval, historicalInterval;
    
    // if (!realtimeEnabled || !socketService.isConnected()) {
    //   console.log(' WebSockets inactive/disabled - using recurring API calls');
    //   // If WebSockets are disabled or not connected, rely on regular API polling
    //   latestInterval = setInterval(fetchLatestEntry, 3000);     // Every 3 seconds
    //   realtimeInterval = setInterval(fetchRealtimeData, 5000);  // Every 5 seconds
    //   historicalInterval = setInterval(fetchHistoricalData, 15000); // Every 15 seconds
    // } else {
    //   console.log(' WebSockets active - Using WebSockets for real-time updates');
    //   // When WebSockets are active, only poll historical data occasionally
    //   // Real-time data will come from WebSockets
    //   historicalInterval = setInterval(fetchHistoricalData, 30000); // Every 30 seconds
    // }
    
    // Return cleanup function
    return () => {
      console.log('Cleaning up intervals');
      if (latestInterval) clearInterval(latestInterval);
      if (realtimeInterval) clearInterval(realtimeInterval);
      if (historicalInterval) clearInterval(historicalInterval);
    };
  }, [selectedDevice, fetchLatestEntry, fetchRealtimeData, fetchHistoricalData, realtimeEnabled, socketService]);
  
  const handlePlantChange = (e) => {
    const plantId = e.target.value;
    setSelectedPlant(plantId);
    setSelectedDevice("");
    clearDeviceCache();
    
    // Reset data states when plant changes
    setTelemetryData([]);
    setRealtimeData([]);
    setLatestEntry(null);
    setError(null);
    
    // IMPORTANT: Clear the alarm cache when changing plants
    socketService.clearAlarmCache();
    setLocalAlarmCount(0); // Reset the alarm count
    setAlarmsInitialized(false); // Force alarm data to be reloaded
    
    // Clear any active device subscription
    if (activeDeviceRef.current) {
      activeDeviceRef.current = null;
    }
    
    // Unsubscribe from any previous plant or device subscriptions
    if (activePlantRef.current) {
      console.log(`Unsubscribing from previous plant: ${activePlantRef.current}`);
      socketService.unsubscribeFromPlant(activePlantRef.current);
      activePlantRef.current = null;
    }
    
    if (activeDeviceRef.current) {
      console.log(`Unsubscribing from previous device: ${activeDeviceRef.current}`);
      socketService.unsubscribeFromDevice(activeDeviceRef.current);
      activeDeviceRef.current = null;
    }
    
    // Subscribe to plant data on WebSocket
    if (plantId && socketService.isConnected()) {
      // Map plant MongoDB ID to numeric ID expected by backend
      // The backend expects plantId as 1 (Plant C) or 2 (Plant D)
      let numericPlantId;
      
      try {
        // Look at the plant name to determine the correct numeric ID
        const selectedPlantObj = plants.find(p => p._id === plantId);
        if (selectedPlantObj) {
          if (selectedPlantObj.plantName.includes('D')) {
            numericPlantId = 2; // Plant D
          } else {
            numericPlantId = 1; // Plant C or other
          }
          console.log(`Mapped plant ${selectedPlantObj.plantName} (${plantId}) to numeric ID: ${numericPlantId}`);
        } else {
          console.warn(`Could not find plant with ID: ${plantId}`);
          numericPlantId = plantId; // Fallback to original ID
        }
      } catch (err) {
        console.error('Error mapping plant ID:', err);
        numericPlantId = plantId; // Fallback to original ID
      }
      
      console.log(`Subscribing to plant: ${numericPlantId}`);
      socketService.subscribeToPlant(numericPlantId);
      activePlantRef.current = numericPlantId;
    } else {
      activePlantRef.current = null;
    }
  };
  
  const debouncedLoading = useCallback((value) => {
    setTimeout(() => setLoading(value), value ? 0 : 300);
  }, []);

  const handleDeviceChange = (e) => {
    const newDeviceId = e.target.value;
    debouncedLoading(true);
    setSelectedDevice(newDeviceId);
    clearDeviceCache(newDeviceId);
    
    // Reset data states when device changes
    setTelemetryData([]);
    setRealtimeData([]);
    setLatestEntry(null);
    setError(null);
    
    // IMPORTANT: Clear the alarm cache when changing devices
    socketService.clearAlarmCache();
    setLocalAlarmCount(0); // Reset the alarm count
    setAlarmsInitialized(false); // Force alarm data to be reloaded
    
    // Properly clean up previous subscriptions before creating new ones
    if (activeDeviceRef.current) {
      console.log(`Unsubscribing from previous device: ${activeDeviceRef.current}`);
      socketService.unsubscribeFromDevice(activeDeviceRef.current);
      activeDeviceRef.current = null;
    }
    
    // The plant subscription should remain active since we're just changing devices within the same plant
    // But we'll make sure we don't have duplicate plant references
    if (activePlantRef.current && activePlantRef.current !== selectedPlant) {
      console.log(`Unsubscribing from unrelated plant: ${activePlantRef.current}`);
      socketService.unsubscribeFromPlant(activePlantRef.current);
      activePlantRef.current = null;
    }
    
    if (newDeviceId) {
      // Get the actual device identifier from our mapping
      const actualDeviceId = deviceIdMap[newDeviceId] || newDeviceId;
      
      console.log(`Device selected: MongoDB ID ${newDeviceId} maps to actual device ID ${actualDeviceId}`);
      
      // Subscribe to new device on WebSocket using the actual device ID
      if (socketService.isConnected()) {
        console.log(`Establishing NEW WebSocket subscription to device: ${actualDeviceId}`);
        socketService.subscribeToDevice(actualDeviceId);
        activeDeviceRef.current = actualDeviceId;
      } else {
        console.warn('Socket not connected - cannot subscribe to device updates');
      }
    } else {
      activeDeviceRef.current = null;
    }
  };
  
  // Toggle realtime data updates
  const toggleRealtime = () => {
    setRealtimeEnabled(prev => !prev);
  };
  
  const getConnectionStatus = () => {
    switch (connectionStatus) {
      case "connected": return "Connected";
      case "disconnected": return "Disconnected";
      case "error": return "Connection Error";
      case "no data": return "No data available";
      default: return "Unknown";
    }
  };
  console.log("LAtest Entry:", latestEntry);
  const renderAlarmsTab = () => {
    // Find the selected plant name from the plants array
    const currentPlantName = plants.find(p => p._id === selectedPlant)?.plantName || '';
    
    // Find the selected device name from the devices array
    const currentDevice = devices.find(d => d._id === selectedDevice);
    const currentDeviceName = currentDevice?.deviceName || '';
    
    console.log(`Rendering AlarmsTab with plant: "${currentPlantName}" and device: "${currentDeviceName}"`);
    
    return (
      <>
        {/* Only display '0 Open Alerts' when there are actually no alarms */}
        {localAlarmCount === 0 && (
          <Box sx={{ textAlign: 'center', py: 2, mb: 2 }}>
            <Typography variant="h6">
              0 Open Alerts
            </Typography>
          </Box>
        )}
        
        {/* Render the actual AlarmsTab component with the required props */}
        <AlarmsTab 
          selectedDevice={currentDeviceName} 
          selectedPlant={currentPlantName}
        />
      </>
    );
  };

  // Fetch threshold value when a metric is selected
  useEffect(() => {
    if (selectedDevice && selectedMetric) {
      fetchThresholdValue();
    }
  }, [selectedDevice, selectedMetric]);
  
  // Fetch tolerance value when tolerance metric is selected
  useEffect(() => {
    if (selectedDevice && selectedToleranceMetric) {
      fetchToleranceValue();
    }
  }, [selectedDevice, selectedToleranceMetric]);
  
  // Fetch the current threshold value for the selected device and metric
  const fetchThresholdValue = async () => {
    try {
      const value = await getThresholdValue(selectedDevice, selectedMetric);
      setCurrentThreshold(value ? value.toString() : '');
    } catch (error) {
      console.error("Error fetching threshold:", error);
    }
  };
  
  // Fetch the current tolerance value for the selected device and metric
  const fetchToleranceValue = async () => {
    try {
      const value = await getToleranceValue(selectedDevice, selectedToleranceMetric);
      setCurrentTolerance(value ? value.toString() : '');
    } catch (error) {
      console.error("Error fetching tolerance:", error);
    }
  };
  
  // Handle tolerance update
  const handleToleranceUpdate = async () => {
    if (!selectedDevice || !selectedToleranceMetric || !newTolerance) return;
    
    try {
      const success = await updateToleranceValue(selectedDevice, selectedToleranceMetric, parseFloat(newTolerance));
      
      if (success) {
        setCurrentTolerance(newTolerance);
        setNewTolerance('');
        alert(`${selectedToleranceMetric.charAt(0).toUpperCase() + selectedToleranceMetric.slice(1)} tolerance updated successfully!`);
        // Reset the dropdown selection to allow selecting other parameters
        setTimeout(() => {
          // Brief delay to prevent React state update conflicts
          setSelectedToleranceMetric('');
        }, 100);
      } else {
        alert("Failed to update tolerance. Try again.");
      }
    } catch (error) {
      console.error("Error updating tolerance:", error);
      alert("Failed to update tolerance. Try again.");
    }
  };
  
  // Render the command center tab content
  const renderCommandCenterTab = () => (
    <Box>
      {/* Threshold Section Header */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        Threshold Settings
      </Typography>
      <Divider sx={{ mb: 2 }} />
      
      {/* Dropdown to choose metric for threshold */}
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Select Metric for Threshold</InputLabel>
        <Select
          value={selectedMetric}
          onChange={(e) => setSelectedMetric(e.target.value)}
          label="Select Metric for Threshold"
        >
          <MenuItem value="temperature">Temperature</MenuItem>
          <MenuItem value="humidity">Humidity</MenuItem>
          <MenuItem value="oilLevel">Oil Level</MenuItem>
        </Select>
      </FormControl>

      {/* Show current threshold */}
      {currentThreshold !== null && selectedMetric && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1">
            Current Threshold for {selectedMetric.charAt(0).toUpperCase() + selectedMetric.slice(1)}: <strong>{currentThreshold}</strong>
          </Typography>
        </Box>
      )}

      {/* Input to update threshold */}
      <TextField
        label="New Threshold Value"
        variant="outlined"
        fullWidth
        value={newThreshold}
        onChange={(e) => {
          const value = e.target.value;
          if (/^\d*\.?\d*$/.test(value)) {
            setNewThreshold(value); // Only numbers allowed
          }
        }}
        sx={{ mb: 2 }}
      />

      {/* Update Threshold Button */}
      <Button
        variant="contained"
        fullWidth
        onClick={handleThresholdUpdate}
        disabled={!selectedMetric || !newThreshold}
        sx={{ mb: 2 }}
      >
        Update Threshold
      </Button>
      
      {/* Tolerance Section Header */}
      <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>
        Tolerance Settings
      </Typography>
      <Divider sx={{ mb: 2 }} />
      
      {/* Dropdown to choose tolerance metric */}
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Select Metric for Tolerance</InputLabel>
        <Select
          value={selectedToleranceMetric}
          onChange={(e) => setSelectedToleranceMetric(e.target.value)}
          label="Select Metric for Tolerance"
        >
          <MenuItem value="temperature">Temperature</MenuItem>
          <MenuItem value="humidity">Humidity</MenuItem>
          <MenuItem value="oilLevel">Oil Level</MenuItem>
        </Select>
      </FormControl>
      
      {/* Show current tolerance */}
      {currentTolerance !== null && selectedToleranceMetric && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1">
            Current Tolerance for {selectedToleranceMetric.charAt(0).toUpperCase() + selectedToleranceMetric.slice(1)}: <strong>{currentTolerance}</strong>
          </Typography>
        </Box>
      )}

      {/* Input to update tolerance */}
      <TextField
        label="New Tolerance Value"
        variant="outlined"
        fullWidth
        value={newTolerance}
        onChange={(e) => {
          const value = e.target.value;
          if (/^\d*\.?\d*$/.test(value)) {
            setNewTolerance(value); // Only numbers allowed
          }
        }}
        sx={{ mb: 2 }}
      />

      {/* Update Tolerance Button */}
      <Button
        variant="contained"
        fullWidth
        onClick={handleToleranceUpdate}
        disabled={!selectedToleranceMetric || !newTolerance}
        sx={{ mb: 2 }}
      >
        Update Tolerance
      </Button>

      {/* Restart Device Button */}
      <Button
        variant="contained"
        color="error"
        fullWidth
        onClick={handleRestartDevice}
      >
        Restart Device
      </Button>
    </Box>
  );
  
  const renderDeviceMetrics = () => {
    if (!latestEntry) {
      return (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Typography variant="body1" color="text.secondary">
            No telemetry data available for this device. Please check MongoDB connection.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            If this is a real device and data exists in MongoDB, check that device IDs match between the frontend and database.
          </Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ mt: 3 }}>
        <Typography variant="h6" fontWeight="bold" mb={2}>
          Device Metrics
        </Typography>
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-around', 
          flexWrap: 'wrap',
          mb: 3 
        }}>
          <MetricCircle 
            value={latestEntry.alerts?.length || 0}
            label="Open Alerts" 
            color="#f44336"
          />
          <MetricCircle 
            value={Number(latestEntry.temperature).toFixed(1)}
            label="Temperature" 
            color="#ff9800"
          />
          <MetricCircle 
            value={Number(latestEntry.humidity).toFixed(1)}
            label="Humidity" 
            color="#2196f3"
          />
          <MetricCircle 
            value={Number(latestEntry.oilLevel).toFixed(1)}
            label="Oil Level" 
            color="#4caf50"
          />
        </Box>
      </Box>
    );
  };

  const temperatureChartData = {
    labels: telemetryData?.map(entry => new Date(entry.timestamp).toLocaleTimeString()) || [],
    datasets: [{
      label: 'Temperature',
      data: telemetryData?.map(entry => {
        if (typeof entry.temperature === 'object') {
          return entry.temperature.value || 0;
        }
        return entry.temperature || 0;
      }) || [],
      borderColor: '#ff9800',
      tension: 0.1
    }]
  };
  
  const oilLevelChartData = {
    labels: telemetryData?.map(entry => new Date(entry.timestamp).toLocaleTimeString()) || [],
    datasets: [{
      label: 'Oil Level',
      data: telemetryData?.map(entry => {
        if (typeof entry.oilLevel === 'object') {
          return entry.oilLevel.value || 0;
        }
        return entry.oilLevel || 0;
      }) || [],
      borderColor: '#4caf50',
      tension: 0.1
    }]
  };

  // Update the table rendering section in renderCharts
  const renderCharts = () => {
    if (!selectedDevice || realtimeData.length === 0) {
      return (
        <Box sx={{ textAlign: 'center', py: 3, mt: 3 }}>
          <Typography variant="body1" color="text.secondary">
            No telemetry data available for this device in MongoDB.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Please select a device that has data stored in the MongoDB container.
          </Typography>
        </Box>
      );
    }

    return (
      <>
        <Grid container spacing={3} sx={{ mt: 2 }}>
          <Grid item xs={12} md={6}>
            <Typography variant="h6" mb={1}>Temperature Over Time</Typography>
            <Paper sx={{ p: 2, height: 250 }}>
              <Line data={temperatureChartData} options={chartOptions} />
            </Paper>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Typography variant="h6" mb={1}>Oil Level Over Time</Typography>
            <Paper sx={{ p: 2, height: 250 }}>
              <Line data={oilLevelChartData} options={chartOptions} />
            </Paper>
          </Grid>
        </Grid>

        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" mb={1}>Latest Readings</Typography>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Timestamp</TableCell>
                  <TableCell>Temperature (°C)</TableCell>
                  <TableCell>Oil Level (%)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {telemetryData.length > 0 ? (
                  telemetryData.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        {new Date(item.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {typeof item.temperature === 'object' && item.temperature.value !== undefined
                          ? item.temperature.value
                          : typeof item.temperature === 'number'
                          ? item.temperature
                          : '0'}
                      </TableCell>
                      <TableCell>
                        {typeof item.oilLevel === 'object' && item.oilLevel.value !== undefined
                          ? item.oilLevel.value
                          : typeof item.oilLevel === 'number'
                          ? item.oilLevel
                          : '0'}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} align="center">No data available</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </>
    );
  };

  // Empty section - notification functions removed
  
  const dashboardContent = (
    <Container maxWidth="lg" sx={{ mt: 0.6, mb: 4 }}>
      <Typography variant="h4" fontWeight="bold" mb={3}>
        Telemetry Dashboard
      </Typography>
      
      {/* Plant and Device Selection */}
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel id="plant-select-label">Select Plant</InputLabel>
            <Select
              labelId="plant-select-label"
              value={selectedPlant}
              onChange={handlePlantChange}
              label="Select Plant"
              disabled={loading}
            >
              {plants.map((plant) => (
                <MenuItem key={plant._id} value={plant._id}>
                  {plant.plantName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <FormControl fullWidth sx={{ mb: 2 }} disabled={!selectedPlant || loading}>
            <InputLabel id="device-select-label">Select Device</InputLabel>
            <Select
              labelId="device-select-label"
              value={selectedDevice}
              onChange={handleDeviceChange}
              label="Select Device"
            >
              {devices.map((device) => (
                <MenuItem key={device._id} value={device._id}>
                  {device.deviceName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      {/* Loading indicator */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}
      
      {/* Tab navigation with new Tabs component */}
      {selectedDevice && !loading && (
        <>
          {/* Using MUI Tabs component instead of custom buttons */}
          <Paper sx={{ mb: 3 }}>
            <Tabs 
              value={activeTab} 
              onChange={handleTabChange}
              indicatorColor="primary"
              textColor="primary"
              variant="fullWidth"
            >
              <Tab 
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <span>Status</span>
                    {activeTab === "status" && (
                      <Typography variant="caption" sx={{ ml: 1 }}>
                        ({getConnectionStatus()})
                      </Typography>
                    )}
                  </Box>
                } 
                value="status" 
              />
              <Tab 
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <span>Alarms</span>
                    <Typography variant="caption" sx={{ ml: 1 }}>
                      ({localAlarmCount || 0})
                    </Typography>
                  </Box>
                } 
                value="alarms" 
              />
              <Tab label="Command Center" value="cmd" />
            </Tabs>
          </Paper>

          {/* Error message */}
          {error && (
            <Paper 
              sx={{ 
                p: 2, 
                mb: 3, 
                bgcolor: 'error.light', 
                color: 'error.main',
                borderRadius: 1
              }}
            >
              <Typography>{error}</Typography>
            </Paper>
          )}
          
          {/* Tab content */}
          <Box>
            {activeTab === "status" && (
              <>
                {renderDeviceMetrics()}
                {renderCharts()}
              </>
            )}
            
            {activeTab === "alarms" && renderAlarmsTab()}
            
            {activeTab === "cmd" && renderCommandCenterTab()}
          </Box>
        </>
      )}
    </Container>
  );

  return <>{dashboardContent}</>;
};

export default TelemetryDashboard;