const Task = require('../models/Task');
const StudySession = require('../models/StudySession');
const { isTimeSlotAvailable } = require('../helpers/calendarConflict');
const { getAvailableSlots } = require('../helpers/availabilitySlots');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');

// Helper to get local date key YYYY-MM-DD
const getISODateLocal = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const getTaskGoogleCalendarClient = (user) => {
  const hasGoogleConnection = !!(user?.googleRefreshToken || user?.googleAccessToken);
  if (!hasGoogleConnection) return null;

  const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    refresh_token: user.googleRefreshToken,
    access_token: user.googleAccessToken
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
};

const buildGoogleEventFromTask = (task) => {
  const taskStart = task.scheduledStart ? new Date(task.scheduledStart) : null;
  if (!taskStart || !task.estimatedMinutes || Number(task.estimatedMinutes) <= 0) return null;

  const taskEnd = task.scheduledEnd
    ? new Date(task.scheduledEnd)
    : new Date(taskStart.getTime() + Number(task.estimatedMinutes) * 60000);

  return {
    summary: task.title,
    description: task.taskNotes || '',
    extendedProperties: {
      private: {
        source: 'StudySyncTask',
        taskId: task._id.toString()
      }
    },
    start: {
      dateTime: taskStart.toISOString(),
      timeZone: 'Asia/Jerusalem'
    },
    end: {
      dateTime: taskEnd.toISOString(),
      timeZone: 'Asia/Jerusalem'
    }
  };
};

// @desc    Get all tasks
// @route   GET /api/tasks
const getTasks = async (req, res) => {
  try {
    const tasks = await Task.find({ user: req.user.id });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new task
// @route   POST /api/tasks
const createTask = async (req, res) => {
  try {
    const { scheduleInCalendar, ...restBody } = req.body;
    const input = { ...restBody };

    // If estimatedMinutes > 0 and scheduledStart provided, compute scheduledEnd
    if (input.estimatedMinutes && Number(input.estimatedMinutes) > 0 && input.scheduledStart) {
      const start = new Date(input.scheduledStart);
      const end = new Date(start.getTime() + Number(input.estimatedMinutes) * 60000);
      input.scheduledStart = start;
      input.scheduledEnd = end;

      // Check calendar conflicts (against local events and Google Calendar)
      const available = await isTimeSlotAvailable(req.user.id, start, end);
      if (!available) {
        return res.status(409).json({ message: 'Selected time slot is not available' });
      }
    }

    // Ensure user field is set
    const newTask = new Task({
      ...input,
      user: req.user.id
    });

    const savedTask = await newTask.save();

    const shouldScheduleInCalendar = scheduleInCalendar === true;
    const hasGoogleConnection = !!(req.user.googleRefreshToken || req.user.googleAccessToken);

    if (shouldScheduleInCalendar && hasGoogleConnection && savedTask.scheduledStart && savedTask.estimatedMinutes > 0) {
      try {
        const calendar = getTaskGoogleCalendarClient(req.user);
        const googleEvent = buildGoogleEventFromTask(savedTask);

        if (!calendar || !googleEvent) {
          throw new Error('Task missing scheduling fields or user not connected to Google');
        }

        const response = await calendar.events.insert({
          calendarId: 'primary',
          resource: googleEvent
        });

        if (response?.data?.id) {
          savedTask.googleEventId = response.data.id;
          await savedTask.save();
        }
      } catch (googleError) {
        console.error('Failed to sync task to Google Calendar:', googleError.message);
      }
    }

    // If task created as Completed and needs crediting (created completed without timer)
    if (savedTask.status === 'Completed') {
      // completedWithTimer may have been provided in body; default to false
      const completedWithTimer = req.body.completedWithTimer === true;

      if (!completedWithTimer && savedTask.estimatedMinutes > 0 && !savedTask.creditedEstimatedTime) {
        try {
          const today = getISODateLocal();
          await StudySession.create({ user: req.user.id, minutes: Math.floor(savedTask.estimatedMinutes), date: today });
          savedTask.creditedEstimatedTime = true;
          await savedTask.save();
        } catch (err) {
          // Log but don't fail response
          console.error('Error crediting study session on create:', err.message);
        }
      }
    }

    res.status(201).json(savedTask);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update task
// @route   PUT /api/tasks/:id
const updateTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    if (task.user.toString() !== req.user.id) {
      return res.status(401).json({ message: 'User not authorized' });
    }

    const { syncToGoogle, scheduleInCalendar, ...restBody } = req.body;
    const input = { ...restBody };

    // Determine if we need to compute scheduledEnd (if estimatedMinutes > 0 and scheduledStart provided)
    let newScheduledStart = null;
    let newScheduledEnd = null;
    if ((input.estimatedMinutes !== undefined && Number(input.estimatedMinutes) > 0) || (task.estimatedMinutes && task.estimatedMinutes > 0)) {
      const effectiveEstimated = input.estimatedMinutes !== undefined ? Number(input.estimatedMinutes) : Number(task.estimatedMinutes || 0);
      if (input.scheduledStart) {
        newScheduledStart = new Date(input.scheduledStart);
        newScheduledEnd = new Date(newScheduledStart.getTime() + effectiveEstimated * 60000);
        input.scheduledStart = newScheduledStart;
        input.scheduledEnd = newScheduledEnd;
      } else if (input.estimatedMinutes !== undefined && task.scheduledStart) {
        // estimated changed but start remained the same -> recompute end
        const existingStart = new Date(task.scheduledStart);
        newScheduledStart = existingStart;
        newScheduledEnd = new Date(existingStart.getTime() + Number(input.estimatedMinutes) * 60000);
        input.scheduledEnd = newScheduledEnd;
      }
    }

    // If a scheduling slot is being set/changed, validate conflicts
    if (newScheduledStart && newScheduledEnd) {
      // Exclude current task to avoid self-conflict when checking availability
      const available = await isTimeSlotAvailable(req.user.id, newScheduledStart, newScheduledEnd, { excludeTaskId: req.params.id });
      if (!available) {
        return res.status(409).json({ message: 'Selected time slot is not available' });
      }
    }

    // Perform update
    const updatedTask = await Task.findByIdAndUpdate(req.params.id, input, { new: true });

    const shouldSyncToGoogle = syncToGoogle === true || scheduleInCalendar === true;
    const hasGoogleConnection = !!(req.user.googleRefreshToken || req.user.googleAccessToken);

    const titleChanged = input.title !== undefined;
    const timeChanged = input.scheduledStart !== undefined || input.estimatedMinutes !== undefined || input.scheduledEnd !== undefined;
    const shouldPatchExistingGoogleEvent = !!updatedTask.googleEventId && (titleChanged || timeChanged);

    if (hasGoogleConnection && shouldPatchExistingGoogleEvent) {
      try {
        const calendar = getTaskGoogleCalendarClient(req.user);
        const googleEvent = buildGoogleEventFromTask(updatedTask);

        if (calendar && googleEvent) {
          await calendar.events.patch({
            calendarId: 'primary',
            eventId: updatedTask.googleEventId,
            resource: googleEvent
          });
        }
      } catch (googleError) {
        console.error('Failed to update task in Google Calendar:', googleError.message);
      }
    }

    if (hasGoogleConnection && shouldSyncToGoogle && !updatedTask.googleEventId) {
      try {
        const calendar = getTaskGoogleCalendarClient(req.user);
        const googleEvent = buildGoogleEventFromTask(updatedTask);

        if (calendar && googleEvent) {
          const response = await calendar.events.insert({
            calendarId: 'primary',
            resource: googleEvent
          });

          if (response?.data?.id) {
            updatedTask.googleEventId = response.data.id;
            await updatedTask.save();
          }
        }
      } catch (googleError) {
        console.error('Failed to create Google Calendar event for task on update:', googleError.message);
      }
    }

    // Handle completion crediting logic when status becomes Completed
    const prevStatus = task.status;
    const newStatus = updatedTask.status;

    if (prevStatus !== 'Completed' && newStatus === 'Completed') {
      const completedWithTimer = input.completedWithTimer === true;

      if (!completedWithTimer && updatedTask.estimatedMinutes > 0 && !updatedTask.creditedEstimatedTime) {
        try {
          const today = getISODateLocal();
          await StudySession.create({ user: req.user.id, minutes: Math.floor(updatedTask.estimatedMinutes), date: today });
          updatedTask.creditedEstimatedTime = true;
          await updatedTask.save();
        } catch (err) {
          console.error('Error crediting study session on update:', err.message);
        }
      }
    }

    res.json(updatedTask);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete task
// @route   DELETE /api/tasks/:id
const deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    if (task.user.toString() !== req.user.id) {
      return res.status(401).json({ message: 'User not authorized' });
    }

    if (task.googleEventId) {
      try {
        const calendar = getTaskGoogleCalendarClient(req.user);
        if (calendar) {
          await calendar.events.delete({
            calendarId: 'primary',
            eventId: task.googleEventId
          });
        }
      } catch (googleError) {
        console.error('Failed to delete task from Google Calendar:', googleError.message);
      }
    }

    await task.deleteOne();
    res.json({ id: req.params.id });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get available time slots for a specific date and duration
// @route   GET /api/tasks/available-slots?date=YYYY-MM-DD&duration=MINUTES&taskId=OPTIONAL_TASK_ID
const getAvailableTaskSlots = async (req, res) => {
  try {
    const { date, duration, taskId } = req.query;

    // Validate date parameter
    if (!date) {
      return res.status(400).json({ message: 'Date parameter (YYYY-MM-DD) is required' });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({ message: 'Date must be in YYYY-MM-DD format' });
    }

    // Validate date is a valid calendar date
    const [year, month, day] = date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    if (dateObj.getFullYear() !== year || dateObj.getMonth() !== month - 1 || dateObj.getDate() !== day) {
      return res.status(400).json({ message: 'Date is not a valid calendar date' });
    }

    // Validate duration parameter
    if (!duration) {
      return res.status(400).json({ message: 'Duration parameter (minutes) is required' });
    }

    const durationMinutes = Number(duration);
    if (isNaN(durationMinutes) || durationMinutes <= 0) {
      return res.status(400).json({ message: 'Duration must be a positive number representing minutes' });
    }

    // Get available slots for the user
    // Pass taskId as excludeTaskId so the currently edited task is excluded from busy slots
    const availableSlots = await getAvailableSlots(req.user.id, date, durationMinutes, taskId || null);

    res.json(availableSlots);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getTasks, createTask, updateTask, deleteTask, getAvailableTaskSlots };