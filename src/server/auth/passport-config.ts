import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import type { StorageAdapter } from '../../adapters/storage/types.js';
import { verifyPassword } from '../../adapters/auth/password.js';
import type { User } from '../../shared/types.js';

/**
 * Configure passport with LocalStrategy and session serialization.
 * Must be called once during app startup before any routes are registered.
 */
export function configurePassport(storage: StorageAdapter): void {
  passport.use(
    new LocalStrategy(
      { usernameField: 'email', passwordField: 'password' },
      async (email, password, done) => {
        try {
          const user = await storage.getUserByEmail(email);
          if (!user) {
            return done(null, false, { message: 'Invalid email or password' });
          }
          if (user.revoked) {
            return done(null, false, { message: 'Invalid email or password' });
          }

          const passwordHash = await storage.getUserPasswordHash(email);
          if (!passwordHash) {
            return done(null, false, { message: 'Invalid email or password' });
          }

          const valid = await verifyPassword(password, passwordHash);
          if (!valid) {
            return done(null, false, { message: 'Invalid email or password' });
          }

          return done(null, user);
        } catch (err) {
          return done(err);
        }
      },
    ),
  );

  // Serialize user to session: store only email (minimal session footprint)
  passport.serializeUser((user, done) => {
    done(null, (user as User).email);
  });

  // Deserialize user from session: look up by email, reject if revoked
  passport.deserializeUser(async (email: string, done) => {
    try {
      const user = await storage.getUserByEmail(email);
      if (!user || user.revoked) {
        return done(null, false);
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  });
}
