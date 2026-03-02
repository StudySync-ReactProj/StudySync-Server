const StudySession = require("../models/StudySession");
const User = require("../models/User");
const DailyGoal = require("../models/DailyGoal");

// Get local date key in YYYY-MM-DD (local time)
const getISODateLocal = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Helper: add days to a Date and return a new Date
const addDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
};

// Set user's daily goal - always applies to TODAY and overwrites existing
const setDailyGoal = async (req, res) => {
    try {
        const minutes = Math.max(1, Number(req.body.minutes));
        if (!Number.isFinite(minutes) || minutes <= 0) {
            return res.status(400).json({ message: "Invalid minutes" });
        }

        const todayKey = getISODateLocal();

        const created = await DailyGoal.findOneAndUpdate(
            { user: req.user.id, date: todayKey },
            { $set: { minutes } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        return res.json({ dateApplied: todayKey, goalMinutes: created.minutes });
    } catch (err) {
        console.error("setDailyGoal error", err);
        return res.status(500).json({ message: "Server error" });
    }
};

// Save study session (called from Timer)
const addStudySession = async (req, res) => {
    try {
        const minutes = Math.max(1, Number(req.body.minutes));
        if (!Number.isFinite(minutes) || minutes <= 0) {
            return res.status(400).json({ message: "Invalid minutes" });
        }

        const date = getISODateLocal();

        await StudySession.create({ user: req.user.id, date, minutes });
        res.json({ message: "Session saved" });
    } catch (err) {
        console.error("addStudySession error", err);
        res.status(500).json({ message: "Server error" });
    }
};

// Get 7 days of study data with correct goal per day (fill-forward logic)
const getWeekly = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const defaultGoal = user.dailyGoalMinutes || 0;

        const today = new Date();
        const labels = ["SUN", "MON", "TUE", "WED", "THR", "FRI", "SAT"];

        // Build date range: start = today - 6 days
        const startDate = addDays(today, -6);
        const startKey = getISODateLocal(startDate);
        const endKey = getISODateLocal(today);

        // Aggregate sessions in range by date
        const sessionsAgg = await StudySession.aggregate([
            { $match: { user: req.user.id, date: { $gte: startKey, $lte: endKey } } },
            { $group: { _id: "$date", minutes: { $sum: "$minutes" } } }
        ]);
        const sessionsMap = {};
        sessionsAgg.forEach(s => (sessionsMap[s._id] = s.minutes));

        // Fetch all DailyGoal records up to today (we need earlier ones to fill-forward)
        const goals = await DailyGoal.find({ user: req.user.id, date: { $lte: endKey } }).sort({ date: 1 });
        const goalsMap = {};
        goals.forEach(g => { goalsMap[g.date] = g.minutes; });

        // Initialize currentGoal to last known goal before the start date, or defaultGoal
        let currentGoal = defaultGoal;
        for (let i = goals.length - 1; i >= 0; i--) {
            if (goals[i].date <= startKey) {
                currentGoal = goals[i].minutes;
                break;
            }
        }

        const weekly = [];

        // Iterate from startDate -> today
        for (let i = 0; i < 7; i++) {
            const d = addDays(startDate, i);
            const key = getISODateLocal(d);

            // If there's an explicit goal for this date, update currentGoal
            if (goalsMap[key] !== undefined) {
                currentGoal = goalsMap[key];
            }

            weekly.push({
                date: key,
                day: labels[d.getDay()],
                studiedMinutes: sessionsMap[key] || 0,
                goalMinutes: currentGoal,
            });
        }

        res.json({ weekly });
    } catch (err) {
        console.error("getWeekly error", err);
        res.status(500).json({ message: "Server error" });
    }
};

module.exports = { setDailyGoal, addStudySession, getWeekly };
