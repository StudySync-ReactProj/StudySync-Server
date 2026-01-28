const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  try {
    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    //saves te user
    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user) {
      return res.status(401).json({ message: "Not authorized, user not found" });
    }

    next();
  } catch (err) {
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
};

module.exports = { protect };
