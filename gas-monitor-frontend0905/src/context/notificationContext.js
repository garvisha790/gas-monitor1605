import React, { createContext, useState, useContext, useEffect } from 'react';
import { getAllNotifications, getUnreadNotificationsCount } from '../services/notificationService';
import socketService from '../services/socketService';

const NotificationContext = createContext();

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(Date.now());

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllNotifications();
      console.log('Fetched notifications from API:', data);
      
      if (Array.isArray(data)) {
        setNotifications(data);
      } else {
        console.error('Invalid notifications data format:', data);
        setError('Invalid data format received from server');
        setNotifications([]);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      setError(error.message || 'Failed to fetch notifications');
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const count = await getUnreadNotificationsCount();
      setUnreadCount(count);
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
      setError(error.message);
    }
  };
 
  useEffect(() => {
    console.log('NotificationProvider: Initial data fetch');
    fetchNotifications();
    fetchUnreadCount();

    // Set up socket subscription for real-time notifications
    const handleNewNotification = (notification) => {
      console.log('Received new notification via socket:', notification);
      setLastUpdated(Date.now());
      
      // Add the new notification to the state
      setNotifications(prevNotifications => {
        // Check if notification already exists to prevent duplicates
        const exists = prevNotifications.some(n => 
          n._id === notification._id || n.NotificationId === notification.NotificationId
        );
        
        if (exists) {
          return prevNotifications;
        }
        
        // Add new notification at the beginning of the array
        return [notification, ...prevNotifications];
      });
      
      // Update unread count
      setUnreadCount(prev => prev + 1);
    };

    // Subscribe to notification events
    socketService.connect();
    
    // Subscribe to the notifications channel
    socketService.subscribeToNotifications();
    
    // Listen for new notifications
    socketService.onNotification(handleNewNotification);

    // Set up polling as a fallback to ensure notifications are updated
    const pollingInterval = setInterval(() => {
      console.log('NotificationProvider: Polling for updates');
      fetchNotifications();
      fetchUnreadCount();
    }, 10000); // Poll every 10 seconds

    // Cleanup function
    return () => {
      socketService.removeNotificationListeners();
      clearInterval(pollingInterval);
    };
  }, []);

  const refreshData = () => {
    console.log('NotificationProvider: Manual refresh triggered');
    fetchNotifications();
    fetchUnreadCount();
  };

  return (
    <NotificationContext.Provider value={{
      unreadCount,
      notifications,
      loading,
      error,
      refreshData
    }}>
      {children}
    </NotificationContext.Provider>
  );
};
