const { getUnionPermissions } = require('../utils/authHelpers');

module.exports = function permissionMiddleware(permissionName) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const perms = getUnionPermissions(req.user);
    const names = perms.map((p) => p.name);

    if (!names.includes(permissionName)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permission' });
    }

    next();
  };
};
