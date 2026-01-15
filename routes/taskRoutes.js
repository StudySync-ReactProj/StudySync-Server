const express = require('express');
const router = express.Router();
const Task = require('../models/Task');

// Get all tasks
router.get('/', async (req, res) => {
    try {
        const tasks = await Task.find();
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Create a new task
router.post('/', async (req, res) => {
  try {
    // Create a new task by the data sent in the request body
    const newTask = new Task(req.body);
    const savedTask = await newTask.save(); // Save to DB
    res.status(201).json(savedTask); // Return the created task to the client
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;