const { hasAnyRole } = require('../utils/authHelpers');

const roleMiddleware = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (!hasAnyRole(req.user, allowedRoles)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }

    next();
  };
};

module.exports = roleMiddleware;
