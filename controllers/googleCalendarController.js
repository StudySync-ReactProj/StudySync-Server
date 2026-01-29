const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Event = require('../models/Event');

// Initialize OAuth2 client
const getOAuth2Client = () => {
    return new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
};

// @desc    Generate Google OAuth2 authorization URL
// @route   GET /api/google-calendar/auth-url
const getAuthUrl = async (req, res) => {
    console.log('--- 📥 Backend received userId:', req.query.userId);

    try {
        const oauth2Client = getOAuth2Client();

        // Explicitly extract userId from query parameters
        const userId = req.query.userId;

        if (!userId) {
            console.log('❌ No userId provided in query parameters');
            return res.status(400).json({ error: 'userId is required' });
        }

        console.log('📍 OAuth2 Redirect URI:', oauth2Client.redirectUri);
        console.log('📍 Expected:', process.env.GOOGLE_REDIRECT_URI);
        console.log('👤 Generating auth URL for user ID:', userId);

        const url = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: [
                'https://www.googleapis.com/auth/calendar.readonly',
                'https://www.googleapis.com/auth/calendar.freebusy'
            ],
            prompt: 'consent',
            state: userId // Pass user ID to callback
        });

        console.log('✅ Generated auth URL successfully');
        res.json({ url: url });
    } catch (error) {
        console.error('❌ Error generating auth URL:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Handle OAuth2 callback and exchange code for tokens
// @route   GET /api/google-calendar/auth/google/callback
const handleCallback = async (req, res) => {
    console.log('--- 🚀 CALLBACK REACHED ---');

    try {
        const { code, state } = req.query;

        console.log('📨 Callback received with:');
        console.log('   - Code:', code ? 'Present' : 'Missing');
        console.log('   - State (User ID):', state);

        if (!code) {
            console.log('❌ Missing authorization code');
            return res.redirect('http://localhost:5173/CalendarSync?error=missing_code');
        }

        if (!state) {
            console.log('❌ Missing user ID in state');
            return res.redirect('http://localhost:5173/CalendarSync?error=missing_user_id');
        }

        // 1. Exchange code for tokens
        const oauth2Client = getOAuth2Client();
        const { tokens } = await oauth2Client.getToken(code);
        console.log('✅ Tokens received from Google');
        console.log('   - Access Token:', tokens.access_token ? 'Present' : 'Missing');
        console.log('   - Refresh Token:', tokens.refresh_token ? 'Present' : 'Missing');
        console.log('   - Expiry Date:', tokens.expiry_date);

        // 2. Find user and save tokens manually
        const user = await User.findById(state);

        if (!user) {
            console.log('❌ USER NOT FOUND IN DB:', state);
            return res.redirect('http://localhost:5173/CalendarSync?error=user_not_found');
        }

        console.log('👤 User found:', user.username, '(', user.email, ')');

        // Update user fields
        user.googleAccessToken = tokens.access_token;
        
        // Preserve existing refresh token if Google doesn't send a new one
        if (tokens.refresh_token) {
            user.googleRefreshToken = tokens.refresh_token;
            console.log('✅ New refresh token received from Google');
        } else {
            console.log('⚠️  No refresh token in response (keeping existing one)');
            console.log('   This is normal if user already authorized before');
        }
        
        user.googleTokenExpiry = tokens.expiry_date;

        // Save to database
        await user.save();
        console.log('✅ DATABASE UPDATED FOR:', user.username);
        console.log('   - googleAccessToken saved:', !!user.googleAccessToken);
        console.log('   - googleRefreshToken saved:', !!user.googleRefreshToken);
        console.log('   - googleTokenExpiry saved:', user.googleTokenExpiry);

        res.redirect('http://localhost:5173/CalendarSync?googleConnected=true');
    } catch (error) {
        console.error('❌ CALLBACK ERROR:', error.message);
        console.error('Full error:', error);
        res.redirect('http://localhost:5173/CalendarSync?error=oauth_failed');
    }
};
// @desc    Get free/busy information for a list of emails
// @route   POST /api/google-calendar/freebusy
const getFreeBusy = async (req, res) => {
    try {
        // SECURITY: Always use req.user.id from auth middleware
        // Never trust userId from request body to prevent users accessing other calendars
        const { emails, timeMin, timeMax } = req.body;
        const currentUserId = req.user.id;

        console.log('🔒 FreeBusy request for user:', currentUserId);
        console.log('📧 Checking availability for emails:', emails);
        console.log('⏰ Time range:', timeMin, 'to', timeMax);

        // Initialize result object - will store busy times for each calendar
        const calendars = {};

        // Helper function to get local events (from MongoDB) for a user
        const getLocalEventsBusyTimes = async (userEmail, userId) => {
            try {
                // Find all events where user is creator or participant within the time range
                const localEvents = await Event.find({
                    $and: [
                        {
                            $or: [
                                { creator: userId },
                                { 'participants.email': userEmail }
                            ]
                        },
                        {
                            startDateTime: { $exists: true, $ne: null },
                            endDateTime: { $exists: true, $ne: null }
                        },
                        {
                            $or: [
                                { startDateTime: { $gte: new Date(timeMin), $lte: new Date(timeMax) } },
                                { endDateTime: { $gte: new Date(timeMin), $lte: new Date(timeMax) } },
                                { 
                                    startDateTime: { $lte: new Date(timeMin) },
                                    endDateTime: { $gte: new Date(timeMax) }
                                }
                            ]
                        }
                    ]
                });

                console.log(`📅 Found ${localEvents.length} local events for ${userEmail}`);

                // Convert to busy time format (matching Google Calendar API format)
                return localEvents.map(event => ({
                    start: event.startDateTime.toISOString(),
                    end: event.endDateTime.toISOString()
                }));
            } catch (error) {
                console.error(`❌ Error fetching local events for ${userEmail}:`, error.message);
                return [];
            }
        };

        // Helper function to get Google Calendar busy times for a user
        const getGoogleBusyTimes = async (user, emailToCheck) => {
            try {
                if (!user.googleRefreshToken) {
                    console.log(`ℹ️  ${user.email} has no Google Calendar connected`);
                    return [];
                }

                const oauth2Client = getOAuth2Client();
                oauth2Client.setCredentials({
                    refresh_token: user.googleRefreshToken,
                    access_token: user.googleAccessToken
                });

                // Listen for token refresh
                oauth2Client.on('tokens', async (tokens) => {
                    if (tokens.access_token) {
                        console.log(`🔄 Access token refreshed for ${user.email}`);
                        user.googleAccessToken = tokens.access_token;
                        if (tokens.expiry_date) {
                            user.googleTokenExpiry = tokens.expiry_date;
                        }
                        await user.save();
                    }
                });

                const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

                const freeBusyResponse = await calendar.freebusy.query({
                    requestBody: {
                        timeMin,
                        timeMax,
                        items: [{ id: emailToCheck }]
                    }
                });

                const busyTimes = freeBusyResponse.data.calendars?.[emailToCheck]?.busy || [];
                console.log(`📅 Found ${busyTimes.length} Google Calendar busy slots for ${emailToCheck}`);
                return busyTimes;
            } catch (error) {
                console.error(`❌ Error fetching Google busy times for ${user.email}:`, error.message);
                return [];
            }
        };

        // 1. Process current user's availability
        const currentUser = await User.findById(currentUserId);
        if (!currentUser) {
            return res.status(404).json({ message: 'Current user not found' });
        }

        console.log('👤 Processing current user:', currentUser.email);

        // Get current user's local events
        const currentUserLocalBusy = await getLocalEventsBusyTimes(currentUser.email, currentUserId);
        
        // Get current user's Google Calendar busy times
        const currentUserGoogleBusy = await getGoogleBusyTimes(currentUser, currentUser.email);

        // Merge current user's busy times
        calendars[currentUser.email] = {
            busy: [...currentUserLocalBusy, ...currentUserGoogleBusy]
        };

        // 2. Process each participant's availability
        for (const email of emails) {
            console.log(`👥 Processing participant: ${email}`);

            // Skip if it's the current user (already processed)
            if (email === currentUser.email) {
                console.log('  ↳ Skipping - this is the current user');
                continue;
            }

            // Find participant by email
            const participant = await User.findOne({ email: email });

            if (!participant) {
                console.log(`  ↳ User not found in database - skipping`);
                // User not in system, can't check their calendar
                calendars[email] = { busy: [] };
                continue;
            }

            console.log(`  ↳ Found participant: ${participant.username}`);

            // Get participant's local events
            const participantLocalBusy = await getLocalEventsBusyTimes(email, participant._id);

            // Get participant's Google Calendar busy times
            const participantGoogleBusy = await getGoogleBusyTimes(participant, email);

            // Merge participant's busy times
            calendars[email] = {
                busy: [...participantLocalBusy, ...participantGoogleBusy]
            };

            console.log(`  ↳ Total busy slots for ${email}: ${calendars[email].busy.length}`);
        }

        console.log('✅ FreeBusy check complete');
        console.log('📊 Summary:', Object.keys(calendars).map(email => 
            `${email}: ${calendars[email].busy.length} busy slots`
        ).join(', '));

        res.json({ calendars });
    } catch (error) {
        console.error('❌ FreeBusy Error:', error);
        res.status(500).json({ message: error.message });
    }
};
// @desc    List Google Calendar events for the next 7 days
// @route   GET /api/google-calendar/events
const listGoogleEvents = async (req, res) => {
    try {
        console.log('--- !!! NOAM TEST !!! ---');
        console.log('User ID from request:', req.user?.id);

        const userId = req.user.id;

        // Get user from database to retrieve stored tokens
        const user = await User.findById(userId);

        console.log('User found in database?:', !!user);
        if (user) {
            console.log('Has googleAccessToken?:', !!user.googleAccessToken);
            console.log('Has googleRefreshToken?:', !!user.googleRefreshToken);
        }
        console.log('------------------------------------');

        if (!user) {
            return res.status(404).json({
                message: 'User not found in database.'
            });
        }

        // If user hasn't connected Google Calendar, return empty array instead of error
        // This allows the app to work with local events only
        if (!user.googleRefreshToken) {
            console.log('ℹ️  User has not connected Google Calendar - returning empty array');
            return res.json([]);
        }

        if (!user.googleAccessToken) {
            console.log('⚠️  Access token missing but refresh token exists - will attempt to refresh');
        }

        const oauth2Client = getOAuth2Client();
        oauth2Client.setCredentials({
            access_token: user.googleAccessToken,
            refresh_token: user.googleRefreshToken
        });

        // Listen for token refresh and save new access token
        oauth2Client.on('tokens', async (tokens) => {
            if (tokens.access_token) {
                console.log('🔄 Access token refreshed in listGoogleEvents');
                user.googleAccessToken = tokens.access_token;
                if (tokens.expiry_date) {
                    user.googleTokenExpiry = tokens.expiry_date;
                }
                await user.save();
                console.log('✅ Updated access token saved to database');
            }
        });

        // Wrap Google API call in try-catch to handle token issues gracefully
        try {
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

            // Calculate time range (next 7 days)
            const now = new Date();
            const sevenDaysFromNow = new Date();
            sevenDaysFromNow.setDate(now.getDate() + 7);

            const response = await calendar.events.list({
                calendarId: 'primary',
                timeMin: now.toISOString(),
                timeMax: sevenDaysFromNow.toISOString(),
                maxResults: 100,
                singleEvents: true,
                orderBy: 'startTime'
            });

            const events = response.data.items || [];

            // Transform Google Calendar events to match your app's event format
            const transformedEvents = events.map(event => ({
                id: event.id,
                title: event.summary || 'Untitled Event',
                description: event.description || '',
                start: event.start.dateTime || event.start.date,
                end: event.end.dateTime || event.end.date,
                location: event.location || '',
                locationType: event.location ? 'offline' : 'online',
                status: 'Scheduled',
                source: 'google', // Mark as Google Calendar event
                creator: userId
            }));

            res.json(transformedEvents);
        } catch (googleError) {
            // If Google API fails (expired token, API error, etc.), return empty array
            // This allows the app to continue working with local events
            console.error('❌ Google Calendar API error:', googleError.message);
            console.log('ℹ️  Returning empty array - app will continue with local events only');
            
            // Return empty array instead of throwing error
            // Frontend will handle this gracefully
            return res.json([]);
        }
    } catch (error) {
        // Catch any other unexpected errors
        console.error('❌ Unexpected error in listGoogleEvents:', error);
        // Still return empty array to prevent frontend crashes
        res.json([]);
    }
};

module.exports = {
    getAuthUrl,
    handleCallback,
    getFreeBusy,
    listGoogleEvents
};