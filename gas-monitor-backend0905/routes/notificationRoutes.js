const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

// Get all notifications with optional filtering
router.get('/', notificationController.getAllNotifications);

// Get notifications by device ID
router.get('/device/:deviceId', notificationController.getNotificationsByDevice);

// Get unread notifications count
router.get('/unread/count', notificationController.getUnreadNotificationsCount);

// Mark notification as read
router.put('/:notificationId/read', notificationController.markNotificationAsRead);

// Mark all notifications as read
router.put('/read/all', notificationController.markAllNotificationsAsRead);

module.exports = router;
