import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Button
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import { markAlarmAsRead, getAllAlarms, getAlarmsByDevice, getAlarmsByPlantAndDevice } from '../../services/alarmService';
import socketService from '../../services/socketService';

const AlarmsTab = ({ selectedDevice, selectedPlant }) => {
  // Use hybrid approach: initial data via API, then WebSocket for updates
  const [alarms, setAlarms] = useState([]);
  const [isLoading, setIsLoading] = useState(true); // Start with loading state
  const [error, setError] = useState(null);
  const [dataSource, setDataSource] = useState('loading'); // 'api', 'websocket', or 'loading'
  
  // UI state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Use a ref to keep track of all alarms to avoid state update issues
  const alarmsRef = useRef([]);
  
  // Load initial alarm data - check cache first, only fetch from API if necessary
  useEffect(() => {
    let isMounted = true;
    
    // Force clearing alarm data when plant or device changes
    console.log(`🔄 Plant or device selection changed - clearing alarm data`);
    console.log(`Current selection: Plant "${selectedPlant}", Device "${selectedDevice}"`);
    
    // Clear the alarm data in the component state
    alarmsRef.current = [];
    setAlarms([]);
    
    const loadAlarmsData = async () => {
      try {
        setIsLoading(true);
        setDataSource('loading');
        setError(null);
        
        // Only use cache if same plant AND device
        const cachedData = socketService.getCachedAlarmData();
        const cachedPlant = socketService.cache?.currentPlant;
        const cachedDevice = socketService.cache?.currentDevice;
        
        const useCache = cachedData.isLoaded && 
                        cachedData.data.length > 0 && 
                        cachedPlant === selectedPlant && 
                        cachedDevice === selectedDevice;
        
        // Log cache status for debugging
        console.log(`Cache status: useCache=${useCache}, cachedPlant=${cachedPlant}, selectedPlant=${selectedPlant}`);
        console.log(`cachedDevice=${cachedDevice}, selectedDevice=${selectedDevice}`);
        
        if (useCache) {
          // Use cached data instead of making a new API call
          console.log('💾 Using cached alarm data from previous session:', cachedData.data.length, 'items');
          console.log('⏱️ Last fetch time:', new Date(cachedData.lastFetchTime).toLocaleString());
          
          if (isMounted) {
            alarmsRef.current = cachedData.data;
            setAlarms(cachedData.data);
            setDataSource('cache');
            setIsLoading(false);
          }
          return;
        }
        
        // If we're not using cache, clear it for the new selection
        socketService.clearAlarmCache();
        
        // Store current plant/device selection in cache
        socketService.cache.currentPlant = selectedPlant;
        socketService.cache.currentDevice = selectedDevice;
        
        // No cached data or filters changed, fetch from API
        // Define data variable in the outer scope
        let data = [];
        
        if (selectedPlant) {
          console.log(`🔄 Fetching initial alarms for plant "${selectedPlant}"${selectedDevice ? ` and device "${selectedDevice}"` : ''} from MongoDB...`);
          
          // Use the new API endpoint that filters by plant and device
          data = await getAlarmsByPlantAndDevice(selectedPlant, selectedDevice);
          
          // Handle no data case
          if (!data || data.length === 0) {
            console.log(`⚠️ No alarms found for plant "${selectedPlant}"${selectedDevice ? ` and device "${selectedDevice}"` : ''}`);
            if (isMounted) {
              alarmsRef.current = [];
              setAlarms([]);
              setDataSource('api');
              // Cache the empty result and current selection
              socketService.cacheAlarmData([]);
            }
            return;
          }
            
          console.log('🔍 Fetched filtered alarms from API:', data.length);
          if (data.length > 0) {
            console.log('📄 First alarm sample:', data[0]);
          }
        } else {
          // If no plant is selected, fetch either device-specific or all alarms
          console.log(`🔄 Fetching initial alarms from MongoDB${selectedDevice ? ` for device ${selectedDevice}` : ''}...`);
          
          // Fetch alarms from the API - either for a specific device or all alarms
          data = selectedDevice 
            ? await getAlarmsByDevice(selectedDevice)
            : await getAllAlarms();
          
          // Handle no data case
          if (!data || data.length === 0) {
            console.log('⚠️ No alarms found in MongoDB database');
            if (isMounted) {
              alarmsRef.current = [];
              setAlarms([]);
              setDataSource('api');
              // Cache the empty result too
              socketService.cacheAlarmData([]);
            }
            return;
          }
            
          console.log('🔍 Fetched initial alarms from API:', data.length);
          console.log('📄 First alarm sample:', data[0]);
        }
        
        // Format the alarm data and ensure all fields are present
        // The backend now provides normalized data, but we'll still do some client-side validation
        const formattedAlarms = data.map(alarm => ({
          _id: alarm._id || `alarm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          AlarmId: alarm.AlarmId || alarm.alarmId || alarm.id || '',
          AlarmCode: alarm.AlarmCode || alarm.alarmCode || '',
          AlarmDescription: alarm.AlarmDescription || alarm.alarmDescription || alarm.description || '',
          CreatedTimestamp: alarm.CreatedTimestamp || alarm.createdTimestamp || alarm.timestamp || new Date().toISOString(),
          DeviceId: alarm.DeviceId || alarm.deviceId || '',
          DeviceName: alarm.DeviceName || alarm.deviceName || 'Unknown Device',
          PlantName: alarm.PlantName || alarm.plantName || '',
          IsActive: typeof alarm.IsActive !== 'undefined' ? alarm.IsActive : 
                   typeof alarm.isActive !== 'undefined' ? alarm.isActive : true,
          IsRead: typeof alarm.IsRead !== 'undefined' ? alarm.IsRead : 
                 typeof alarm.isRead !== 'undefined' ? alarm.isRead : false
        }));
        
        // Sort by timestamp in descending order (newest first)
        const sortedAlarms = formattedAlarms.sort((a, b) => {
          const dateA = new Date(a.CreatedTimestamp);
          const dateB = new Date(b.CreatedTimestamp);
          return dateB - dateA; // Descending order
        });
        
        // Log sample of final formatted data
        if (sortedAlarms.length > 0) {
          console.log('✅ Alarm data formatted successfully. Sample:', sortedAlarms[0]);
        }
        
        // Update the alarms state if component is still mounted
        if (isMounted) {
          alarmsRef.current = sortedAlarms;
          setAlarms(sortedAlarms);
          setDataSource('api');
          // Cache the data in socketService for persistence between tab switches
          socketService.cacheAlarmData(sortedAlarms);
        }
      } catch (error) {
        console.error('❌ Error fetching initial alarms:', error);
        if (isMounted) {
          setError(`Failed to load alarms data from MongoDB: ${error.message || 'Unknown error'}.`);
          alarmsRef.current = [];
          setAlarms([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    
    loadAlarmsData();
    
    // Cleanup function to prevent state updates if component unmounts
    return () => {
      isMounted = false;
    };
  }, [selectedDevice, selectedPlant]);
  
  // Handle new alarm data from WebSocket - only for new incoming alarms
  const handleNewAlarm = useCallback((alarmData) => {
    if (!alarmData) {
      console.log('⚠️ Received empty alarm data via WebSocket');
      return;
    }
    
    console.log('📢 Received new alarm via WebSocket:', alarmData);
    
    // Extract plant and device names from the alarm data with robust field detection
    const alarmPlantName = alarmData.PlantName || alarmData.plantName || '';
    const alarmDeviceName = alarmData.DeviceName || alarmData.deviceName || '';
    
    console.log(`Alarm Plant: "${alarmPlantName}", Selected Plant: "${selectedPlant}"`);
    console.log(`Alarm Device: "${alarmDeviceName}", Selected Device: "${selectedDevice}"`);
    
    // Filter by plant name if selectedPlant is set - use case-insensitive comparison
    if (selectedPlant && alarmPlantName.toLowerCase() !== selectedPlant.toLowerCase()) {
      console.log(`🚫 Filtering out alarm: Plant "${alarmPlantName}" doesn't match selected plant "${selectedPlant}"`);
      return;
    }
    
    // Further filter by device name if selectedDevice is set - use case-insensitive comparison
    if (selectedDevice && alarmDeviceName.toLowerCase() !== selectedDevice.toLowerCase()) {
      console.log(`🚫 Filtering out alarm: Device "${alarmDeviceName}" doesn't match selected device "${selectedDevice}"`);
      return;
    }
    
    console.log(`✅ Alarm passed filtering: Plant "${alarmPlantName}", Device "${alarmDeviceName}"`);

    
    // Use more robust ID extraction and generation
    let alarmId = 
      alarmData._id || 
      alarmData.id || 
      alarmData.alarmId || 
      alarmData.AlarmId || 
      `alarm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      
    console.log(`🔍 Checking for existing alarm with ID: ${alarmId}`);
    
    // Check if this alarm already exists to prevent duplicates
    const existingAlarmIndex = alarmsRef.current.findIndex(a => 
      (a._id === alarmId) || 
      (a.AlarmId === alarmId) ||
      (alarmData.timestamp && a.CreatedTimestamp === alarmData.timestamp) ||
      (alarmData.AlarmCode && a.AlarmCode === alarmData.AlarmCode && 
       new Date(a.CreatedTimestamp).getTime() > Date.now() - 5000) // Within 5 seconds
    );
    
    if (existingAlarmIndex >= 0) {
      console.log(`⏭️ Skipping duplicate alarm with ID ${alarmId} - already in the list at index ${existingAlarmIndex}`);
      return;
    }
    
    setDataSource('websocket');
    
    // Format alarm data consistently with more robust field extraction
    const formattedAlarm = {
      _id: alarmId,
      AlarmId: alarmData.id || alarmData.alarmId || alarmData.AlarmId || alarmId,
      AlarmCode: alarmData.alarmCode || alarmData.AlarmCode || alarmData.code || '',
      AlarmDescription: 
        alarmData.description || 
        alarmData.alarmDescription || 
        alarmData.AlarmDescription || 
        alarmData.message || 
        'Unknown alarm',
      CreatedTimestamp: 
        alarmData.timestamp || 
        alarmData.createdTimestamp || 
        alarmData.CreatedTimestamp || 
        new Date().toISOString(),
      DeviceId: alarmData.deviceId || alarmData.DeviceId || '',
      DeviceName: alarmData.deviceName || alarmData.DeviceName || 'Unknown Device',
      PlantName: alarmData.plantName || alarmData.PlantName || '',
      IsActive: true,
      IsRead: false,
      Source: 'websocket' // Mark this as coming from WebSocket
    };
    
    console.log(`✅ Adding new alarm via WebSocket: ${formattedAlarm.AlarmCode} at ${formattedAlarm.CreatedTimestamp}`);
    
    // Add the new alarm at the top of the list (maintain descending timestamp order)
    const updatedAlarms = [formattedAlarm, ...alarmsRef.current];
    
    // Sort by timestamp in descending order (newest first) to ensure proper ordering
    updatedAlarms.sort((a, b) => {
      const dateA = new Date(a.CreatedTimestamp);
      const dateB = new Date(b.CreatedTimestamp);
      return dateB - dateA; // Descending order
    });
    
    // Update the ref and state
    alarmsRef.current = updatedAlarms;
    
    // Force a UI update with a new array reference
    setAlarms([...updatedAlarms]); 
    
    // Also add to the socketService cache for persistence between tab switches
    socketService.addAlarmToCache(formattedAlarm);
  }, []);
  
  // Connect to WebSocket for alarm updates - only for new incoming alarms after initial load
  useEffect(() => {
    // First check if socket is already connected
    const isSocketConnected = socketService.isConnected();
    console.log(`🔗 WebSocket connection status: ${isSocketConnected ? 'Connected' : 'Disconnected'}`);
    
    // Set up WebSocket connection once at component mount
    if (!isSocketConnected) {
      console.log('🔌 Connecting to WebSocket server for real-time alarms...');
      socketService.connect();
      
      // Add a reconnect handler for window focus events
      const handleFocus = () => {
        console.log('👁️ Window focused - checking WebSocket connection');
        if (!socketService.isConnected()) {
          console.log('🔄 Reconnecting WebSocket after focus');
          socketService.connect();
        }
      };
      
      window.addEventListener('focus', handleFocus);
      return () => window.removeEventListener('focus', handleFocus);
    }
  }, [isLoading, dataSource, handleNewAlarm]);
  
  // Connect to WebSocket for real-time alarm updates - only establish connection if not already done in TelemetryDashboard
  useEffect(() => {
    // Check if we should set up subscriptions in this component
    // We will only handle WebSocket messaging/listeners here, not connection establishment
    console.log('📶 Setting up WebSocket alarm messaging handlers...');
    
    // We already have socket connections established in TelemetryDashboard component
    // Just set up the event listeners for the alarms here
    
    // Set up a cleanup function for the socket listener to prevent memory leaks
    const removeAlarmListener = socketService.onAlarm(handleNewAlarm);
    const removeAlarmNotificationListener = socketService.onAlarmNotification(handleNewAlarm);
    
    console.log(`✅ WebSocket alarm listeners established for plant: "${selectedPlant}", device: "${selectedDevice}"`);
    
    return () => {
      // Cleanup subscription to prevent memory leaks
      console.log('🗑 Cleaning up WebSocket alarm listeners');
      removeAlarmListener();
      removeAlarmNotificationListener();
    };
  }, [handleNewAlarm, selectedDevice, selectedPlant]);
  
  // Effect to maintain socket connection
  useEffect(() => {
    // Setup ping interval to keep WebSocket connection alive
    const pingInterval = setInterval(() => {
      if (socketService.isConnected()) {
        // No need to actually send a ping - just checking the connection
        console.log('👁 WebSocket connection active');
      } else {
        console.log('🔄 WebSocket disconnected - attempting reconnect');
        socketService.connect();
      }
    }, 30000); // Check every 30 seconds
    
    return () => clearInterval(pingInterval);
  }, []);
 
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };
 
  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };
  
  const handleMarkAsRead = async (alarmId) => {
    try {
      // Try to mark the alarm as read (may not be needed in WebSocket-only implementation)
      await markAlarmAsRead(alarmId);
      
      // Update local state to mark the alarm as read
      setAlarms(prev => prev.map(alarm => 
        alarm._id === alarmId ? { ...alarm, IsRead: true } : alarm
      ));
      
    } catch (error) {
      console.error('Error marking alarm as read:', error);
    }
  };
  
  // Function to clear all alarms (for testing)
  const clearAlarms = () => {
    alarmsRef.current = [];
    setAlarms([]);
  };
 
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 2 }}>
      {/* Status and Debug Info */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Error: {error}
        </Alert>
      )}
      
      {alarms.length === 0 && !isLoading && !error && (
        <Alert severity="info" sx={{ mb: 2 }} icon={<InfoIcon />}>
          No alarms found!!!
        </Alert>
      )}
      
      {/* Data Source and WebSocket Status */}
      {/* <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="body2" color="text.secondary">
            <span style={{ color: socketService.isConnected() ? 'green' : 'red' }}>
              ●
            </span> WebSocket {socketService.isConnected() ? 'Connected' : 'Disconnected'}
          </Typography>
          
          <Typography variant="body2" color="text.secondary">
            Data Source: {dataSource === 'api' ? 'API (Initial Load)' : 
                         dataSource === 'websocket' ? 'WebSocket (Real-time)' : 'Loading...'}
          </Typography>
        </Box> */}
        
        {/* <Button
          onClick={clearAlarms}
          variant="outlined"
          size="small"
          color="warning"
        >
          Clear Alarms
        </Button>
      </Box> */}

      {/* Search Section */}
      <Paper elevation={2} sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Typography>Search</Typography>
            <input
              type="text"
              placeholder="Search by Alarm Code or Description"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ padding: '8px', width: '300px' }}
            />
          </Box>
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              setSearchQuery('');
              setFromDate('');
              setToDate('');
            }}
          >
            Clear Search
          </Button>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Typography>From Date</Typography>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ padding: '8px' }}
          />
          <Typography>To Date</Typography>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{ padding: '8px' }}
          />
        </Box>
      </Paper>

      {/* Alarms Table */}
      <Paper elevation={2}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Alarm Id</TableCell>
                <TableCell>Alarm Code</TableCell>
                <TableCell>Device Name</TableCell>
                <TableCell>Alarm Generated Time</TableCell>
                <TableCell>Alarm Description</TableCell>
                <TableCell>Alarm Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(alarms || [])
                .filter(alarm => {
                  // Apply search filter
                  const searchLower = searchQuery.toLowerCase();
                  const matchesSearch = searchQuery === '' ||
                    (alarm.AlarmCode && alarm.AlarmCode.toLowerCase().includes(searchLower)) ||
                    (alarm.AlarmDescription && alarm.AlarmDescription.toLowerCase().includes(searchLower));

                  // Apply date filters
                  const alarmDate = new Date(alarm.CreatedTimestamp);
                  
                  // From Date - start of the day
                  const fromDateObj = fromDate ? new Date(fromDate) : null;
                  const matchesFromDate = !fromDate || alarmDate >= fromDateObj;
                  
                  // To Date - end of the day (23:59:59)
                  let toDateObj = null;
                  if (toDate) {
                    toDateObj = new Date(toDate);
                    toDateObj.setHours(23, 59, 59, 999); // Set to end of day
                  }
                  const matchesToDate = !toDate || alarmDate <= toDateObj;

                  return matchesSearch && matchesFromDate && matchesToDate;
                })
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((alarm) => (
                  <TableRow key={alarm._id} hover>
                    <TableCell>{alarm.AlarmId || '-'}</TableCell>
                    <TableCell>{alarm.AlarmCode || '-'}</TableCell>
                    <TableCell>{alarm.DeviceName || '-'}</TableCell>
                    <TableCell>
                      {alarm.CreatedTimestamp ? 
                        new Date(alarm.CreatedTimestamp).toLocaleString('en-GB', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: false
                        }).replace(',', '') : '-'}
                    </TableCell>
                    <TableCell>{alarm.AlarmDescription || '-'}</TableCell>
                    <TableCell>
                      <Chip 
                        icon={<WarningIcon />} 
                        label={alarm.AlarmCode && alarm.AlarmCode.includes('HIGH') ? "HIGH" : "LOW"} 
                        color={alarm.AlarmCode && alarm.AlarmCode.includes('HIGH') ? "error" : "warning"} 
                        size="small" 
                        sx={{ minWidth: '90px' }}
                      />
                    </TableCell>
                    <TableCell>
                      {!alarm.IsRead && (
                        <Tooltip title="Mark as read">
                          <IconButton size="small" onClick={() => handleMarkAsRead(alarm._id)}>
                            <CheckCircleIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={(alarms || []).length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Paper>
    </Box>
  );
};

export default AlarmsTab;
 