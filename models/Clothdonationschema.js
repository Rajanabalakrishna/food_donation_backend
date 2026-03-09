const mongoose = require("mongoose");

const clothItemSchema = new mongoose.Schema({
  cloth_type: {
    type: String,
    enum: ["Shirt", "Pant", "Saree", "Dress", "Jacket", "Sweater", "Kids Wear", "Kurta", "Shorts", "Other"],
    required: true,
  },
  size: {
    type: String,
    enum: ["XS", "S", "M", "L", "XL", "XXL", "Kids", "Free Size"],
    required: true,
  },
  age_years: {
    type: String,
    enum: ["Less than 1 year", "1-2 years", "2-3 years", "3-5 years", "5+ years"],
    required: true,
  },
  condition: {
    type: String,
    enum: ["Like New", "Good", "Fair", "Worn"],
    required: true,
  },
  quantity: { type: Number, required: true, min: 1 },
  gender: {
    type: String,
    enum: ["Men", "Women", "Kids", "Unisex"],
    required: true,
  },
  images: [{ type: String }], // Firebase Storage URLs
});

const clothDonationSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true },
    owner_name: { type: String, required: true },
    phone_number: { type: String, required: true },
    alternative_phone_number: { type: String },
    address: { type: String, required: true },

    location: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
      point: {
        type: { type: String, enum: ["Point"], default: "Point" },
        coordinates: { type: [Number], default: [0, 0] },
      },
    },

    cloth_items: [clothItemSchema],
    total_pieces: { type: Number, default: 0 },
    description: { type: String, default: "" },

    is_booked: { type: Boolean, default: false },
    booked_by: { type: String, default: null },
    booked_by_name: { type: String, default: "" },
    booked_at: { type: Date, default: null },
    booking_status: {
      type: String,
      enum: ["available", "booked", "picked_up", "delivered", "cancelled"],
      default: "available",
    },

    // ML booking pool (same pattern as food)
    booking_requests: [
      {
        ngo_id: { type: String },
        ngo_name: { type: String },
        requested_at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// Pre-save: set GeoJSON point
clothDonationSchema.pre("save", function () {
  if (
    this.location &&
    this.location.latitude != null &&
    this.location.longitude != null &&
    this.location.latitude !== 0 &&
    this.location.longitude !== 0
  ) {
    this.location.point = {
      type: "Point",
      coordinates: [this.location.longitude, this.location.latitude],
    };
    this.markModified("location.point");
  }

  // Calculate total_pieces from items
  if (this.cloth_items && this.cloth_items.length > 0) {
    this.total_pieces = this.cloth_items.reduce(
      (sum, item) => sum + (item.quantity || 0),
      0
    );
  }
});

clothDonationSchema.index({ "location.point": "2dsphere" });

const ClothDonation = mongoose.model("ClothDonation", clothDonationSchema);

ClothDonation.createIndexes()
  .then(() => console.log("✅ 2dsphere index ensured on ClothDonation"))
  .catch((err) => console.error("❌ Index creation error:", err.message));

module.exports = ClothDonation;