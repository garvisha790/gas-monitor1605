import React, { useState, useEffect, useRef } from 'react';
import { 
  IconButton, 
  Badge, 
  Menu, 
  Typography, 
  List, 
  ListItem, 
  Box, 
  Button,
  Divider,
  Alert,
  Tabs,
  Tab
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import WarningIcon from '@mui/icons-material/Warning';
import BusinessIcon from '@mui/icons-material/Business';
import DevicesIcon from '@mui/icons-material/Devices';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import { useNavigate } from 'react-router-dom';
import { markAllAlarmsAsRead, markAlarmAsRead } from '../../services/alarmService';
import { markNotificationAsRead, markAllNotificationsAsRead } from '../../services/notificationService';
import socketService from '../../services/socketService';
import { useAlarms } from '../../context/alarmContext';
import { useNotifications } from '../../context/notificationContext';

const NotificationCenter = () => {
  const navigate = useNavigate();
  const { alarms: contextAlarms, unreadCount: alarmUnreadCount, refreshData: refreshAlarms } = useAlarms();
  const { notifications: contextNotifications, unreadCount: notificationUnreadCount, refreshData: refreshNotifications } = useNotifications();
  
  // State for notifications and UI
  const [anchorEl, setAnchorEl] = useState(null);
  const [currentTab, setCurrentTab] = useState(0); // 0 = All, 1 = Alarms, 2 = General
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Compute total unread count (alarm + notifications)
  const totalUnreadCount = alarmUnreadCount + notificationUnreadCount;
  
  // Initialize notifications from context
  const [notifications, setNotifications] = useState([]);
  
  // Update notifications when context changes
  useEffect(() => {
    // Combine all notifications (alarms and general)
    const combinedNotifications = [
      // Map alarms to a unified notification format
      ...contextAlarms.map(alarm => ({
        _id: alarm._id,
        type: 'alarm',
        title: alarm.AlarmCode || 'Alarm',
        message: alarm.AlarmDescription || 'New alarm',
        timestamp: alarm.CreatedTimestamp,
        isRead: alarm.IsRead,
        deviceId: alarm.DeviceId,
        deviceName: alarm.DeviceName,
        plantName: alarm.PlantName,
        originalData: alarm
      })),
      // Map general notifications
      ...contextNotifications.map(notification => ({
        _id: notification._id,
        type: notification.Type || 'general',
        title: notification.Title || 'Notification',
        message: notification.Message || '',
        timestamp: notification.CreatedTimestamp,
        isRead: notification.IsRead,
        deviceId: notification.DeviceId,
        deviceName: notification.DeviceName,
        plantId: notification.PlantId,
        plantName: notification.PlantName,
        originalData: notification
      }))
    ];
    
    // Sort by timestamp, newest first
    combinedNotifications.sort((a, b) => {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    
    setNotifications(combinedNotifications);
  }, [contextAlarms, contextNotifications]);
  
  // Handle menu open/close
  const handleOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };
  
  const handleClose = () => {
    setAnchorEl(null);
  };
  
  // Handle tab change
  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
  };
  
  // Navigate based on notification type
  const handleViewAll = () => {
    if (currentTab === 1) { // Alarms tab
      navigate('/telemetry-dashboard?tab=alarms');
    } else {
      // Default navigation for all or general notifications
      navigate('/telemetry-dashboard');
    }
    handleClose();
  };
  
  // Format timestamp for better display
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    
    // Format to match alarms tab: DD/MM/YYYY HH:MM:SS
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  };
  
  // Handle marking a notification as read
  const handleMarkAsRead = async (notification) => {
    try {
      if (notification.type === 'alarm') {
        await markAlarmAsRead(notification._id);
        // Refresh alarm context to update badge
        if (refreshAlarms) refreshAlarms();
      } else {
        await markNotificationAsRead(notification._id);
        // Refresh notification context to update badge
        if (refreshNotifications) refreshNotifications();
      }
      
      // Update local state
      setNotifications(prev => prev.map(item => 
        item._id === notification._id ? { ...item, isRead: true } : item
      ));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };
  
  // Handle marking all notifications as read
  const handleMarkAllRead = async () => {
    try {
      if (currentTab === 0 || currentTab === 1) {
        await markAllAlarmsAsRead();
        // Refresh alarm context to update badge
        if (refreshAlarms) refreshAlarms();
      }
      
      if (currentTab === 0 || currentTab === 2) {
        await markAllNotificationsAsRead();
        // Refresh notification context to update badge
        if (refreshNotifications) refreshNotifications();
      }
      
      // Update local state based on current tab
      setNotifications(prev => prev.map(notification => {
        if (currentTab === 0 || 
            (currentTab === 1 && notification.type === 'alarm') ||
            (currentTab === 2 && notification.type !== 'alarm')) {
          return { ...notification, isRead: true };
        }
        return notification;
      }));
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  // Get notification icon based on type
  const getNotificationIcon = (notification) => {
    switch (notification.type) {
      case 'alarm':
        return <WarningIcon fontSize="small" sx={{ mr: 0.5, color: 'warning.main' }} />;
      case 'plant':
        return <BusinessIcon fontSize="small" sx={{ mr: 0.5, color: 'primary.main' }} />;
      case 'device':
        return <DevicesIcon fontSize="small" sx={{ mr: 0.5, color: 'info.main' }} />;
      default:
        return <FiberNewIcon fontSize="small" sx={{ mr: 0.5, color: 'success.main' }} />;
    }
  };
  
  // Filter notifications based on selected tab
  const filteredNotifications = notifications.filter(notification => {
    if (currentTab === 0) return true; // All notifications
    if (currentTab === 1) return notification.type === 'alarm'; // Only alarms
    return notification.type !== 'alarm'; // Only general notifications
  });
  
  // Handle navigation based on notification type
  const handleNotificationClick = (notification) => {
    // Mark as read first
    handleMarkAsRead(notification);
    
    // Navigate based on type
    if (notification.type === 'alarm') {
      navigate('/telemetry-dashboard?tab=alarms');
    } else if (notification.type === 'plant') {
      navigate('/plant-dashboard');
    } else if (notification.type === 'device') {
      navigate('/device-dashboard');
    }
    
    handleClose();
  };
  
  return (
    <>
      <IconButton
        size="large"
        color="inherit"
        onClick={handleOpen}
        aria-label="show notifications"
      >
        <Badge badgeContent={totalUnreadCount} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>
      
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: { 
            width: '360px', 
            maxWidth: '100%',
            maxHeight: '500px'
          }
        }}
      >
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs 
            value={currentTab} 
            onChange={handleTabChange}
            aria-label="notification tabs"
            variant="fullWidth"
          >
            <Tab label="All" />
            <Tab label="Alarms" />
            <Tab label="General" />
          </Tabs>
        </Box>
        
        {/* No header - removed as requested */}
        
        {/* Loading State */}
        {isLoading && filteredNotifications.length === 0 && (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Loading notifications...
            </Typography>
          </Box>
        )}
        
        {/* Error State */}
        {error && (
          <Box sx={{ p: 2 }}>
            <Alert severity="error" variant="outlined">
              {error}
            </Alert>
          </Box>
        )}
        
        {/* Notification List */}
        {!isLoading && !error && (
          <>
            {filteredNotifications.length > 0 ? (
              <List sx={{ maxHeight: '300px', overflow: 'auto', padding: 0 }}>
                {filteredNotifications.map((notification) => (
                  <ListItem 
                    key={notification._id}
                    divider
                    sx={{ 
                      padding: '12px 16px',
                      backgroundColor: notification.isRead ? 'inherit' : 'rgba(144, 202, 249, 0.1)',
                      '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' },
                      cursor: 'pointer'
                    }}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <Box sx={{ width: '100%' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography 
                          variant="subtitle2"
                          sx={{ fontWeight: notification.isRead ? 'normal' : 'bold', display: 'flex', alignItems: 'center' }}
                        >
                          {getNotificationIcon(notification)}
                          {notification.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatTimestamp(notification.timestamp)}
                        </Typography>
                      </Box>
                      
                      <Typography variant="body2" sx={{ mb: 0.5 }}>
                        {notification.message}
                      </Typography>
                      
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="caption" color="text.secondary">
                          {notification.deviceName ? `${notification.deviceName}` : ''}
                          {notification.deviceName && notification.plantName ? ' - ' : ''}
                          {notification.plantName ? `${notification.plantName}` : ''}
                        </Typography>
                        
                        {!notification.isRead && (
                          <Button 
                            size="small" 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkAsRead(notification);
                            }}
                            sx={{ textTransform: 'none', fontSize: '0.75rem', p: 0, minWidth: 'auto' }}
                          >
                            Mark as read
                          </Button>
                        )}
                      </Box>
                    </Box>
                  </ListItem>
                ))}
              </List>
            ) : (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  No notifications
                </Typography>
              </Box>
            )}
          </>
        )}
        
        {/* Footer */}
        <Divider />
        <Box sx={{ p: 1, display: 'flex', justifyContent: 'space-between' }}>
          <Button 
            onClick={handleMarkAllRead} 
            disabled={filteredNotifications.filter(n => !n.isRead).length === 0 || isLoading}
            size="small"
          >
            Mark all as read
          </Button>
          <Button 
            onClick={handleViewAll} 
            color="primary"
            size="small"
          >
            View all
          </Button>
        </Box>
      </Menu>
    </>
  );
};

export default NotificationCenter;
