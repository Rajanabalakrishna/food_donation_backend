const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ngoSchema = new Schema(
  {
    ngoName: {
      type: String,
      required: [true, "NGO name is required"],
      unique: true,
      trim: true,
    },
    registrationNumber: {
      type: String,
      unique: true,
      sparse: true,
    },
    description: {
      type: String,
      trim: true,
    },
    foundedDate: {
      type: Date,
    },
    logo: {
      type: String,
    },
    type: {
      type: String,
      required: [true, "Organization type is required"],
      enum: ["ngo", "trust", "ashram", "foundation", "society", "other"],
      default: "ngo",
    },
    location: {
      address: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      country: { type: String, default: "India" },
      pincode: { type: String, required: true },
      coordinates: {
        latitude: { type: Number },
        longitude: { type: Number },
      },
    },
    totalMembers: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalVolunteers: {
      type: Number,
      default: 0,
      min: 0,
    },
    ashram: {
      hasAshram: { type: Boolean, default: false },
      ashramName: { type: String, trim: true },
      ashramAddress: { type: String },
      ashramCapacity: { type: Number, min: 0 },
      ashramFacilities: [{ type: String }],
    },
    phoneNumber: {
      type: String,
      required: [true, "Phone number is required"],
      validate: {
        validator: function (v) {
          return /^\+?[0-9]\d{9,14}$/.test(v);
        },
        message: "Please enter a valid phone number",
      },
    },
    alternatePhone: {
      type: String,
      validate: {
        validator: function (v) {
          if (!v || v === "") return true;
          return /^\+?[0-9]\d{9,14}$/.test(v);
        },
        message: "Please enter a valid phone number",
      },
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      match: [/\S+@\S+\.\S+/, "Please enter a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
    },
    website: {
      type: String,
    },
    socialMedia: {
      facebook: { type: String },
      twitter: { type: String },
      instagram: { type: String },
    },
    category: {
      type: String,
      enum: [
        "education",
        "healthcare",
        "environment",
        "women_empowerment",
        "child_welfare",
        "animal_welfare",
        "disaster_relief",
        "other",
      ],
      default: "other",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("NGO", ngoSchema);
