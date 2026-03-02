const Event = require('../models/Event');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');

// @desc    Get all events for the logged-in user
// @route   GET /api/events
const getEvents = async (req, res) => {
    try {
        // Find events where user is creator or participant
        const events = await Event.find({
            $or: [
                { creator: req.user.id },
                { 'participants.email': req.user.email }
            ]
        });

        // Lazy Sync: Update participant RSVP statuses from Google Calendar if connected
        if (req.user.googleRefreshToken) {
            try {
                console.log('🔄 Syncing RSVP statuses from Google Calendar...');

                const oauth2Client = new OAuth2Client(
                    process.env.GOOGLE_CLIENT_ID,
                    process.env.GOOGLE_CLIENT_SECRET,
                    process.env.GOOGLE_REDIRECT_URI
                );

                oauth2Client.setCredentials({
                    refresh_token: req.user.googleRefreshToken,
                    access_token: req.user.googleAccessToken
                });

                const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

                // Process each event that has a Google Calendar ID
                for (const event of events) {
                    if (!event.googleEventId) continue;

                    try {
                        // Fetch the latest event data from Google Calendar
                        const googleResponse = await calendar.events.get({
                            calendarId: 'primary',
                            eventId: event.googleEventId
                        });

                        const googleAttendees = googleResponse.data.attendees || [];
                        let hasChanges = false;

                        // Cross-reference Google attendees with local participants
                        for (let i = 0; i < event.participants.length; i++) {
                            const participant = event.participants[i];
                            const googleAttendee = googleAttendees.find(
                                attendee => attendee.email === participant.email
                            );

                            if (googleAttendee && googleAttendee.responseStatus) {
                                // Map Google's responseStatus to our local status
                                let newStatus = 'Pending';
                                if (googleAttendee.responseStatus === 'accepted') {
                                    newStatus = 'Accepted';
                                } else if (googleAttendee.responseStatus === 'declined') {
                                    newStatus = 'Declined';
                                } else if (googleAttendee.responseStatus === 'tentative') {
                                    newStatus = 'Maybe';
                                }

                                // Only update if status has changed
                                if (participant.status !== newStatus) {
                                    event.participants[i].status = newStatus;
                                    hasChanges = true;
                                }
                            }
                        }

                        // Save if changed
                        if (hasChanges) {
                            await event.save();
                            console.log(`✅ Updated RSVP statuses for event: ${event.title}`);
                        }
                    } catch (eventError) {
                        // Log error but don't fail request
                        console.error(`❌ Failed to sync event ${event.googleEventId}:`, eventError.message);
                    }
                }

                console.log('✅ RSVP sync completed');
            } catch (syncError) {
                // Log error but don't fail request
                console.error('❌ Error during Google Calendar sync:', syncError.message);
            }
        }

        // Add isInvited flag for UI
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

        // step 1: Prepare event data for local database
        const eventData = {
            ...req.body,
            creator: req.user.id,
        };

        if (req.body.startDateTime) eventData.startDateTime = new Date(req.body.startDateTime);
        if (req.body.endDateTime) eventData.endDateTime = new Date(req.body.endDateTime);

        if (req.body.availableSlots && Array.isArray(req.body.availableSlots)) {
            eventData.availableSlots = req.body.availableSlots.map(slot => ({
                ...slot,
                startDateTime: slot.startDateTime ? new Date(slot.startDateTime) : undefined,
                endDateTime: slot.endDateTime ? new Date(slot.endDateTime) : undefined
            }));
        }

        // Save event locally first (ensures data persists even if Google sync fails)
        let event = await Event.create(eventData);
        console.log('✅ Event created locally successfully:', event._id);

        // Sync to Google Calendar if connected and event has dates
        if (req.user.googleRefreshToken && event.startDateTime && event.endDateTime) {
            try {
                console.log('🔄 Attempting to sync event to Google Calendar...');
                // Create OAuth2 client
                const oauth2Client = new OAuth2Client(
                    process.env.GOOGLE_CLIENT_ID,
                    process.env.GOOGLE_CLIENT_SECRET,
                    process.env.GOOGLE_REDIRECT_URI
                );

                oauth2Client.setCredentials({
                    refresh_token: req.user.googleRefreshToken,
                    access_token: req.user.googleAccessToken
                });

                // Convert to Google Calendar format
                const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

                // Prepare attendees list
                const attendees = event.participants
                    ? event.participants.map(p => ({ email: p.email }))
                    : [];

                const googleEvent = {
                    summary: event.title,
                    description: event.description || '',
                    start: {
                        dateTime: event.startDateTime.toISOString(),
                        timeZone: 'Asia/Jerusalem',
                    },
                    end: {
                        dateTime: event.endDateTime.toISOString(),
                        timeZone: 'Asia/Jerusalem',
                    },
                    location: event.location || '',
                    attendees: attendees,
                    reminders: {
                        useDefault: true,
                    },
                };
                // Insert event to Google Calendar
                const response = await calendar.events.insert({
                    calendarId: 'primary',
                    resource: googleEvent,
                    sendUpdates: 'all' // Sends email notifications to attendees
                });

                // Save Google event ID for future updates/deletions
                event.googleEventId = response.data.id;
                await event.save();
                console.log('✅ Successfully synced to Google Calendar with ID:', response.data.id);
            } catch (googleError) {
                // Log error but don't fail event creation (local event already saved)
                console.error('❌ Failed to sync with Google Calendar:', googleError.message);
            }
        }

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

        // Check that only the creator can update
        if (event.creator.toString() !== req.user.id) {
            return res.status(401).json({ message: 'User not authorized' });
        }

        // 1. Update event in local database
        const updateData = { ...req.body };

        if (req.body.startDateTime) {
            updateData.startDateTime = new Date(req.body.startDateTime);
        }
        if (req.body.endDateTime) {
            updateData.endDateTime = new Date(req.body.endDateTime);
        }

        // Update time slots if they exist
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

        // 2. Sync update to Google Calendar if connected
        if (req.user.googleRefreshToken && event.googleEventId && updatedEvent.startDateTime && updatedEvent.endDateTime) {
            try {
                console.log('🔄 Attempting to sync update to Google Calendar...');

                const { google } = require('googleapis');
                const { OAuth2Client } = require('google-auth-library');

                const oauth2Client = new OAuth2Client(
                    process.env.GOOGLE_CLIENT_ID,
                    process.env.GOOGLE_CLIENT_SECRET,
                    process.env.GOOGLE_REDIRECT_URI
                );

                oauth2Client.setCredentials({
                    refresh_token: req.user.googleRefreshToken,
                    access_token: req.user.googleAccessToken
                });

                const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

                // Update event in Google Calendar
                await calendar.events.patch({
                    calendarId: 'primary',
                    eventId: event.googleEventId,
                    resource: {
                        summary: updatedEvent.title,
                        description: updatedEvent.description || '',
                        start: {
                            dateTime: updatedEvent.startDateTime.toISOString(),
                            timeZone: 'Asia/Jerusalem', // Important to maintain the timezone
                        },
                        end: {
                            dateTime: updatedEvent.endDateTime.toISOString(),
                            timeZone: 'Asia/Jerusalem',
                        },
                        location: updatedEvent.location || '',
                    },
                    sendUpdates: 'all' // Sends update email to participants
                });

                console.log('✅ Successfully updated event in Google Calendar');
            } catch (googleError) {
                // Log error but don't fail (local event already updated)
                console.error('❌ Failed to update Google Calendar:', googleError.message);
            }
        }

        // 3. Return updated event
        res.json(updatedEvent);
    } catch (error) {
        console.error('Error updating event:', error);
        res.status(400).json({ message: error.message });
    }
};

// @desc    Delete an event
// @route   DELETE /api/events/:id
// 

// @desc    Delete an event
// @route   DELETE /api/events/:id
const deleteEvent = async (req, res) => {
    try {
        // 1. Fetch the event by its ID
        const event = await Event.findById(req.params.id);

        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        // Validate ownership
        if (event.creator.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Unauthorized: Only the creator can delete this event' });
        }

        // 2. Delete from Google Calendar (before local DB so we have the ID)
        if (req.user.googleRefreshToken && event.googleEventId) {
            try {
                console.log('🔄 Attempting to delete event from Google Calendar...');

                const oauth2Client = new OAuth2Client(
                    process.env.GOOGLE_CLIENT_ID,
                    process.env.GOOGLE_CLIENT_SECRET,
                    process.env.GOOGLE_REDIRECT_URI
                );

                oauth2Client.setCredentials({
                    refresh_token: req.user.googleRefreshToken,
                    access_token: req.user.googleAccessToken
                });

                const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

                await calendar.events.delete({
                    calendarId: 'primary',
                    eventId: event.googleEventId,
                    sendUpdates: 'all' // Sends cancellation notice to participants
                });

                console.log('✅ Successfully deleted event from Google Calendar');
            } catch (googleError) {
                console.error('❌ Failed to delete from Google Calendar:', googleError.message);
            }
        }

        // 3. Delete from local database
        await event.deleteOne();
        res.json({ id: req.params.id, message: 'Event removed' });
    } catch (error) {
        console.error('Error deleting event:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    RSVP to an event (update participant status)
// @route   PUT /api/events/:id/rsvp
const rsvpEvent = async (req, res) => {
    try {
        const { status } = req.body;

        // Validate status value
        const validStatuses = ['Accepted', 'Declined', 'Maybe', 'Pending'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            });
        }

        // Find the event
        const event = await Event.findById(req.params.id);

        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        // Find the current user in the participants array
        const participantIndex = event.participants.findIndex(
            participant =>
                participant.email === req.user.email ||
                (participant.user && participant.user.toString() === req.user.id)
        );

        if (participantIndex === -1) {
            return res.status(404).json({
                message: 'You are not a participant of this event'
            });
        }

        // Update the participant's status
        event.participants[participantIndex].status = status;

        // Save the event
        await event.save();

        res.json(event);
    } catch (error) {
        console.error('Error updating RSVP:', error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    rsvpEvent
};