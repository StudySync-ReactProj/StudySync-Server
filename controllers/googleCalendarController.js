const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Event = require('../models/Event');
const Task = require('../models/Task');

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
                'https://www.googleapis.com/auth/calendar.events',
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
    console.log('Timestamp:', new Date().toISOString());

    try {
        const { code, state, error } = req.query;

        console.log('📨 Callback received with:');
        console.log('   - Code:', code ? `Present (${code.substring(0, 20)}...)` : 'Missing');
        console.log('   - State (User ID):', state);
        console.log('   - Error from Google:', error || 'None');

        // Check if user denied access
        if (error) {
            console.log('❌ User denied access or error from Google:', error);
            return res.redirect(`${process.env.CLIENT_URL}/CalendarSync?error=access_denied&details=${error}`);
        }

        if (!code) {
            console.log('❌ Missing authorization code');
            return res.redirect(`${process.env.CLIENT_URL}/CalendarSync?error=missing_code`);
        }

        if (!state) {
            console.log('❌ Missing user ID in state');
            return res.redirect(`${process.env.CLIENT_URL}/CalendarSync?error=missing_user_id`);
        }

        console.log('🔄 Step 1: Exchanging code for tokens...');
        // 1. Exchange code for tokens
        const oauth2Client = getOAuth2Client();

        let tokens;
        try {
            const tokenResponse = await oauth2Client.getToken(code);
            tokens = tokenResponse.tokens;
            console.log('✅ Token exchange successful');
            console.log('📦 Full tokens object received:', JSON.stringify({
                has_access_token: !!tokens.access_token,
                has_refresh_token: !!tokens.refresh_token,
                has_id_token: !!tokens.id_token,
                expiry_date: tokens.expiry_date,
                token_type: tokens.token_type,
                scope: tokens.scope
            }, null, 2));
        } catch (tokenError) {
            console.error('❌ Token exchange failed:', tokenError.message);
            console.error('Error details:', tokenError);
            return res.redirect(`${process.env.CLIENT_URL}/CalendarSync?error=token_exchange_failed`);
        }

        // Detailed token validation
        console.log('🔍 Token validation:');
        console.log('   - Access Token:', tokens.access_token ? `Present (length: ${tokens.access_token.length})` : '❌ MISSING');
        console.log('   - Refresh Token:', tokens.refresh_token ? `Present (length: ${tokens.refresh_token.length})` : '⚠️ MISSING');
        console.log('   - Expiry Date:', tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : 'Not set');
        console.log('   - Token Type:', tokens.token_type || 'Not set');
        console.log('   - Scope:', tokens.scope || 'Not set');

        if (!tokens.access_token) {
            console.error('❌ CRITICAL: No access token received from Google!');
            return res.redirect(`${process.env.CLIENT_URL}/CalendarSync?error=no_access_token`);
        }

        console.log('🔄 Step 2: Finding user in database...');
        // Find user by ID
        const user = await User.findById(state);

        if (!user) {
            console.log('❌ USER NOT FOUND IN DB with ID:', state);
            return res.redirect(`${process.env.CLIENT_URL}/CalendarSync?error=user_not_found`);
        }

        console.log('✅ User found in database:');
        console.log('   - ID:', user._id);
        console.log('   - Username:', user.username);
        console.log('   - Email:', user.email);
        console.log('   - Current googleAccessToken:', user.googleAccessToken ? 'EXISTS' : 'NULL');
        console.log('   - Current googleRefreshToken:', user.googleRefreshToken ? 'EXISTS' : 'NULL');

        console.log('🔄 Step 3: Updating user document with tokens...');
        // Update user with new tokens
        const oldAccessToken = user.googleAccessToken;
        const oldRefreshToken = user.googleRefreshToken;
        const oldExpiry = user.googleTokenExpiry;

        user.googleAccessToken = tokens.access_token;
        user.googleTokenExpiry = tokens.expiry_date;

        // Handle refresh token
        if (tokens.refresh_token) {
            user.googleRefreshToken = tokens.refresh_token;
            console.log('✅ NEW refresh token received and set');
        } else {
            console.log('⚠️  No refresh token in response');
            if (!user.googleRefreshToken) {
                console.log('❌ CRITICAL: No existing refresh token and none received!');
                console.log('   This means the user won\'t be able to refresh access tokens.');
                console.log('   User must re-authorize with prompt=consent to get a new refresh token.');
                // We'll still save the access token, but warn about the issue
            } else {
                console.log('✅ Preserving existing refresh token (this is normal on subsequent authorizations)');
            }
        }

        console.log('📝 Token changes:');
        console.log('   - Access Token:', oldAccessToken === user.googleAccessToken ? 'UNCHANGED' : 'UPDATED');
        console.log('   - Refresh Token:', oldRefreshToken === user.googleRefreshToken ? 'UNCHANGED' : 'UPDATED');
        console.log('   - Expiry:', oldExpiry === user.googleTokenExpiry ? 'UNCHANGED' : `${oldExpiry} → ${user.googleTokenExpiry}`);

        console.log('🔄 Step 4: Saving to database...');
        // 4. Save to database with validation
        try {
            const savedUser = await user.save();
            console.log('✅ DATABASE SAVE SUCCESSFUL!');
            console.log('   - Document ID:', savedUser._id);
            console.log('   - Username:', savedUser.username);
            console.log('   - googleAccessToken saved:', !!savedUser.googleAccessToken ? 'YES ✅' : 'NO ❌');
            console.log('   - googleRefreshToken saved:', !!savedUser.googleRefreshToken ? 'YES ✅' : 'NO ❌');
            console.log('   - googleTokenExpiry saved:', savedUser.googleTokenExpiry || 'NULL');

            // Verify save
            console.log('🔄 Step 5: Verifying database save...');
            const verifyUser = await User.findById(state);
            console.log('✅ Verification query result:');
            console.log('   - googleAccessToken exists:', !!verifyUser.googleAccessToken);
            console.log('   - googleRefreshToken exists:', !!verifyUser.googleRefreshToken);
            console.log('   - googleTokenExpiry:', verifyUser.googleTokenExpiry);

            if (!verifyUser.googleAccessToken || !verifyUser.googleRefreshToken) {
                console.error('❌ WARNING: Tokens not found in verification query!');
                console.error('   Database save may have failed silently.');
            }

        } catch (saveError) {
            console.error('❌ DATABASE SAVE FAILED!');
            console.error('   Error name:', saveError.name);
            console.error('   Error message:', saveError.message);
            console.error('   Stack trace:', saveError.stack);
            return res.redirect(`${process.env.CLIENT_URL}/CalendarSync?error=database_save_failed`);
        }

        console.log('✅ ALL STEPS COMPLETED SUCCESSFULLY');
        console.log('🎉 Redirecting to frontend with success flag...');
        res.redirect(`${process.env.CLIENT_URL}/CalendarSync?googleConnected=true`);

    } catch (error) {
        console.error('❌ UNEXPECTED ERROR IN CALLBACK:');
        console.error('   Error name:', error.name);
        console.error('   Error message:', error.message);
        console.error('   Stack trace:', error.stack);
        console.error('   Full error object:', JSON.stringify(error, null, 2));
        res.redirect(`${process.env.CLIENT_URL}/CalendarSync?error=oauth_failed`);
    }
};
// @desc    Get free/busy information for a list of emails
// @route   POST /api/google-calendar/freebusy
const getFreeBusy = async (req, res) => {
    try {
        // SECURITY: Use req.user.id from auth middleware only
        const { emails, timeMin, timeMax, excludeEventId } = req.body;
        const currentUserId = req.user.id;

        console.log('🔒 FreeBusy request for user:', currentUserId);
        console.log('📧 Checking availability for emails:', emails);
        console.log('⏰ Time range:', timeMin, 'to', timeMax);
        if (excludeEventId) {
            console.log('🚫 Excluding event from availability check:', excludeEventId);
        }

        // Fetch the excluded event if provided (to get its time range for filtering)
        let excludedEvent = null;
        if (excludeEventId) {
            try {
                excludedEvent = await Event.findById(excludeEventId);
                if (excludedEvent) {
                    console.log('📌 Excluded event details:', {
                        title: excludedEvent.title,
                        start: excludedEvent.startDateTime,
                        end: excludedEvent.endDateTime,
                        googleEventId: excludedEvent.googleEventId
                    });
                }
            } catch (error) {
                console.error('⚠️ Could not fetch excluded event:', error.message);
            }
        }

        // Store busy times for each calendar
        const calendars = {};

        // Get local events busy times
        const getLocalEventsBusyTimes = async (userEmail, userId) => {
            try {
                // Build query conditions
                const queryConditions = {
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
                        },
                        // Exclude all-day events from blocking time slots
                        { isAllDay: { $ne: true } }
                    ]
                };

                // Exclude the specified event if provided
                if (excludeEventId) {
                    queryConditions.$and.push({ _id: { $ne: excludeEventId } });
                }

                // Find events within time range
                const localEvents = await Event.find(queryConditions);

                console.log(`📅 Found ${localEvents.length} local events for ${userEmail}` + 
                    (excludeEventId ? ` (excluded event ID: ${excludeEventId})` : ''));

                const eventBusySlots = localEvents.map(event => ({
                    start: event.startDateTime.toISOString(),
                    end: event.endDateTime.toISOString()
                }));

                // Find scheduled tasks within time range
                const scheduledTasks = await Task.find({
                    user: userId,
                    scheduledStart: { $exists: true, $ne: null },
                    scheduledEnd: { $exists: true, $ne: null },
                    $or: [
                        { scheduledStart: { $gte: new Date(timeMin), $lte: new Date(timeMax) } },
                        { scheduledEnd: { $gte: new Date(timeMin), $lte: new Date(timeMax) } },
                        {
                            scheduledStart: { $lte: new Date(timeMin) },
                            scheduledEnd: { $gte: new Date(timeMax) }
                        }
                    ]
                });

                console.log(`📝 Found ${scheduledTasks.length} scheduled tasks for ${userEmail}`);

                const taskBusySlots = scheduledTasks.map(task => ({
                    start: task.scheduledStart.toISOString(),
                    end: task.scheduledEnd.toISOString()
                }));

                return [...eventBusySlots, ...taskBusySlots];
            } catch (error) {
                console.error(`❌ Error fetching local events for ${userEmail}:`, error.message);
                return [];
            }
        };

        // Get Google Calendar busy times
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

                // Auto-save refreshed token
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

                let busyTimes = freeBusyResponse.data.calendars?.[emailToCheck]?.busy || [];
                
                // Filter out the excluded event's time slot if it exists
                if (excludedEvent && excludedEvent.startDateTime && excludedEvent.endDateTime) {
                    // Convert excluded event times to timestamps for robust comparison
                    const excludedStartTimestamp = new Date(excludedEvent.startDateTime).getTime();
                    const excludedEndTimestamp = new Date(excludedEvent.endDateTime).getTime();
                    
                    const initialCount = busyTimes.length;
                    busyTimes = busyTimes.filter(slot => {
                        // Convert Google busy slot times to timestamps
                        const slotStartTimestamp = new Date(slot.start).getTime();
                        const slotEndTimestamp = new Date(slot.end).getTime();
                        
                        // Filter out slots that exactly match the excluded event's time range
                        const isExcludedSlot = (slotStartTimestamp === excludedStartTimestamp && 
                                                slotEndTimestamp === excludedEndTimestamp);
                        return !isExcludedSlot;
                    });
                    
                    if (busyTimes.length < initialCount) {
                        console.log(`🚫 Filtered out excluded event from Google Calendar busy times for ${emailToCheck}`);
                    }
                }
                
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

            // Skip current user
            if (email === currentUser.email) {
                console.log('  ↳ Skipping - this is the current user');
                continue;
            }

            // Find participant by email
            const participant = await User.findOne({ email: email });

            if (!participant) {
                console.log(`  ↳ User not found in database - skipping`);
                // User not in system
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
// const listGoogleEvents = async (req, res) => {
//     try {
//         console.log('--- !!! NOAM TEST !!! ---');
//         console.log('User ID from request:', req.user?.id);

//         const userId = req.user.id;

//         // Get user from database to retrieve stored tokens
//         const user = await User.findById(userId);

//         console.log('User found in database?:', !!user);
//         if (user) {
//             console.log('Has googleAccessToken?:', !!user.googleAccessToken);
//             console.log('Has googleRefreshToken?:', !!user.googleRefreshToken);
//         }
//         console.log('------------------------------------');

//         if (!user) {
//             return res.status(404).json({
//                 message: 'User not found in database.'
//             });
//         }

//         // If user hasn't connected Google Calendar, return empty array instead of error
//         // This allows the app to work with local events only
//         if (!user.googleRefreshToken) {
//             console.log('ℹ️  User has not connected Google Calendar - returning empty array');
//             return res.json([]);
//         }

//         if (!user.googleAccessToken) {
//             console.log('⚠️  Access token missing but refresh token exists - will attempt to refresh');
//         }

//         const oauth2Client = getOAuth2Client();
//         oauth2Client.setCredentials({
//             access_token: user.googleAccessToken,
//             refresh_token: user.googleRefreshToken
//         });

//         // Listen for token refresh and save new access token
//         oauth2Client.on('tokens', async (tokens) => {
//             if (tokens.access_token) {
//                 console.log('🔄 Access token refreshed in listGoogleEvents');
//                 user.googleAccessToken = tokens.access_token;
//                 if (tokens.expiry_date) {
//                     user.googleTokenExpiry = tokens.expiry_date;
//                 }
//                 await user.save();
//                 console.log('✅ Updated access token saved to database');
//             }
//         });

//         // Wrap Google API call in try-catch to handle token issues gracefully
//         try {
//             const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

//             // Calculate time range (next 7 days)
//             const now = new Date();
//             const sevenDaysFromNow = new Date();
//             sevenDaysFromNow.setDate(now.getDate() + 7);

//             const response = await calendar.events.list({
//                 calendarId: 'primary',
//                 timeMin: now.toISOString(),
//                 timeMax: sevenDaysFromNow.toISOString(),
//                 maxResults: 100,
//                 singleEvents: true,
//                 orderBy: 'startTime'
//             });

//             const events = response.data.items || [];

//             // Transform Google Calendar events to match your app's event format
//             const transformedEvents = events.map(event => ({
//                 id: event.id,
//                 title: event.summary || 'Untitled Event',
//                 description: event.description || '',
//                 start: event.start.dateTime || event.start.date,
//                 end: event.end.dateTime || event.end.date,
//                 location: event.location || '',
//                 locationType: event.location ? 'offline' : 'online',
//                 status: 'Scheduled',
//                 source: 'google', // Mark as Google Calendar event
//                 creator: userId,
//                 participants: (event.attendees || []).map(attendee => ({
//                     email: attendee.email,
//                     name: attendee.displayName || '',
//                     status: attendee.responseStatus === 'accepted' ? 'Accepted' :
//                             attendee.responseStatus === 'declined' ? 'Declined' :
//                             attendee.responseStatus === 'tentative' ? 'Maybe' : 'Pending'
//                 }))
//             }));

//             res.json(transformedEvents);
//         } catch (googleError) {
//             // If Google API fails (expired token, API error, etc.), return empty array
//             // This allows the app to continue working with local events
//             console.error('❌ Google Calendar API error:', googleError.message);
//             console.log('ℹ️  Returning empty array - app will continue with local events only');

//             // Return empty array instead of throwing error
//             // Frontend will handle this gracefully
//             return res.json([]);
//         }
//     } catch (error) {
//         // Catch any other unexpected errors
//         console.error('❌ Unexpected error in listGoogleEvents:', error);
//         // Still return empty array to prevent frontend crashes
//         res.json([]);
//     }
// };

const listGoogleEvents = async (req, res) => {
    try {
        console.log('--- !!! NOAM TEST !!! ---');
        console.log('User ID from request:', req.user?.id);

        const userId = req.user.id;

        // Get user from database
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

        // No Google Calendar connected - return empty array
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

        // Auto-save refreshed token
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

        // Fetch Google Calendar events
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

            // Transform Google Calendar events
            const transformedEvents = events.map(event => {
                // Check if this is an all-day event (Google uses 'date' instead of 'dateTime')
                const isAllDay = !!event.start.date;
                
                let eventStart, eventEnd;
                
                if (isAllDay) {
                    // For all-day events, use the date field and set to midnight
                    eventStart = `${event.start.date}T00:00:00`;
                    // Google's end date for all-day events is exclusive, so we keep it as-is
                    eventEnd = `${event.end.date}T00:00:00`;
                } else {
                    // For regular events, use dateTime
                    eventStart = event.start.dateTime;
                    eventEnd = event.end.dateTime;
                }

                return {
                    id: event.id,
                    title: event.summary || 'Untitled Event',
                    description: event.description || '',
                    start: eventStart,
                    end: eventEnd,
                    location: event.location || '',
                    locationType: event.location ? 'offline' : 'online',
                    status: 'Scheduled',
                    source: 'google',
                    creator: userId,
                    isAllDay: isAllDay,
                    participants: (event.attendees || []).map(attendee => ({
                        email: attendee.email,
                        name: attendee.displayName || '',
                        status: attendee.responseStatus === 'accepted' ? 'Accepted' :
                            attendee.responseStatus === 'declined' ? 'Declined' :
                                attendee.responseStatus === 'tentative' ? 'Maybe' : 'Pending'
                    }))
                };
            });

            // Filter out duplicates (events already in local DB)
            const localEventsWithGoogleId = await Event.find({
                creator: userId,
                googleEventId: { $exists: true, $ne: null }
            }).select('googleEventId');

            const existingGoogleIds = localEventsWithGoogleId.map(e => e.googleEventId);

            // Return only unique Google events
            const uniqueGoogleEvents = transformedEvents.filter(
                googleEvent => !existingGoogleIds.includes(googleEvent.id)
            );

            res.json(uniqueGoogleEvents);

        } catch (googleError) {
            // Google API failed - return empty array for graceful degradation
            console.error('❌ Google Calendar API error:', googleError.message);
            console.log('ℹ️  Returning empty array - app will continue with local events only');
            return res.json([]);
        }
    } catch (error) {
        // Return empty array to prevent frontend crashes
        console.error('❌ Unexpected error in listGoogleEvents:', error);
        res.json([]);
    }
};

module.exports = {
    getAuthUrl,
    handleCallback,
    getFreeBusy,
    listGoogleEvents
};