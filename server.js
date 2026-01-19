const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const taskRoutes = require('./routes/taskRoutes');
const userRoutes = require('./routes/userRoutes');
require('dotenv').config(); // Load environment variables

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
    next();
});

// Test route
app.get('/', (req, res) => {
    res.json('StudySync Server is running');
});

// Placeholders for routes
app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);
app.get('/check-users', async (req, res) => {
    const User = require('./models/User');
    const allUsers = await User.find({});
    res.json(allUsers);
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then((conn) => {
        console.log('✅ Connected to MongoDB');
        // השורה הזו תגלה לנו את האמת:
        console.log('📂 Current Database Name:', conn.connection.name);

        const PORT = process.env.PORT || 5000;
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error('❌ MongoDB connection error:', error);
    });