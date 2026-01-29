const Event = require('../models/Event');

// @desc    Get all events for the logged-in user
// @route   GET /api/events
const getEvents = async (req, res) => {
    try {
        // Finds events where the user is either the creator OR a participant
        const events = await Event.find({
            $or: [
                { creator: req.user.id },
                { 'participants.email': req.user.email }
            ]
        });
        
        // Add isInvited property to each event for visual distinction in frontend
        const eventsWithInviteStatus = events.map(event => {
            const eventObj = event.toObject();
            // Event is "invited" if the current user is NOT the creator
            eventObj.isInvited = event.creator.toString() !== req.user.id;
            return eventObj;
        });
        
        res.json(eventsWithInviteStatus);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create a new event
// @route   POST /api/events
const createEvent = async (req, res) => {
    try {
        console.log('📥 Creating event with body:', JSON.stringify(req.body, null, 2));
        
        // Parse date strings to Date objects if they exist
        const eventData = {
            ...req.body,
            creator: req.user.id,
        };

        // Convert ISO string dates to Date objects if provided
        if (req.body.startDateTime) {
            eventData.startDateTime = new Date(req.body.startDateTime);
            console.log('📅 Parsed startDateTime:', eventData.startDateTime);
        }
        
        if (req.body.endDateTime) {
            eventData.endDateTime = new Date(req.body.endDateTime);
            console.log('📅 Parsed endDateTime:', eventData.endDateTime);
        }

        // Parse availableSlots dates if they exist
        if (req.body.availableSlots && Array.isArray(req.body.availableSlots)) {
            eventData.availableSlots = req.body.availableSlots.map(slot => ({
                ...slot,
                startDateTime: slot.startDateTime ? new Date(slot.startDateTime) : undefined,
                endDateTime: slot.endDateTime ? new Date(slot.endDateTime) : undefined
            }));
            console.log('📅 Parsed availableSlots with dates');
        }

        const event = await Event.create(eventData);
        console.log('✅ Event created successfully:', event._id);
        
        res.status(201).json(event);
    } catch (error) {
        console.error('❌ Error creating event:', error);
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

        // Parse date fields if they exist in the update
        const updateData = { ...req.body };
        
        if (req.body.startDateTime) {
            updateData.startDateTime = new Date(req.body.startDateTime);
        }
        
        if (req.body.endDateTime) {
            updateData.endDateTime = new Date(req.body.endDateTime);
        }

        // Parse availableSlots dates if they exist
        if (req.body.availableSlots && Array.isArray(req.body.availableSlots)) {
            updateData.availableSlots = req.body.availableSlots.map(slot => ({
                ...slot,
                startDateTime: slot.startDateTime ? new Date(slot.startDateTime) : undefined,
                endDateTime: slot.endDateTime ? new Date(slot.endDateTime) : undefined
            }));
        }

        const updatedEvent = await Event.findByIdAndUpdate(
            req.params.id,
            updateData,
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
        // 1. Fetch the event by its ID
        const event = await Event.findById(req.params.id);

        // 2. Check if event exists
        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        // 3. Validate ownership - compare event.creator with req.user.id
        if (event.creator.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Unauthorized: Only the creator can delete this event' });
        }

        // 4. Proceed with deletion if authorized
        await event.deleteOne();
        res.json({ id: req.params.id, message: 'Event removed' });
    } catch (error) {
        // 5. Comprehensive error handling to prevent server crashes
        console.error('Error deleting event:', error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getEvents,
    createEvent,
    updateEvent,
    deleteEvent
};