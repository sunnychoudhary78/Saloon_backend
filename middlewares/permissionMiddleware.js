// permissionMiddleware(permissionName)
// Checks whether the authenticated user's role includes the given permission name
module.exports = function permissionMiddleware(permissionName) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const role = req.user.Role;
    if (!role) return res.status(403).json({ message: 'Forbidden: no role assigned' });

    const perms = role.permissions || [];
    const names = perms.map(p => p.name);
    if (!names.includes(permissionName)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permission' });
    }

    next();
  };
};
