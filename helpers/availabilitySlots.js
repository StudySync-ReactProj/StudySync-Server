const Task = require('../models/Task');
const Event = require('../models/Event');
const User = require('../models/User');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');

const getOAuth2Client = () => {
    return new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
};

// Helper: check overlap between two Date objects
const overlaps = (aStart, aEnd, bStart, bEnd) => {
    return aStart < bEnd && aEnd > bStart;
};

/**
 * Get all busy time slots for a given user on a specific date.
 * Returns an array of { start: Date, end: Date } objects representing occupied times.
 * Checks: local events, Google Calendar, and scheduled tasks.
 * 
 * @param {string} userId - The user's ID
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @param {string|null} excludeTaskId - Optional task ID to exclude from busy slots (for editing scenarios)
 */
const getBusySlots = async (userId, dateStr, excludeTaskId = null) => {
    try {
        const user = await User.findById(userId);
        if (!user) return [];

        // Parse date string (YYYY-MM-DD) and create date bounds for that day
        const [year, month, day] = dateStr.split('-').map(Number);
        const dayStart = new Date(year, month - 1, day, 0, 0, 0);
        const dayEnd = new Date(year, month - 1, day, 23, 59, 59);

        const busySlots = [];

        // 1) Get local app events for this user on this date
        const localEvents = await Event.find({
            $and: [
                {
                    $or: [
                        { creator: user._id },
                        { 'participants.email': user.email }
                    ]
                },
                { startDateTime: { $exists: true, $ne: null } },
                { endDateTime: { $exists: true, $ne: null } },
                { isAllDay: { $ne: true } },
                { startDateTime: { $gte: dayStart, $lt: dayEnd } }
            ]
        });

        for (const event of localEvents) {
            busySlots.push({
                start: new Date(event.startDateTime),
                end: new Date(event.endDateTime)
            });
        }

        // 2) Get scheduled tasks for this user on this date
        // Exclude the currently edited task if excludeTaskId is provided
        const taskQuery = {
            user: user._id,
            scheduledStart: { $gte: dayStart, $lt: dayEnd }
        };

        if (excludeTaskId) {
            // Convert string ID to ObjectId if necessary
            const excludeId = mongoose.Types.ObjectId.isValid(excludeTaskId)
                ? new mongoose.Types.ObjectId(excludeTaskId)
                : excludeTaskId;
            taskQuery._id = { $ne: excludeId };
        }

        const scheduledTasks = await Task.find(taskQuery);

        for (const task of scheduledTasks) {
            if (task.scheduledStart && task.scheduledEnd) {
                busySlots.push({
                    start: new Date(task.scheduledStart),
                    end: new Date(task.scheduledEnd)
                });
            }
        }

        // 3) Get Google Calendar busy times if connected
        if (user.googleRefreshToken) {
            try {
                const oauth2Client = getOAuth2Client();
                oauth2Client.setCredentials({
                    refresh_token: user.googleRefreshToken,
                    access_token: user.googleAccessToken
                });

                // Listen for refreshed tokens and save them (best-effort)
                oauth2Client.on('tokens', async (tokens) => {
                    if (tokens.access_token) {
                        user.googleAccessToken = tokens.access_token;
                        if (tokens.expiry_date) user.googleTokenExpiry = tokens.expiry_date;
                        try { await user.save(); } catch (e) { /* ignore save errors */ }
                    }
                });

                const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
                const response = await calendar.freebusy.query({
                    requestBody: {
                        timeMin: dayStart.toISOString(),
                        timeMax: dayEnd.toISOString(),
                        items: [{ id: user.email }]
                    }
                });

                const googleBusy = response.data.calendars?.[user.email]?.busy || [];
                for (const slot of googleBusy) {
                    busySlots.push({
                        start: new Date(slot.start),
                        end: new Date(slot.end)
                    });
                }
            } catch (err) {
                // If Google API errors, log but continue (fail-safe)
                console.error('Google freebusy error in getBusySlots:', err.message);
            }
        }

        return busySlots;
    } catch (error) {
        console.error('getBusySlots error:', error.message);
        return [];
    }
};

/**
 * Calculate available time slots for a given date and duration.
 * dateStr: YYYY-MM-DD format
 * durationMinutes: number of minutes needed
 * excludeTaskId: optional task ID to exclude from busy slots (for editing scenarios)
 * Returns: array of { start: Date, end: Date, label: string }
 */
const getAvailableSlots = async (userId, dateStr, durationMinutes, excludeTaskId = null) => {
    try {
        const busySlots = await getBusySlots(userId, dateStr, excludeTaskId);

        // Parse date string and create day bounds (7 AM to Midnight)
        const [year, month, day] = dateStr.split('-').map(Number);
        const dayStart = new Date(year, month - 1, day, 7, 0, 0); // 7 AM
        const dayEnd = new Date(year, month - 1, day + 1, 0, 0, 0);   // Midnight

        // Sort busy slots by start time
        busySlots.sort((a, b) => a.start - b.start);

        // Merge overlapping busy slots
        const mergedBusySlots = [];
        for (const slot of busySlots) {
            if (mergedBusySlots.length === 0) {
                mergedBusySlots.push(slot);
            } else {
                const lastSlot = mergedBusySlots[mergedBusySlots.length - 1];
                if (slot.start <= lastSlot.end) {
                    // Overlapping or adjacent, merge
                    lastSlot.end = new Date(Math.max(lastSlot.end.getTime(), slot.end.getTime()));
                } else {
                    mergedBusySlots.push(slot);
                }
            }
        }

        const availableSlots = [];

        // Check gap before first busy slot
        if (mergedBusySlots.length === 0) {
            // No busy slots, entire day is available
            let slotStart = new Date(dayStart);
            while (slotStart.getTime() + durationMinutes * 60000 <= dayEnd.getTime()) {
                const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);
                availableSlots.push({
                    start: slotStart,
                    end: slotEnd,
                    label: formatLabel(slotStart, slotEnd)
                });
                slotStart = new Date(slotStart.getTime() + 30 * 60000); // 30-min intervals
            }
        } else {
            // Check gap before first busy slot
            let currentTime = new Date(dayStart);
            const firstBusyStart = mergedBusySlots[0].start;
            while (currentTime.getTime() + durationMinutes * 60000 <= firstBusyStart.getTime()) {
                const slotEnd = new Date(currentTime.getTime() + durationMinutes * 60000);
                availableSlots.push({
                    start: new Date(currentTime),
                    end: slotEnd,
                    label: formatLabel(currentTime, slotEnd)
                });
                currentTime = new Date(currentTime.getTime() + 30 * 60000); // 30-min intervals
            }

            // Check gaps between busy slots
            for (let i = 0; i < mergedBusySlots.length - 1; i++) {
                const gapStart = new Date(mergedBusySlots[i].end);
                const gapEnd = new Date(mergedBusySlots[i + 1].start);

                currentTime = new Date(gapStart);
                while (currentTime.getTime() + durationMinutes * 60000 <= gapEnd.getTime()) {
                    const slotEnd = new Date(currentTime.getTime() + durationMinutes * 60000);
                    availableSlots.push({
                        start: new Date(currentTime),
                        end: slotEnd,
                        label: formatLabel(currentTime, slotEnd)
                    });
                    currentTime = new Date(currentTime.getTime() + 30 * 60000); // 30-min intervals
                }
            }

            // Check gap after last busy slot
            const lastBusyEnd = mergedBusySlots[mergedBusySlots.length - 1].end;
            currentTime = new Date(lastBusyEnd);
            while (currentTime.getTime() + durationMinutes * 60000 <= dayEnd.getTime()) {
                const slotEnd = new Date(currentTime.getTime() + durationMinutes * 60000);
                availableSlots.push({
                    start: new Date(currentTime),
                    end: slotEnd,
                    label: formatLabel(currentTime, slotEnd)
                });
                currentTime = new Date(currentTime.getTime() + 30 * 60000); // 30-min intervals
            }
        }

        return availableSlots;
    } catch (error) {
        console.error('getAvailableSlots error:', error.message);
        return [];
    }
};

/**
 * Format a time slot label like "09:00 - 10:30"
 */
const formatLabel = (start, end) => {
    const startStr = start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const endStr = end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${startStr} - ${endStr}`;
};

module.exports = { getAvailableSlots, getBusySlots };
