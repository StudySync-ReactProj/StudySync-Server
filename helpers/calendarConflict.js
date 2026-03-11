// filepath: /Users/shahar/react/StudySync-Server/helpers/calendarConflict.js
const Event = require('../models/Event');
const User = require('../models/User');
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
 * Check whether the given time slot [start, end) is free for the given user.
 * userParam can be either a User document or a user id string.
 * options: { excludeEventId, excludeTimeRange: { start, end } } - optional local event id or time range to ignore
 * Returns true if available, false if conflict found.
 */
const isTimeSlotAvailable = async (userParam, start, end, options = {}) => {
    try {
        if (!start || !end) return true; // nothing to check

        // Normalize to Date objects
        const newStart = new Date(start);
        const newEnd = new Date(end);

        // Load user if only id provided
        let user = userParam;
        if (typeof userParam === 'string' || (userParam && userParam.constructor && userParam.constructor.name === 'ObjectId')) {
            user = await User.findById(userParam);
            if (!user) return true; // cannot check, assume free
        }

        // 1) Check local app events
        const localQueryAnd = [
            {
                $or: [
                    { creator: user._id },
                    { 'participants.email': user.email }
                ]
            },
            { startDateTime: { $exists: true, $ne: null } },
            { endDateTime: { $exists: true, $ne: null } },
            { isAllDay: { $ne: true } },
            { startDateTime: { $lt: newEnd } },
            { endDateTime: { $gt: newStart } }
        ];

        // Exclude a specific event id
        if (options.excludeEventId) {
            localQueryAnd.push({ _id: { $ne: options.excludeEventId } });
        }

        // Exclude events that exactly match a provided time range (useful when the current task already occupies that slot)
        if (options.excludeTimeRange && options.excludeTimeRange.start && options.excludeTimeRange.end) {
            const exStart = new Date(options.excludeTimeRange.start);
            const exEnd = new Date(options.excludeTimeRange.end);
            // Exclude events whose start and end equal the excluded range
            localQueryAnd.push({ $or: [{ startDateTime: { $ne: exStart } }, { endDateTime: { $ne: exEnd } }] });
        }

        const localQuery = { $and: localQueryAnd };

        const localConflicts = await Event.find(localQuery).limit(1);
        if (localConflicts.length > 0) {
            return false;
        }

        // 2) Check Google Calendar busy times (if connected)
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
                        timeMin: newStart.toISOString(),
                        timeMax: newEnd.toISOString(),
                        items: [{ id: user.email }]
                    }
                });

                const busy = response.data.calendars?.[user.email]?.busy || [];
                if (busy.length > 0) {
                    // If any busy slot overlaps, return false
                    for (const slot of busy) {
                        const s = new Date(slot.start);
                        const e = new Date(slot.end);
                        if (overlaps(newStart, newEnd, s, e)) return false;
                    }
                }
            } catch (err) {
                // If Google API errors, treat as no busy times (do not block)
                // but log for debugging
                console.error('Google freebusy error:', err.message);
            }
        }

        return true;
    } catch (error) {
        console.error('isTimeSlotAvailable error:', error.message);
        // Fail-safe: if any unexpected error, assume not available to be safe
        return false;
    }
};

module.exports = { isTimeSlotAvailable };
