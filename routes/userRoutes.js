
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Helper function to generate JWT
function generateToken(user) {
    return jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, {
        expiresIn: '30d' // Token valid for 30 days
    });
}

// Register User
router.post('/register', async (req, res) => {
    console.log('👀 1. Register request received!');
    console.log('📦 2. Data received:', req.body);

    try {
        const { username, email, password } = req.body;

        // Check for missing fields
        if (!username || !email || !password) {
            console.log('❌ 3. Missing fields!');
            return res.status(400).json({ message: 'Please add all fields' });
        }

        // Check if user exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            console.log('❌ 4. User already exists!');
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        console.log('⏳ 5. Attempting to save to DB...');
        const user = await User.create({
            username,
            email,
            password: hashedPassword,
        });

        if (user) {
            console.log('✅ 6. SUCCESS! User saved with ID:', user._id);
            console.log('📂 7. Saved in collection:', User.collection.name);

            res.status(201).json({
                _id: user.id,
                username: user.username,
                email: user.email,
                token: generateToken(user._id),
            });
        } else {
            console.log('❌ 8. User not created (unknown error)');
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        console.error('🔥 9. Critical Error:', error.message);
        res.status(500).json({ message: error.message });
    }
});

// User login
// address: POST /api/users/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ message: 'Please add all fields' });
        }
        // Find user by email
        const user = await User.findOne({ email });
        // Checks if password matches the hashed password in DB
        if (user && (await bcrypt.compare(password, user.password))) {
            res.json({
                _id: user.id,
                username: user.username,
                email: user.email,
                token: generateToken(user), // send token upon login
            });
        } else {
            res.status(400).json({ message: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;