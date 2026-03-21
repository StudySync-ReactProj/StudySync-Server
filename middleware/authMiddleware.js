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
    const userDoc = await User.findById(decoded.id).select("-password");

    if (!userDoc) {
      return res.status(401).json({ message: "Not authorized, user not found" });
    }

    req.user = userDoc.toObject();
    req.user._id = userDoc._id;
    req.user.id = userDoc._id.toString();

    next();
  } catch (err) {
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
};

module.exports = { protect };
