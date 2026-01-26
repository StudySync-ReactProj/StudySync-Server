const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const taskRoutes = require('./routes/taskRoutes');
const userRoutes = require('./routes/userRoutes');
const eventRoutes = require('./routes/eventRoutes');
const statsRoutes = require('./routes/statsRoutes');
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
app.get('/check-users', async (req, res) => {
    const User = require('./models/User');
    const allUsers = await User.find({});
    res.json(allUsers);
});
app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/stats', statsRoutes);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then((conn) => {
        console.log('✅ Connected to MongoDB');
        console.log('📂 Current Database Name:', conn.connection.name);

        const PORT = process.env.PORT || 5000;
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error('❌ MongoDB connection error:', error);
    });

// Health check
app.get("/api/health", (req, res) => {
    res.json({ ok: true });
});
