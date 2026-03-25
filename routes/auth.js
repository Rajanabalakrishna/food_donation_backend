const express = require("express");
const authRouter = express.Router();
const bcryptjs = require("bcryptjs");
const User = require("../models/user");
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const jwt = require("jsonwebtoken");
const passport = require("passport");
//const configurePassport = require("./config/passport");
const otpStore = {};

const generateOTP = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

const sendOTPEmail = async (email, otp) => {
    let transporter = nodemailer.createTransport({
        service: "Gmail",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    let mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Your OTP for food donation app",
        text: `Your OTP is ${otp}. It is valid for 5 minutes.`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`OTP ${otp} sent to ${email}`);
    } catch (error) {
        console.error("Error sending OTP email:", error);
        throw new Error("Failed to send OTP email.");
    }
};

// --- GOOGLE AUTH ROUTES ---








authRouter.get('/api/user-details/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Find user by ID and exclude the password field for security
        const user = await User.findById(id).select('-password');

        if (!user) {
            return res.status(404).json({ msg: "User with this ID does not exist!" });
        }

        res.json(user);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});




authRouter.post("/api/signUp", async (req, res) => {
    try {
        const { name, email, password, occupation, district, contact } = req.body;
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(400).json({ message: "User with this email already exists" });
        }

        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

        otpStore[email] = {
            otp,
            expiry: otpExpiry,
            userData: { name, email, password, occupation, district, contact }
        };

        await sendOTPEmail(email, otp);
        res.status(200).json({ message: "OTP sent to your email." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

authRouter.post("/api/verify-otp", async (req, res) => {
    try {
        const { email, otp } = req.body;
        const storedOtpData = otpStore[email];

        if (!storedOtpData || storedOtpData.otp !== otp) {
            return res.status(400).json({ message: "Invalid OTP." });
        }

        if (storedOtpData.expiry < new Date()) {
            delete otpStore[email];
            return res.status(400).json({ message: "OTP has expired." });
        }

        const { name, password, occupation, district, contact } = storedOtpData.userData;
        const hashedPassword = await bcryptjs.hash(password, 8);

        let newUser = new User({
            name, email, password: hashedPassword, occupation, district, contact
        });



        newUser = await newUser.save();
        delete otpStore[email];

        





        res.status(200).json({ message: "User signed up successfully!", user: newUser });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}); // Fixed: Removed the trailing comma that was here


authRouter.post("/api/signin", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: "User not found" });

        const isMatch = await bcryptjs.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

        const token = jwt.sign({ id: user._id }, "passwordKey");
        res.json({ token, ...user._doc });
    } catch (err) {
        res.status(500).json(err.message);
    }
});

module.exports = authRouter;
