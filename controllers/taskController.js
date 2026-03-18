const Task = require('../models/Task');
const StudySession = require('../models/StudySession');
const { isTimeSlotAvailable } = require('../helpers/calendarConflict');
const { getAvailableSlots } = require('../helpers/availabilitySlots');

// Helper to get local date key YYYY-MM-DD
const getISODateLocal = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
    const input = { ...req.body };

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

    const input = { ...req.body };

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
      // Exclude current task's existing scheduled time (so updating the same task won't conflict with itself)
      const excludeRange = (task.scheduledStart && task.scheduledEnd) ? { start: task.scheduledStart, end: task.scheduledEnd } : undefined;

      const available = await isTimeSlotAvailable(req.user.id, newScheduledStart, newScheduledEnd, { excludeTimeRange: excludeRange });
      if (!available) {
        return res.status(409).json({ message: 'Selected time slot is not available' });
      }
    }

    // Perform update
    const updatedTask = await Task.findByIdAndUpdate(req.params.id, input, { new: true });

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

    await task.deleteOne();
    res.json({ id: req.params.id });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get available time slots for a specific date and duration
// @route   GET /api/tasks/available-slots?date=YYYY-MM-DD&duration=MINUTES
const getAvailableTaskSlots = async (req, res) => {
  try {
    const { date, duration } = req.query;

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
    const availableSlots = await getAvailableSlots(req.user.id, date, durationMinutes);

    res.json(availableSlots);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getTasks, createTask, updateTask, deleteTask, getAvailableTaskSlots };