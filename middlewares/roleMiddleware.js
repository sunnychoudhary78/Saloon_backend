// allowedRoles: array of role names allowed for this route
const roleMiddleware = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const userRole = req.user.Role.name; // included via authMiddleware
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    next();
  };
};

module.exports = roleMiddleware;
