const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");
const { setDailyGoal, addStudySession, getWeekly } = require("../controllers/ProgressController");


router.post("/goal", protect, setDailyGoal);
router.post("/session", protect, addStudySession);
router.get("/weekly", protect, getWeekly);

module.exports = router;
