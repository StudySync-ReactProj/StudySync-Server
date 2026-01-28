const Task = require("../models/Task");
const Event = require("../models/Event");

// @desc    Get dashboard statistics
// @route   GET /api/stats
const getDashboardStats = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.userId;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    // ===== 1) Task completion stats =====
    const totalTasks = await Task.countDocuments({ user: userId });
    const completedTasks = await Task.countDocuments({
      user: userId,
      status: "Completed",
    });
    const pendingTasks = totalTasks - completedTasks;

    // ===== 2) Upcoming events count (next 7 days) =====
    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(now.getDate() + 7);

    const upcomingEventsCount = await Event.countDocuments({
      creator: userId,
      startDateTime: { $gte: now, $lte: nextWeek },
      status: "Scheduled",
    });

    // ===== 3) Urgent tasks =====
    const urgentTasks = await Task.find({
      user: userId,
      status: { $ne: "Completed" },
      priority: "High",
    }).limit(3);

    // ===== A) Today's tasks (כולל Completed) =====
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);

    const todayTasks = await Task.find({
      user: userId,
      dueDate: { $gte: dayStart, $lt: dayEnd },
    }).sort({ createdAt: -1 });

    const totalToday = todayTasks.length;
    const completedToday = todayTasks.filter((t) => t.status === "Completed").length;
    const dailyProgress = totalToday ? Math.round((completedToday / totalToday) * 100) : 0;

    // ===== B) Weekly progress (Completed לפי updatedAt) =====
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const completedLastWeek = await Task.find({
      user: userId,
      status: "Completed",
      updatedAt: { $gte: weekAgo },
    });

    const weeklyProgress = Array(7).fill(0);
    completedLastWeek.forEach((t) => {
      const day = new Date(t.updatedAt).getDay(); // 0..6
      weeklyProgress[day] += 1;
    });

    // ===== C) Upcoming sessions =====
    const upcomingSessionsRaw = await Event.find({
      creator: userId,
      startDateTime: { $gte: new Date() },
      status: "Scheduled",
    })
      .sort({ startDateTime: 1 })
      .limit(3);

    const upcomingSessions = upcomingSessionsRaw.map((e) => ({
      id: e._id,
      title: e.title,
      date: e.startDateTime.toLocaleDateString(),
      time: e.startDateTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }));

    // ===== D) Upcoming deadlines (עתידיות) =====
    const upcomingDeadlinesRaw = await Task.find({
      user: userId,
      dueDate: { $gte: new Date() },
    })
      .sort({ dueDate: 1 })
      .limit(6);

    const upcomingDeadlines = upcomingDeadlinesRaw.map((t) => ({
      id: t._id,
      title: t.title,
      due: t.dueDate,
    }));

    // ===== E) Overdue tasks (עבר דדליין ועדיין לא הושלם) =====
    const overdueTasks = await Task.find({
      user: userId,
      dueDate: { $lt: new Date() },
      status: { $ne: "Completed" },
    }).sort({ dueDate: 1 });

    res.json({
      taskStats: {
        total: totalTasks,
        completed: completedTasks,
        pending: pendingTasks,
        completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
      },
      upcomingEventsCount,
      urgentTasks,

      // dashboard data
      tasks: todayTasks,
      dailyProgress,
      weeklyProgress,
      upcomingSessions,
      upcomingDeadlines,
      overdueTasks,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getDashboardStats };
