const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { 
    getTasks, 
    createTask, 
    updateTask, 
    deleteTask 
} = require('../controllers/taskController');

// Import validation middleware and validators
const { validate } = require('../middleware/validationMiddleware');
const { 
    createTaskValidation, 
    updateTaskValidation 
} = require('../middleware/validators');

router.route('/')
    .get(protect, getTasks)
    .post(protect, createTaskValidation, validate, createTask);

router.route('/:id')
    .put(protect, updateTaskValidation, validate, updateTask)
    .delete(protect, deleteTask);

module.exports = router;