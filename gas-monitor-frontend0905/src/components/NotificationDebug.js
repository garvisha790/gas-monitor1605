import React, { useEffect, useState } from 'react';
import { getAllNotifications } from '../services/notificationService';

// This is a debug component to verify the notifications API works
const NotificationDebug = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('🧪 NotificationDebug: Attempting to fetch notifications...');
        setLoading(true);
        const data = await getAllNotifications();
        console.log('🧪 NotificationDebug: Successfully fetched notifications:', data);
        setNotifications(data);
      } catch (err) {
        console.error('🧪 NotificationDebug: Error fetching notifications:', err);
        setError(err.message || 'Failed to fetch notifications');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Add a manual test function
  const testNotificationsAPI = async () => {
    try {
      console.log('🧪 NotificationDebug: Manual test - fetching notifications...');
      setLoading(true);
      const data = await getAllNotifications();
      console.log('🧪 NotificationDebug: Manual test - successfully fetched:', data);
      setNotifications(data);
      setLoading(false);
    } catch (err) {
      console.error('🧪 NotificationDebug: Manual test - error:', err);
      setError(err.message || 'Failed to fetch notifications');
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '15px', border: '1px solid #ccc', margin: '10px', borderRadius: '5px' }}>
      <h3>Notification API Debug</h3>
      
      <button 
        onClick={testNotificationsAPI}
        style={{ 
          padding: '8px 16px', 
          backgroundColor: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          marginBottom: '10px'
        }}
      >
        Test Notifications API
      </button>
      
      {loading && <p>Loading notifications...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      
      <div>
        <h4>Notifications: {notifications.length}</h4>
        {notifications.length === 0 ? (
          <p>No notifications found. This could be normal if there are no notifications in the database.</p>
        ) : (
          <ul>
            {notifications.map(notification => (
              <li key={notification._id || notification.id} style={{ marginBottom: '8px' }}>
                <strong>{notification.Title || notification.Message || 'Untitled'}</strong>
                <br />
                <small>
                  {notification.Type || 'general'} - 
                  {new Date(notification.CreatedTimestamp).toLocaleString()}
                </small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default NotificationDebug;
