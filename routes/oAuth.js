const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/user");

const configurePassport = () => {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "http://192.168.0.101:5000/auth/google/callback" 
    }, async (accessToken, refreshToken, profile, done) => {
        try {

            const email = profile.emails[0].value;

            let user = await User.findOne({ email });

            if (!user) {
                user = new User({
                    name: profile.displayName,
                    email: email,
                    googleId: profile.id,
                    occupation: "Not Specified",
                    district: "Not Specified",
                    contact: "Not Specified"
                });
                await user.save();
            }
            return done(null, user);
        } catch (error) {
            console.error("Passport Strategy Error:", error);
            return done(error, null);
        }
    }));

    passport.serializeUser((user, done) => done(null, user));
    passport.deserializeUser((user, done) => done(null, user));
};

// CRITICAL: Ensure this line is exactly like this
module.exports = configurePassport; 
