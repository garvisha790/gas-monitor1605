import axios from 'axios';
import api from './apiService';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000/api';

// Helper function to retry failed API calls
async function apiCallWithRetry(apiCall, maxRetries = 2) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Add a small delay before retrying to allow server recovery
      if (attempt > 0) {
        console.log(`Retry attempt ${attempt} for API call...`);
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt-1), 8000))); // Better exponential backoff with max delay
      }
      
      return await apiCall();
    } catch (error) {
      console.error(`API attempt ${attempt + 1}/${maxRetries + 1} failed:`, error);
      lastError = error;
      
      // Only retry on network errors, timeouts, or 5xx server errors
      const status = error.response?.status;
      const isServerError = status >= 500 && status < 600;
      const isNetworkError = !status && (error.code || error.message?.includes('timeout') || error.message?.includes('network'));
      
      if (!isServerError && !isNetworkError) {
        throw error; // Don't retry client errors (4xx) or other non-network errors
      }
      
      // On last attempt, just throw
      if (attempt === maxRetries) {
        throw lastError;
      }
    }
  }
}

export const getAllAlarms = async () => {
  try {
    console.log('Fetching all alarms from MongoDB database...');
    
    // Use retry helper for more reliable API calls
    const response = await apiCallWithRetry(() => api.get('/alarms'));
    
    // Process and validate alarm data
    const alarms = Array.isArray(response.data) ? response.data : [];
    
    // Log success and return formatted data
    console.log(`Successfully fetched ${alarms.length} alarms`);
    return alarms;
  } catch (error) {
    console.error('Error fetching alarms:', error);
    // Return empty array instead of throwing to avoid crashing the UI
    return [];
  }
};

export const getAlarmsByDevice = async (deviceId) => {
  if (!deviceId) {
    console.warn('No deviceId provided to getAlarmsByDevice');
    return [];
  }
  
  try {
    console.log(`Fetching alarms for device ${deviceId} from MongoDB database...`);
    
    // Use retry helper for more reliable API calls
    const response = await apiCallWithRetry(() => api.get(`/alarms/device/${deviceId}`));
    
    // Process and validate alarm data
    const alarms = Array.isArray(response.data) ? response.data : [];
    
    console.log(`Successfully fetched ${alarms.length} alarms for device ${deviceId}`);
    return alarms;
  } catch (error) {
    console.error(`Error fetching alarms for device ${deviceId}:`, error);
    // Return empty array instead of throwing
    return [];
  }
};

// Fetch alarms filtered by plant name and device name (if provided)
export const getAlarmsByPlantAndDevice = async (plantName, deviceName = null) => {
  if (!plantName) {
    console.warn('No plantName provided to getAlarmsByPlantAndDevice');
    return [];
  }
  
  try {
    console.log(`Fetching alarms for plant "${plantName}"${deviceName ? ` and device "${deviceName}"` : ''} from MongoDB database...`);
    
    // Build query parameters
    const params = { plantName };
    if (deviceName) params.deviceName = deviceName;
    
    // Use retry helper for more reliable API calls
    const response = await apiCallWithRetry(() => api.get('/alarms/filter', { params }));
    
    console.log('Raw response from alarm filter API:', response.data);
    
    // Extract alarms array from response with better error handling
    let alarms = [];
    if (response.data) {
      if (Array.isArray(response.data)) {
        // Handle case where response data is already an array
        alarms = response.data;
      } else if (response.data.alarms && Array.isArray(response.data.alarms)) {
        // Handle case where response data has an alarms property that is an array
        alarms = response.data.alarms;
      } else if (typeof response.data === 'object') {
        // Try to convert response to array if it's not already
        alarms = [response.data];
      }
    }
    
    console.log(`Successfully fetched ${alarms.length} alarms for plant "${plantName}"${deviceName ? ` and device "${deviceName}"` : ''}`);
    if (alarms.length > 0) {
      console.log('First alarm in response:', alarms[0]);
    }
    
    return alarms;
  } catch (error) {
    console.error(`Error fetching alarms for plant "${plantName}"${deviceName ? ` and device "${deviceName}"` : ''}:`, error);
    // Return empty array instead of throwing
    return [];
  }
};

export const getUnreadAlarmsCount = async () => {
  try {
    console.log('Fetching unread alarms count from MongoDB database...');
    
    // Use retry helper for more reliable API calls
    const response = await apiCallWithRetry(() => api.get('/alarms/unread/count'));
    
    // Ensure we have a valid count or default to 0
    const count = response.data && typeof response.data.count === 'number' ? response.data.count : 0;
    
    console.log(`Successfully fetched unread alarms count: ${count}`);
    return count;
  } catch (error) {
    console.error('Error fetching unread alarms count:', error);
    // Return 0 instead of throwing
    return 0;
  }
};

export const markAlarmAsRead = async (alarmId) => {
  if (!alarmId) {
    console.warn('No alarmId provided to markAlarmAsRead');
    return false;
  }
  
  try {
    console.log(`Marking alarm ${alarmId} as read...`);
    
    // Use retry helper for more reliable API calls
    const response = await apiCallWithRetry(() => api.put(`/alarms/${alarmId}/read`));
    
    // Check for success response
    const success = response && response.status >= 200 && response.status < 300;
    
    if (success) {
      console.log(`Successfully marked alarm ${alarmId} as read`);
    } else {
      console.warn(`Unexpected response when marking alarm ${alarmId} as read:`, response);
    }
    
    return success;
  } catch (error) {
    console.error(`Error marking alarm ${alarmId} as read:`, error);
    return false;
  }
};

export const markAllAlarmsAsRead = async () => {
  try {
    console.log('Marking all alarms as read...');
    
    // Use retry helper for more reliable API calls
    const response = await apiCallWithRetry(() => api.put('/alarms/read/all'));
    
    // Check for success response
    const success = response && response.status >= 200 && response.status < 300;
    
    if (success) {
      console.log('Successfully marked all alarms as read');
    } else {
      console.warn('Unexpected response when marking all alarms as read:', response);
    }
    
    return success;
  } catch (error) {
    console.error('Error marking all alarms as read:', error);
    return false;
  }
};

// Add a function to clear client-side alarm cache if needed
export const clearAlarmCache = () => {
  console.log('Clearing client-side alarm cache');
  // This function could be used when needed to force refresh from API
  // It can be called when the alarm data might be stale
};
 