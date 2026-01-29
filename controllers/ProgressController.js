const StudySession = require("../models/StudySession");
const User = require("../models/User");

// Get local date key
const getISODateLocal = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Set user's daily goal
const setDailyGoal = async (req, res) => {
    const minutes = Math.max(1, Number(req.body.minutes));
    await User.findByIdAndUpdate(req.user.id, { dailyGoalMinutes: minutes });
    res.json({ dailyGoalMinutes: minutes });
};

// Save study session (called from Timer)
const addStudySession = async (req, res) => {
    const minutes = Math.max(1, Number(req.body.minutes));
    const date = getISODateLocal();

    await StudySession.create({ user: req.user.id, date, minutes });
    res.json({ message: "Session saved" });
};

// Get 7 days of study data
const getWeekly = async (req, res) => {
    const user = await User.findById(req.user.id);
    const goal = user.dailyGoalMinutes;

    const today = new Date();
    const weekly = [];
    const labels = ["SUN", "MON", "TUE", "WED", "THR", "FRI", "SAT"];

    const sessions = await StudySession.find({ user: req.user.id });
    const map = {};
    sessions.forEach(s => map[s.date] = (map[s.date] || 0) + s.minutes);

    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = getISODateLocal(d);

        weekly.push({
            day: labels[d.getDay()],
            studiedMinutes: map[key] || 0,
            goalMinutes: goal,
        });
    }

    res.json({ weekly, dailyGoalMinutes: goal });
};

module.exports = { setDailyGoal, addStudySession, getWeekly };
