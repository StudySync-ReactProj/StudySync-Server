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

// Public routes
router.post('/register', registerUser);
router.post('/login', loginUser);

// Private routes (protected by JWT)
router.post('/contacts', protect, addContact);
router.get('/contacts', protect, getContacts);

module.exports = router;