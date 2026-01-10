const jwt = require('jsonwebtoken');
const { User, Role, Permission } = require('../models');

// Auth middleware: verifies JWT and loads user with role and role.permissions
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'Authorization header missing' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token missing' });

  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id, {
      include: [{
        model: Role,
        include: [
          {
            model: Permission,
            as: 'permissions',
            through: { attributes: [] },
            attributes: ['id', 'name']
          }
        ]
      }]
    });

    if (!user || !user.is_active) return res.status(401).json({ message: 'Unauthorized' });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

module.exports = authMiddleware;
