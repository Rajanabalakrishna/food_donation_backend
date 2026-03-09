const mongoose = require('mongoose');

// Donor FCM Token Collection
const DonorTokenSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        fcmToken: {
            type: String,
            required: true,
        },
        lastUpdated: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

// NGO FCM Token Collection
const NgoTokenSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        fcmToken: {
            type: String,
            required: true,
        },
        lastUpdated: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

const DonorToken = mongoose.model('DonorToken', DonorTokenSchema);
const NgoToken = mongoose.model('NgoToken', NgoTokenSchema);

module.exports = { DonorToken, NgoToken };