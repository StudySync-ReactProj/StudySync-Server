const express = require('express');
const router = express.Router();

const {
    getAuthUrl,
    handleCallback,
    getFreeBusy,
    listGoogleEvents
} = require('../controllers/googleCalendarController');

const { protect } = require('../middleware/authMiddleware');

// Public route - Get OAuth2 authorization URL
router.get('/auth-url', getAuthUrl);

// Public route - Handle OAuth2 callback (matches GOOGLE_REDIRECT_URI)
router.get('/auth/google/callback', handleCallback);

// Protected route - Get free/busy information
router.post('/freebusy', protect, getFreeBusy);
// Protected route - List Google Calendar events
router.get('/events', protect, listGoogleEvents);


module.exports = router;
