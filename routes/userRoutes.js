const express = require('express');
const router = express.Router();

// Import all controller functions (you can combine them into one line)
const { 
    registerUser, 
    loginUser, 
    addContact, 
    getContacts 
} = require('../controllers/userController');

// IMPORTANT: Import the protect middleware to secure your contact routes
const { protect } = require('../middleware/authMiddleware');

// Import validation middleware and validators
const { validate } = require('../middleware/validationMiddleware');
const { 
    registerValidation, 
    loginValidation, 
    addContactValidation 
} = require('../middleware/validators');

// Public routes with validation
router.post('/register', registerValidation, validate, registerUser);
router.post('/login', loginValidation, validate, loginUser);

// Private routes (protected by JWT) with validation
router.post('/contacts', protect, addContactValidation, validate, addContact);
router.get('/contacts', protect, getContacts);

module.exports = router;