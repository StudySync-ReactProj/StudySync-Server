const Event = require('../models/Event');

// @desc    Get all events for the logged-in user
// @route   GET /api/events
const getEvents = async (req, res) => {
    try {
        // Finds events where the 'creator' matches the logged-in user's ID
        const events = await Event.find({ creator: req.user.id });
        res.json(events);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create a new event
// @route   POST /api/events
const createEvent = async (req, res) => {
    try {
        // Spread req.body to get all fields (title, start, end, location, etc.)
        // And manually set the creator from the auth token
        const event = await Event.create({
            ...req.body,
            creator: req.user.id,
        });
        res.status(201).json(event);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Update an event
// @route   PUT /api/events/:id
const updateEvent = async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);

        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        // Check if the logged-in user is the creator
        if (event.creator.toString() !== req.user.id) {
            return res.status(401).json({ message: 'User not authorized' });
        }

        const updatedEvent = await Event.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.json(updatedEvent);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Delete an event
// @route   DELETE /api/events/:id
const deleteEvent = async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);

        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        // Check ownership
        if (event.creator.toString() !== req.user.id) {
            return res.status(401).json({ message: 'User not authorized' });
        }

        await event.deleteOne();
        res.json({ id: req.params.id, message: 'Event removed' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

module.exports = {
    getEvents,
    createEvent,
    updateEvent,
    deleteEvent
};