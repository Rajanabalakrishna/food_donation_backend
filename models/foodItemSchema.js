const mongoose = require("mongoose");

const foodItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  quantity_kg: { type: Number, required: true },
  freshness_score: { type: Number, min: 0, max: 10, required: true },
  preparation_time: { type: Date, required: true },
  expiry_expected_time: { type: Date, required: true },
  images: [{ type: String }],
});

const foodDonationSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true },
    event_manager_name: { type: String, required: true },
    address: { type: String, required: true },

    location: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
      point: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point",
        },
        coordinates: {
          type: [Number],
          default: [0, 0],
        },
      },
    },

    food_items: [foodItemSchema],
    total_quantity_kg: { type: Number },
    uploaded_at: { type: Date, default: Date.now },
    phone_number: { type: String, required: true },
    alternative_phone_number: { type: String },

    is_ordered: { type: Boolean, default: false },
    ordered_by: { type: String, default: null },
    ordered_by_name: { type: String, default: "" },
    ordered_at: { type: Date, default: null },
    is_delivered: { type: Boolean, default: false },
    delivered_at: { type: Date, default: null },



    order_status: {
      type: String,
      enum: ["available", "pending_allocation", "booked", "picked_up", "delivered", "cancelled"],
      default: "available",
    },

    // ── Booking window fields ──
    booking_requests: [
      {
        ngo_id: { type: String },
        ngo_name: { type: String },
        requested_at: { type: Date, default: Date.now },
      },
    ],
    booking_window_ends: { type: Date, default: null },
  },
  { timestamps: true }
);

// ─── Pre-save hook ───
foodDonationSchema.pre("save", function () {
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
});

// ─── 2dsphere index ───
foodDonationSchema.index({ "location.point": "2dsphere" });

const FoodDonation = mongoose.model("FoodDonation", foodDonationSchema);

FoodDonation.createIndexes()
  .then(() => console.log("✅ 2dsphere index ensured on FoodDonation"))
  .catch((err) => console.error("❌ Index creation error:", err.message));

module.exports = FoodDonation;
