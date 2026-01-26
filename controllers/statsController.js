const Task = require('../models/task');
const Event = require('../models/Event');

// @desc    Get dashboard statistics
// @route   GET /api/stats
const getDashboardStats = async (req, res) => {
    try {
        const userId = req.user.id;

        // 1. Task completion stats
        const totalTasks = await Task.countDocuments({ user: userId });
        const completedTasks = await Task.countDocuments({ user: userId, status: 'Completed' });
        const pendingTasks = totalTasks - completedTasks;

        // 2. Upcoming events (within the next week)
        const today = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);

        const upcomingEventsCount = await Event.countDocuments({
            creator: userId,
            start: { $gte: today, $lte: nextWeek }
        });

        // 3. Fetch top 3 urgent tasks (Priority High and not completed)
        const urgentTasks = await Task.find({
            user: userId,
            status: { $ne: 'Completed' },
            priority: 'High'
        }).limit(3);

        res.json({
            taskStats: {
                total: totalTasks,
                completed: completedTasks,
                pending: pendingTasks,
                completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0
            },
            upcomingEventsCount,
            urgentTasks
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { getDashboardStats };