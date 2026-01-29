const { body } = require('express-validator');

/**
 * Validation rules for user registration
 * - Email must be valid format and normalized
 * - Password must be at least 6 characters
 * - Username must not be empty
 */
const registerValidation = [
    body('email')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),
    
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long'),
    
    body('username')
        .trim()
        .notEmpty()
        .withMessage('Username is required')
        .isLength({ min: 2 })
        .withMessage('Username must be at least 2 characters long')
];

/**
 * Validation rules for user login
 * - Email must be valid format
 * - Password must not be empty
 */
const loginValidation = [
    body('email')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),
    
    body('password')
        .notEmpty()
        .withMessage('Password is required')
];

/**
 * Validation rules for creating a task
 * - Title must not be empty
 * - Priority must be one of: Low, Medium, High, Critical
 */
const createTaskValidation = [
    body('title')
        .trim()
        .notEmpty()
        .withMessage('Task title is required')
        .isLength({ min: 1, max: 200 })
        .withMessage('Task title must be between 1 and 200 characters'),
    
    body('priority')
        .optional()
        .isIn(['Low', 'Medium', 'High', 'Critical'])
        .withMessage('Priority must be one of: Low, Medium, High, Critical')
];

/**
 * Validation rules for updating a task
 * - Title must not be empty if provided
 * - Priority must be one of the allowed values if provided
 */
const updateTaskValidation = [
    body('title')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Task title cannot be empty')
        .isLength({ min: 1, max: 200 })
        .withMessage('Task title must be between 1 and 200 characters'),
    
    body('priority')
        .optional()
        .isIn(['Low', 'Medium', 'High', 'Critical'])
        .withMessage('Priority must be one of: Low, Medium, High, Critical'),
    
    body('status')
        .optional()
        .isIn(['Not Started', 'In Progress', 'Completed'])
        .withMessage('Status must be one of: Not Started, In Progress, Completed')
];

/**
 * Validation rules for adding a contact
 */
const addContactValidation = [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Contact name is required'),
    
    body('email')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail()
];

module.exports = {
    registerValidation,
    loginValidation,
    createTaskValidation,
    updateTaskValidation,
    addContactValidation
};
