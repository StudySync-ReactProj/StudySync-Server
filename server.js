const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const taskRoutes = require('./routes/taskRoutes');
const userRoutes = require('./routes/userRoutes');
const eventRoutes = require('./routes/eventRoutes');
const statsRoutes = require('./routes/statsRoutes');
const googleCalendarRoutes = require('./routes/googleCalendarRoutes');
require('dotenv').config(); // Load environment variables

// Validate required environment variables
const requiredEnvVars = [
    'MONGO_URI',
    'JWT_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI',
    'CLIENT_URL'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
    console.error('❌ CRITICAL ERROR: Missing required environment variables:');
    missingEnvVars.forEach(varName => {
        console.error(`   - ${varName}`);
    });
    console.error('\n💡 Please add these variables to your .env file and restart the server.');
    process.exit(1); // Exit with error code
}

console.log('✅ All required environment variables are present');

const app = express();

// Middleware
app.use(cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
}));
app.use(express.json());
app.use((req, res, next) => {
    const start = Date.now();

    res.on("finish", () => {
        const ms = Date.now() - start;
        console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
    });

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
app.use('/api/google-calendar', googleCalendarRoutes);

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

const progressRoutes = require("./routes/progressRoutes");
app.use("/api/progress", progressRoutes);
