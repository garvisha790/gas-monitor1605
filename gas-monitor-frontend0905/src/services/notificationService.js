import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// Fetch all notifications with optional filtering
export const getAllNotifications = async (type = null) => {
  try {
    console.log('🔍 NOTIFICATION SERVICE: Making API call to fetch notifications');
    const params = {};
    if (type) params.type = type;
    
    const url = `${API_URL}/api/notifications`;
    console.log('🔍 NOTIFICATION SERVICE: API URL:', url);
    
    const response = await axios.get(url, { params });
    console.log('🔍 NOTIFICATION SERVICE: API Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ NOTIFICATION SERVICE: Error fetching notifications:', error);
    throw error;
  }
};

// Get count of unread notifications
export const getUnreadNotificationsCount = async (type = null) => {
  try {
    const params = {};
    if (type) params.type = type;
    
    const response = await axios.get(`${API_URL}/api/notifications/unread/count`, { params });
    return response.data.count;
  } catch (error) {
    console.error('Error fetching unread notifications count:', error);
    return 0;
  }
};

// Mark a notification as read
export const markNotificationAsRead = async (notificationId) => {
  try {
    const response = await axios.put(`${API_URL}/api/notifications/${notificationId}/read`);
    return response.data;
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
};

// Mark all notifications as read
export const markAllNotificationsAsRead = async (type = null) => {
  try {
    const params = {};
    if (type) params.type = type;
    
    const response = await axios.put(`${API_URL}/api/notifications/read/all`, null, { params });
    return response.data;
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    throw error;
  }
};

// Get notifications for a specific device
export const getNotificationsByDevice = async (deviceId) => {
  try {
    const response = await axios.get(`${API_URL}/api/notifications/device/${deviceId}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching notifications for device ${deviceId}:`, error);
    throw error;
  }
};

export default {
  getAllNotifications,
  getUnreadNotificationsCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getNotificationsByDevice
};
