const express = require("express");
const ngoAuthRouter = express.Router();
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const NGO = require("../../models/ngoitemSchema");
const nodemailer = require("nodemailer");




const ngoOtpStore = {};

const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

const sendOTPEmail = async (email, otp) => {
  let transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  let mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Your OTP for NGO Registration - Food Donate App",
    text: `Your OTP is ${otp}. It is valid for 5 minutes.`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`NGO OTP ${otp} sent to ${email}`);
  } catch (error) {
    console.error("Error sending OTP email:", error);
    throw new Error("Failed to send OTP email.");
  }
};

// ─── 1. NGO SIGN UP (Send OTP) ───
ngoAuthRouter.post("/api/ngo/signUp", async (req, res) => {
  try {
    
    const { email, ngoName, password } = req.body;

    const existingNgo = await NGO.findOne({
      $or: [{ email }, { ngoName }],
    });

    if (existingNgo) {
      return res
        .status(400)
        .json({ message: "NGO with this email or name already exists" });
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    ngoOtpStore[email] = {
      otp,
      expiry: otpExpiry,
      ngoData: req.body,
    };

    await sendOTPEmail(email, otp);
    res.status(200).json({ message: "OTP sent to your email." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── 2. NGO VERIFY OTP (Create NGO in DB) ───
ngoAuthRouter.post("/api/ngo/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const storedOtpData = ngoOtpStore[email];

    if (!storedOtpData || storedOtpData.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP." });
    }

    if (storedOtpData.expiry < new Date()) {
      delete ngoOtpStore[email];
      return res.status(400).json({ message: "OTP has expired." });
    }

    const ngoData = storedOtpData.ngoData;
    const hashedPassword = await bcryptjs.hash(ngoData.password, 8);

    const loc = ngoData.location || {};
    const coords = loc.coordinates || {};
    const ash = ngoData.ashram || {};

    let newNgo = new NGO({
      ngoName: ngoData.ngoName,
      registrationNumber: ngoData.registrationNumber || undefined,
      description: ngoData.description || "",
      type: ngoData.type || "ngo",
      logo: ngoData.logo || "",

      location: {
        address: loc.address || ngoData.address,
        city: loc.city || ngoData.city,
        state: loc.state || ngoData.state,
        country: loc.country || ngoData.country || "India",
        pincode: loc.pincode || ngoData.pincode,
        coordinates: {
          latitude: coords.latitude || ngoData.latitude || 0,
          longitude: coords.longitude || ngoData.longitude || 0,
        },
      },

      totalMembers: ngoData.totalMembers || 0,
      totalVolunteers: ngoData.totalVolunteers || 0,

      ashram: {
        hasAshram: ash.hasAshram || ngoData.hasAshram || false,
        ashramName: ash.ashramName || ngoData.ashramName || "",
        ashramAddress: ash.ashramAddress || ngoData.ashramAddress || "",
        ashramCapacity: ash.ashramCapacity || ngoData.ashramCapacity || 0,
        ashramFacilities:
          ash.ashramFacilities || ngoData.ashramFacilities || [],
      },

      phoneNumber: ngoData.phoneNumber,
      alternatePhone: ngoData.alternatePhone || undefined,
      email: ngoData.email,
      password: hashedPassword,
      website: ngoData.website || "",

      socialMedia: {
        facebook: ngoData.facebook || "",
        twitter: ngoData.twitter || "",
        instagram: ngoData.instagram || "",
      },

      category: ngoData.category || "other",
    });

    newNgo = await newNgo.save();
    delete ngoOtpStore[email];

    res
      .status(200)
      .json({ message: "NGO registered successfully!", ngo: newNgo });
  } catch (error) {
    console.log("Verify-OTP Save Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── 3. NGO SIGN IN ───
ngoAuthRouter.post("/api/ngo/signin", async (req, res) => {
  try {
        console.log("📥 Sign-in request body:", req.body);

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        message: "Email and password are required" 
      });
    }

    console.log("🔍 Searching for NGO with email:", email);


    const ngo = await NGO.findOne({ email });
    if (!ngo) {
      return res
        .status(400)
        .json({ message: "NGO not found with this email" });
    }

    const isMatch = await bcryptjs.compare(password, ngo.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: ngo._id }, "passwordKey");

    res.json({ token, ...ngo._doc });
  } catch (err) {
        console.error("🚨 SIGN-IN ERROR:", err);
    console.error("Stack trace:", err.stack);
    res.status(500).json({ 
      error: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// ─── 4. GET NGO DATA (session restore) ───
ngoAuthRouter.get("/api/ngo/me", async (req, res) => {
  try {
    const token = req.header("x-auth-token");
    if (!token)
      return res.status(401).json({ message: "No token provided" });

    const verified = jwt.verify(token, "passwordKey");
    const ngo = await NGO.findById(verified.id);

    if (!ngo) return res.status(404).json({ message: "NGO not found" });

    res.json({ ...ngo._doc, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = ngoAuthRouter;
