const express = require('express');
const router = express.Router();
const Task = require('../models/task');
const { protect } = require('../middleware/authMiddleware');

// Get all tasks
router.get('/', protect, async (req, res) => {
  try {
    const tasks = await Task.find({ userId: req.user.id });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a new task
router.post('/', protect, async (req, res) => {
  try {
    // Create a new task by the data sent in the request body
    const newTask = new Task({
      ...req.body,
      user: req.user.id
    });
    const savedTask = await newTask.save(); // Save to DB
    res.status(201).json(savedTask); // Return the created task to the client
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// 3. Update task (PUT)
router.put('/:id', protect, async (req, res) => {
  try {
    // First - find the task by its ID
    const task = await Task.findById(req.params.id);

    // Check 1: Does the task even exist?
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Check 2: (Most important!) Is the user trying to update the owner of the task?
    // req.user.id comes from the token (the logged-in user)
    // task.user is the owner registered in the database
    if (task.user.toString() !== req.user.id) {
      return res.status(401).json({ message: 'User not authorized' });
    }

    // If we passed the checks - update
    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true } // Returns the updated version
    );

    res.json(updatedTask);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// 4. Delete task (DELETE)
router.delete('/:id', protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Ownership check - required!
    if (task.user.toString() !== req.user.id) {
      return res.status(401).json({ message: 'User not authorized' });
    }

    // Delete
    await task.deleteOne(); // or task.remove() in older versions

    res.json({ id: req.params.id });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;