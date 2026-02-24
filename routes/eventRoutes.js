const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    getEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    rsvpEvent
} = require('../controllers/eventController');

// All routes here are protected - user must be logged in
router.route('/')
    .get(protect, getEvents)
    .post(protect, createEvent);

router.route('/:id')
    .put(protect, updateEvent)
    .delete(protect, deleteEvent);

router.route('/:id/rsvp')
    .put(protect, rsvpEvent);

module.exports = router;