const express = require('express');
const router = express.Router();
const { DonorToken, NgoToken } = require('../models/FCMModels');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  DONOR ROUTES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// GET — Fetch existing donor FCM token by userId
router.get('/donor/get-token/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const donorToken = await DonorToken.findOne({ userId: userId });

        if (!donorToken) {
            return res.status(404).json({
                success: false,
                message: "No FCM token found for this donor.",
                data: null,
            });
        }

        res.status(200).json({
            success: true,
            message: "Donor FCM token fetched successfully.",
            data: {
                userId: donorToken.userId,
                fcmToken: donorToken.fcmToken,
                lastUpdated: donorToken.lastUpdated,
            },
        });
    } catch (err) {
        console.error("Error fetching donor token:", err.message);
        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
});

// POST — Create or update donor FCM token
router.post('/donor/sync-token', async (req, res) => {
    const { userId, fcmToken } = req.body;

    if (!userId || !fcmToken) {
        return res.status(400).json({
            success: false,
            message: "userId and fcmToken are required.",
        });
    }

    try {
        const updatedDonor = await DonorToken.findOneAndUpdate(
            { userId: userId },
            {
                fcmToken: fcmToken,
                lastUpdated: Date.now(),
            },
            { upsert: true, new: true }
        );

        const wasCreated = updatedDonor.createdAt === updatedDonor.updatedAt;

        res.status(200).json({
            success: true,
            message: wasCreated
                ? "New donor FCM token created."
                : "Donor FCM token updated.",
            data: updatedDonor,
        });
    } catch (err) {
        console.error("Error syncing donor token:", err.message);
        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  NGO ROUTES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// GET — Fetch existing NGO FCM token by userId
router.get('/ngo/get-token/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const ngoToken = await NgoToken.findOne({ userId: userId });

        if (!ngoToken) {
            return res.status(404).json({
                success: false,
                message: "No FCM token found for this NGO.",
                data: null,
            });
        }

        res.status(200).json({
            success: true,
            message: "NGO FCM token fetched successfully.",
            data: {
                userId: ngoToken.userId,
                fcmToken: ngoToken.fcmToken,
                lastUpdated: ngoToken.lastUpdated,
            },
        });
    } catch (err) {
        console.error("Error fetching NGO token:", err.message);
        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
});

// POST — Create or update NGO FCM token
router.post('/ngo/sync-token', async (req, res) => {
    const { userId, fcmToken } = req.body;

    if (!userId || !fcmToken) {
        return res.status(400).json({
            success: false,
            message: "userId and fcmToken are required.",
        });
    }

    try {
        const updatedNgo = await NgoToken.findOneAndUpdate(
            { userId: userId },
            {
                fcmToken: fcmToken,
                lastUpdated: Date.now(),
            },
            { upsert: true, new: true }
        );

        res.status(200).json({
            success: true,
            message: "NGO FCM token synced.",
            data: updatedNgo,
        });
    } catch (err) {
        console.error("Error syncing NGO token:", err.message);
        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
});

module.exports = router;