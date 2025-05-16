const express = require('express');
const router = express.Router();
const alarmController = require('../controllers/alarmController');

// Get all alarms
router.get('/', alarmController.getAllAlarms);

// Get alarms by plant name and device name (query parameters)
router.get('/filter', alarmController.getAlarmsByPlantAndDevice);

// Get alarms by device ID
router.get('/device/:deviceId', alarmController.getAlarmsByDevice);

// Get unread alarms count
router.get('/unread/count', alarmController.getUnreadAlarmsCount);

// Mark alarm as read
router.put('/:alarmId/read', alarmController.markAlarmAsRead);

// Mark all alarms as read
router.put('/read/all', alarmController.markAllAlarmsAsRead);

module.exports = router;