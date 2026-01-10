require('dotenv').config();
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { User, Role } = require('../models');

module.exports = (passport) => {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.OAUTH_CLIENT_ID,
        clientSecret: process.env.OAUTH_CLIENT_SECRET,
        callbackURL: process.env.OAUTH_CALLBACK_URL
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Check if user exists
          let user = await User.findOne({ where: { email: profile.emails[0].value } });

          if (!user) {
            // Assign default role (Employee) if new
            const role = await Role.findOne({ where: { name: 'Employee' } });
            user = await User.create({
              name: profile.displayName,
              email: profile.emails[0].value,
              roleId: role.id,
              active: true
            });
          }

          return done(null, user);
        } catch (err) {
          return done(err, null);
        }
      }
    )
  );

  // Serialize user for session (not required for JWT, but passport needs it)
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    const user = await User.findByPk(id);
    done(null, user);
  });
};
