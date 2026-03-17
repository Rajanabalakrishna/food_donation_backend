const express = require("express");
const FoodRouter = express.Router();
const FoodDonation = require("../models/foodItemSchema");
const auth = require("../middlewares/auth");
const NGO = require("../models/ngoitemSchema");
const admin = require("../models/config/firebaseAdmin");
const { DonorToken, NgoToken } = require("../models/FCMModels");
const axios = require("axios"); // ← NEW
const bcrypt = require("bcryptjs");

const ML_SERVICE_URL = "http://localhost:5001"; // ← NEW

// ════════════════════════════════════════════════
//  HELPER: Haversine distance  ← NEW
// ════════════════════════════════════════════════
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ════════════════════════════════════════════════
//  HELPER: Notify all requesting NGOs  ← NEW
// ════════════════════════════════════════════════
async function notifyAllNgos(food, winnerNgoId, winnerNgoName, rankings) {
  const requests = food.booking_requests || [];
  for (const request of requests) {
    try {
      const ngoToken = await NgoToken.findOne({ userId: request.ngo_id });
      if (!ngoToken?.fcmToken) continue;

      const isWinner = request.ngo_id === winnerNgoId;
      const myRank = rankings?.find((r) => r.ngo_id === request.ngo_id);
      const scoreText = myRank
        ? ` Your score: ${myRank.score} (${myRank.interpretation})`
        : "";

      await admin.messaging().send({
        token: ngoToken.fcmToken,
        notification: {
          title: isWinner
            ? "🏆 You got the food allocation!"
            : "❌ Food allocated to another NGO",
          body: isWinner
            ? `ML selected you for ${food.event_manager_name}'s donation.${scoreText}`
            : `${winnerNgoName} was selected.${scoreText} Better luck next time!`,
        },
        data: {
          type: isWinner ? "allocation_won" : "allocation_lost",
          foodId: food._id.toString(),
          winnerNgoName: winnerNgoName,
          score: myRank?.score?.toString() || "0",
        },
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default", badge: 1 } } },
      });
      console.log(`   📱 ${request.ngo_name}: ${isWinner ? "🏆 WON" : "❌ LOST"}`);
    } catch (e) {
      console.error(`FCM error for ${request.ngo_name}:`, e.message);
    }
  }
}

async function notifyNearbyNgosOnUpload(foodDonation, radiusKm = 50) {
  try {
    const donorLat = foodDonation.location.latitude;
    const donorLng = foodDonation.location.longitude;

    if (!donorLat || !donorLng || donorLat === 0 || donorLng === 0) {
      console.log("⚠️ Donation has no valid coordinates. Skipping NGO notification.");
      return;
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📡 SEARCHING NGOs WITHIN", radiusKm, "KM");
    console.log("   Donation Location:", donorLat, donorLng);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Fetch all active NGOs with valid coordinates
    const allNgos = await NGO.find({
      "location.coordinates.latitude": { $exists: true, $ne: 0 },
      "location.coordinates.longitude": { $exists: true, $ne: 0 },
      isActive: true,
    });

    console.log(`📋 Total active NGOs with coordinates: ${allNgos.length}`);

    // Filter NGOs within radius
    const nearbyNgos = [];
    for (const ngo of allNgos) {
      const ngoLat = ngo.location.coordinates.latitude;
      const ngoLng = ngo.location.coordinates.longitude;
      const distance = haversineDistanceKm(donorLat, donorLng, ngoLat, ngoLng);
      
      if (distance <= radiusKm) {
        nearbyNgos.push({ ngo, distanceKm: Math.round(distance * 10) / 10 });
      }
    }

    console.log(`🏢 NGOs within ${radiusKm}km: ${nearbyNgos.length}`);
    if (nearbyNgos.length === 0) return;

    let sent = 0, failed = 0, noToken = 0;

    const itemNames = foodDonation.food_items
      .map((item) => item.name)
      .slice(0, 3)
      .join(", ");
    const extraCount =
      foodDonation.food_items.length > 3
        ? ` +${foodDonation.food_items.length - 3} more`
        : "";

    // Send FCM to each nearby NGO
    for (const { ngo, distanceKm } of nearbyNgos) {
      try {
        // Fetch FCM token for this NGO using their userId
        const ngoToken = await NgoToken.findOne({ userId: ngo._id.toString() });
        
        if (!ngoToken?.fcmToken) {
          noToken++;
          console.log(`   ⏭️ ${ngo.ngoName} — no FCM token`);
          continue;
        }

        // Send FCM notification
        await admin.messaging().send({
          token: ngoToken.fcmToken,
          notification: {
            title: "🍽️ New Food Available Nearby!",
            body: `${foodDonation.event_manager_name} donated ${foodDonation.total_quantity_kg} kg (${itemNames}${extraCount}) — ${distanceKm} km away`,
          },
          data: {
            type: "new_donation_nearby",
            foodId: foodDonation._id.toString(),
            donorName: foodDonation.event_manager_name,
            totalKg: foodDonation.total_quantity_kg.toString(),
            distanceKm: distanceKm.toString(),
            latitude: donorLat.toString(),
            longitude: donorLng.toString(),
            address: foodDonation.address || "",
          },
          android: {
            priority: "high",
            notification: {
              channelId: "food_share_channel",
              sound: "default",
              clickAction: "FLUTTER_NOTIFICATION_CLICK",
            },
          },
          apns: {
            payload: { 
              aps: { 
                sound: "default", 
                badge: 1, 
                "content-available": 1 
              } 
            },
          },
        });

        sent++;
        console.log(`   ✅ Notified: ${ngo.ngoName} (${distanceKm} km away)`);
      } catch (fcmErr) {
        failed++;
        if (
          fcmErr.code === "messaging/registration-token-not-registered" ||
          fcmErr.code === "messaging/invalid-registration-token"
        ) {
          console.log(`   🗑️ Removing stale token for: ${ngo.ngoName}`);
          await NgoToken.deleteOne({ userId: ngo._id.toString() });
        } else {
          console.error(`   ❌ Failed for ${ngo.ngoName}:`, fcmErr.message);
        }
      }
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`📊 NOTIFICATION SUMMARY`);
    console.log(`   Nearby NGOs : ${nearbyNgos.length}`);
    console.log(`   Sent        : ${sent}`);
    console.log(`   No Token    : ${noToken}`);
    console.log(`   Failed      : ${failed}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  } catch (err) {
    console.error("❌ notifyNearbyNgosOnUpload error:", err.message);
  }
}





// ════════════════════════════════════════════════
//  HELPER: Run ML and get winner  ← NEW
// ════════════════════════════════════════════════
async function runMLAndAllocate(food) {
  const requests = food.booking_requests || [];

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`🤖 ML ALLOCATION — ${requests.length} NGO(s) competing`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Only 1 requester — give directly, no ML needed
  if (requests.length === 1) {
    console.log("✅ Single requester — direct allocation");
    return {
      winnerId: requests[0].ngo_id,
      winnerName: requests[0].ngo_name,
      rankings: null,
    };
  }

  // Multiple requesters — call ML
  const donorLat = food.location?.latitude || 0;
  const donorLng = food.location?.longitude || 0;

  let expiryHoursLeft = 24;
  if (food.food_items?.length > 0) {
    const expiry = new Date(food.food_items[0].expiry_expected_time);
    expiryHoursLeft = Math.max(0, (expiry - Date.now()) / (1000 * 60 * 60));
  }

  const ngoDataForML = [];
  for (const request of requests) {
    try {
      const ngo = await NGO.findById(request.ngo_id);
      if (!ngo) continue;

      const ngoLat = ngo.location?.coordinates?.latitude || 0;
      const ngoLng = ngo.location?.coordinates?.longitude || 0;
      const distanceKm = haversineDistanceKm(donorLat, donorLng, ngoLat, ngoLng);

      ngoDataForML.push({
        ngo_id: request.ngo_id,
        ngo_name: request.ngo_name,
        distance_km: Math.round(distanceKm * 10) / 10,
        ngo_members: ngo.totalMembers || 10,
        past_success_rate: ngo.past_success_rate || 0.5,
      });

      console.log(
        `   📋 ${request.ngo_name} — dist: ${distanceKm.toFixed(1)} km, members: ${ngo.totalMembers}`
      );
    } catch (e) {
      console.error(`Error fetching NGO ${request.ngo_id}:`, e.message);
    }
  }

  console.log("📡 Calling ML service...");
  const mlResponse = await axios.post(
    `${ML_SERVICE_URL}/rank`,
    {
      food: {
        food_id: food._id.toString(),
        expiry_hours_left: expiryHoursLeft,
      },
      ngos: ngoDataForML,
    },
    { timeout: 10000 }
  );

  const rankings = mlResponse.data.rankings;
  const winner = rankings[0];

  console.log("🏆 ML Rankings:");
  rankings.forEach((r) => {
    console.log(`   ${r.rank}. ${r.ngo_name} → score: ${r.score} (${r.interpretation})`);
  });

  return {
    winnerId: winner.ngo_id,
    winnerName: winner.ngo_name,
    rankings,
  };
}

// ════════════════════════════════════════════════
//  HELPER: Notify nearby NGOs about new donation
//  (your existing function - unchanged)
// ════════════════════════════════════════════════
async function notifyNearbyNgos(foodDonation, radiusKm = 50) {
  try {
    const donorLat = foodDonation.location.latitude;
    const donorLng = foodDonation.location.longitude;

    if (!donorLat || !donorLng || donorLat === 0 || donorLng === 0) {
      console.log("⚠️ Donation has no valid coordinates. Skipping NGO notification.");
      return;
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📡 SEARCHING NGOs WITHIN", radiusKm, "KM");
    console.log("   Donation Location:", donorLat, donorLng);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const allNgos = await NGO.find({
      "location.coordinates.latitude": { $exists: true, $ne: 0 },
      "location.coordinates.longitude": { $exists: true, $ne: 0 },
      isActive: true,
    });

    console.log(`📋 Total active NGOs with coordinates: ${allNgos.length}`);

    const nearbyNgos = [];
    for (const ngo of allNgos) {
      const ngoLat = ngo.location.coordinates.latitude;
      const ngoLng = ngo.location.coordinates.longitude;
      const distance = haversineDistanceKm(donorLat, donorLng, ngoLat, ngoLng);
      if (distance <= radiusKm) {
        nearbyNgos.push({ ngo, distanceKm: Math.round(distance * 10) / 10 });
      }
    }

    console.log(`🏢 NGOs within ${radiusKm}km: ${nearbyNgos.length}`);
    if (nearbyNgos.length === 0) return;

    let sent = 0, failed = 0, noToken = 0;

    const itemNames = foodDonation.food_items
      .map((item) => item.name)
      .slice(0, 3)
      .join(", ");
    const extraCount =
      foodDonation.food_items.length > 3
        ? ` +${foodDonation.food_items.length - 3} more`
        : "";

    for (const { ngo, distanceKm } of nearbyNgos) {
      try {
        const ngoToken = await NgoToken.findOne({ userId: ngo._id.toString() });
        if (!ngoToken?.fcmToken) {
          noToken++;
          console.log(`   ⏭️ ${ngo.ngoName} — no FCM token`);
          continue;
        }

        await admin.messaging().send({
          token: ngoToken.fcmToken,
          notification: {
            title: "🍽️ New Food Available Nearby!",
            body: `${foodDonation.event_manager_name} donated ${foodDonation.total_quantity_kg} kg (${itemNames}${extraCount}) — ${distanceKm} km away`,
          },
          data: {
            type: "new_donation_nearby",
            foodId: foodDonation._id.toString(),
            donorName: foodDonation.event_manager_name,
            totalKg: foodDonation.total_quantity_kg.toString(),
            distanceKm: distanceKm.toString(),
            latitude: donorLat.toString(),
            longitude: donorLng.toString(),
            address: foodDonation.address || "",
          },
          android: {
            priority: "high",
            notification: {
              channelId: "food_share_channel",
              sound: "default",
              clickAction: "FLUTTER_NOTIFICATION_CLICK",
            },
          },
          apns: {
            payload: { aps: { sound: "default", badge: 1, "content-available": 1 } },
          },
        });

        sent++;
        console.log(`   ✅ Notified: ${ngo.ngoName} (${distanceKm} km away)`);
      } catch (fcmErr) {
        failed++;
        if (
          fcmErr.code === "messaging/registration-token-not-registered" ||
          fcmErr.code === "messaging/invalid-registration-token"
        ) {
          console.log(`   🗑️ Removing stale token for: ${ngo.ngoName}`);
          await NgoToken.deleteOne({ userId: ngo._id.toString() });
        } else {
          console.error(`   ❌ Failed for ${ngo.ngoName}:`, fcmErr.message);
        }
      }
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`📊 NOTIFICATION SUMMARY`);
    console.log(`   Nearby NGOs : ${nearbyNgos.length}`);
    console.log(`   Sent        : ${sent}`);
    console.log(`   No Token    : ${noToken}`);
    console.log(`   Failed      : ${failed}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  } catch (err) {
    console.error("❌ notifyNearbyNgos error:", err.message);
  }
}

// ═══════════════════════════════════════════════
// ─── NGO: GET ALL AVAILABLE FOOD (not booked) ───
// ═══════════════════════════════════════════════
FoodRouter.get("/api/food/available", async (req, res) => {
  try {
    const food = await FoodDonation.find({ is_ordered: false }).sort({
      createdAt: -1,
    });
    res.json({ success: true, count: food.length, donations: food });
  } catch (err) {
    console.error("Available food error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════
// ─── NGO: GET NEARBY FOOD (geo query) ───
// ═══════════════════════════════════════════════
FoodRouter.get("/api/food/nearby", async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ message: "lat and lng are required" });
    }

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    const radiusKm = parseFloat(radius) || 100;
    const radiusMeters = radiusKm * 1000;

    console.log("───── NEARBY FOOD QUERY ─────");
    console.log("NGO Location:", { lat: parsedLat, lng: parsedLng });
    console.log("Radius:", radiusKm, "km (", radiusMeters, "meters)");

    const docsWithPoint = await FoodDonation.countDocuments({
      "location.point.coordinates.0": { $ne: 0 },
      "location.point.coordinates.1": { $ne: 0 },
    });
    console.log("Docs with valid location.point:", docsWithPoint);

    if (docsWithPoint === 0) {
      console.log("⚠️ No documents have location.point set! Run migration.");
      return res.json({
        success: true,
        count: 0,
        donations: [],
        warning: "No documents have GeoJSON point set. Call POST /api/food/migrate-geo first.",
      });
    }

    const food = await FoodDonation.aggregate([
      {
        $geoNear: {
          near: { type: "Point", coordinates: [parsedLng, parsedLat] },
          distanceField: "distance_meters",
          maxDistance: radiusMeters,
          spherical: true,
          key: "location.point",
          query: { is_ordered: false },
        },
      },
      { $sort: { distance_meters: 1 } },
    ]);

    console.log("Results found:", food.length);
    if (food.length > 0) {
      console.log("First result distance:", food[0].distance_meters, "meters");
    }

    res.json({ success: true, count: food.length, donations: food });
  } catch (err) {
    console.error("❌ Nearby food error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get total donation count for a specific donor
FoodRouter.get("/api/donor/donation-count/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const count = await FoodDonation.countDocuments({ user_id: userId });
    res.status(200).json({ success: true, userId: userId, totalDonations: count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════
// ─── NGO: GET THEIR BOOKINGS ───
// ═══════════════════════════════════════════════
FoodRouter.get("/api/food/ngo-bookings/:ngoId", async (req, res) => {
  try {
    const bookings = await FoodDonation.find({
      ordered_by: req.params.ngoId,
    }).sort({ ordered_at: -1 });
    res.json({ success: true, count: bookings.length, donations: bookings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════
// ─── NGO: GET SINGLE FOOD DETAIL ───
// ═══════════════════════════════════════════════
FoodRouter.get("/api/food/:id", async (req, res) => {
  try {
    const food = await FoodDonation.findById(req.params.id);
    if (!food)
      return res.status(404).json({ message: "Food donation not found" });
    res.json(food);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════
// ─── BOOK FOOD — Instant ML Allocation  ← UPDATED
// ═══════════════════════════════════════════════
FoodRouter.post("/api/food/book", async (req, res) => {
  try {
    const { foodId, ngoId, ngoName } = req.body;

    if (!foodId || !ngoId || !ngoName) {
      return res.status(400).json({ message: "foodId, ngoId and ngoName are required" });
    }

    const food = await FoodDonation.findById(foodId);
    if (!food)
      return res.status(404).json({ message: "Food donation not found" });

    // Already fully booked
    if (food.is_ordered) {
      return res.status(400).json({
        message: `This food was already booked by ${food.ordered_by_name || "another NGO"}.`,
        alreadyBooked: true,
      });
    }

    // Already requested by this NGO
    const alreadyRequested = food.booking_requests?.some(
      (r) => r.ngo_id === ngoId
    );
    if (alreadyRequested) {
      return res.status(400).json({
        message: "You already submitted a request for this food.",
        alreadyRequested: true,
      });
    }

    // Add this NGO to the requests pool
    if (!food.booking_requests) food.booking_requests = [];
    food.booking_requests.push({
      ngo_id: ngoId,
      ngo_name: ngoName,
      requested_at: new Date(),
    });
    await food.save();

    const totalRequesters = food.booking_requests.length;
    console.log(
      `\n📥 Book request — Food: ${food.event_manager_name} | NGO: ${ngoName} | Total requesters: ${totalRequesters}`
    );

    // ── Run ML allocation immediately ──
    let winnerId, winnerName, rankings;
    try {
      const result = await runMLAndAllocate(food);
      winnerId = result.winnerId;
      winnerName = result.winnerName;
      rankings = result.rankings;
    } catch (mlErr) {
      console.error("❌ ML failed, using first requester:", mlErr.message);
      winnerId = food.booking_requests[0].ngo_id;
      winnerName = food.booking_requests[0].ngo_name;
      rankings = null;
    }

    // ── Finalize booking ──
    food.is_ordered = true;
    food.ordered_by = winnerId;
    food.ordered_by_name = winnerName;
    food.ordered_at = new Date();
    food.order_status = "booked";
    await food.save();

    console.log(`\n🏆 WINNER: ${winnerName}`);
    console.log(`📦 Food: ${food.event_manager_name} (${food.total_quantity_kg} kg)`);

    // ── Notify donor ──
    try {
      const donorToken = await DonorToken.findOne({ userId: food.user_id });
      if (donorToken?.fcmToken) {
        await admin.messaging().send({
          token: donorToken.fcmToken,
          notification: {
            title: "🎉 Your food has been booked!",
            body: `${winnerName} has booked your donation of ${food.total_quantity_kg} kg.`,
          },
          data: {
            type: "food_booked",
            foodId: food._id.toString(),
            ngoName: winnerName,
          },
          android: {
            priority: "high",
            notification: { channelId: "food_donations", sound: "default" },
          },
          apns: { payload: { aps: { sound: "default", badge: 1 } } },
        });
        console.log(`✅ Donor notified: ${food.user_id}`);
      }
    } catch (fcmErr) {
      console.error("❌ FCM donor notify error:", fcmErr.message);
    }

    // ── Notify all requesting NGOs (only if multiple) ──
    if (totalRequesters > 1) {
      await notifyAllNgos(food, winnerId, winnerName, rankings);
    }

    // ── Build response ──
    const iWon = winnerId === ngoId;
    const myRank = rankings?.find((r) => r.ngo_id === ngoId);

    return res.json({
      success: true,
      allocated: true,
      won: iWon,
      message: iWon
        ? totalRequesters === 1
          ? "Food booked successfully!"
          : `ML selected you as the best match! Score: ${myRank?.score ?? "N/A"}`
        : `ML selected ${winnerName} as the better match. Score: ${myRank?.score ?? "N/A"}`,
      winner: { ngoId: winnerId, ngoName: winnerName },
      myScore: myRank?.score ?? null,
      myInterpretation: myRank?.interpretation ?? null,
      totalCompetitors: totalRequesters,
      rankings: rankings ?? null,
    });
  } catch (err) {
    console.error("❌ Book error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════
// ─── ONE-TIME: Migrate existing docs to add GeoJSON ───
// ═══════════════════════════════════════════════
FoodRouter.post("/api/food/migrate-geo", async (req, res) => {
  try {
    console.log("🔄 Starting GeoJSON migration...");

    const docs = await FoodDonation.find({});
    let migrated = 0, skipped = 0, errors = 0;

    for (const doc of docs) {
      try {
        if (
          doc.location &&
          doc.location.latitude &&
          doc.location.longitude &&
          doc.location.latitude !== 0 &&
          doc.location.longitude !== 0
        ) {
          await FoodDonation.updateOne(
            { _id: doc._id },
            {
              $set: {
                "location.point": {
                  type: "Point",
                  coordinates: [doc.location.longitude, doc.location.latitude],
                },
              },
            }
          );
          migrated++;
          console.log(`✅ Migrated: ${doc._id} → [${doc.location.longitude}, ${doc.location.latitude}]`);
        } else {
          skipped++;
          console.log(`⏭️ Skipped: ${doc._id} (no valid lat/lng)`);
        }
      } catch (docErr) {
        errors++;
        console.error(`❌ Error migrating ${doc._id}:`, docErr.message);
      }
    }

    try {
      await FoodDonation.collection.dropIndex("location.point_2dsphere");
    } catch (e) {}

    await FoodDonation.collection.createIndex(
      { "location.point": "2dsphere" },
      { background: true }
    );

    console.log("✅ 2dsphere index rebuilt");

    res.json({
      success: true,
      message: `Migration complete! Migrated: ${migrated}, Skipped: ${skipped}, Errors: ${errors}`,
      total: docs.length,
      migrated,
      skipped,
      errors,
    });
  } catch (err) {
    console.error("❌ Migration error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

FoodRouter.get("/api/food/debug/geo", async (req, res) => {
  try {
    const docs = await FoodDonation.find({}).select(
      "event_manager_name location is_ordered"
    );

    const results = docs.map((doc) => ({
      id: doc._id,
      name: doc.event_manager_name,
      latitude: doc.location?.latitude,
      longitude: doc.location?.longitude,
      hasPoint: !!doc.location?.point,
      pointType: doc.location?.point?.type,
      pointCoords: doc.location?.point?.coordinates,
      isOrdered: doc.is_ordered,
    }));

    const indexes = await FoodDonation.collection.indexes();

    res.json({
      totalDocs: docs.length,
      docsWithPoint: results.filter(
        (r) =>
          r.hasPoint &&
          r.pointCoords &&
          r.pointCoords[0] !== 0 &&
          r.pointCoords[1] !== 0
      ).length,
      indexes: indexes,
      documents: results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════
// ─── EXISTING DONOR ROUTES (UNCHANGED) ───
// ═══════════════════════════════════════════════

FoodRouter.post("/api/food_donate", async (req, res) => {
  try {
    const {
      user_id,
      event_manager_name,
      address,
      location,
      food_items,
      total_quantity_kg,
      phone_number,
      alternative_phone_number,
    } = req.body;

    const locationWithPoint = {
      ...location,
      point: {
        type: "Point",
        coordinates: [
          parseFloat(location.longitude),
          parseFloat(location.latitude),
        ],
      },
    };

    let foodDonation = new FoodDonation({
      user_id,
      event_manager_name,
      address,
      location: locationWithPoint,
      food_items,
      total_quantity_kg,
      phone_number,
      alternative_phone_number,
    });

    foodDonation = await foodDonation.save();

    // Notify nearby NGOs about new donation
    //notifyNearbyNgos(foodDonation, 50).catch(console.error);
    notifyNearbyNgosOnUpload(foodDonation, 50).catch(console.error);


    res.status(200).json({
      message: "Food donation details uploaded successfully",
      foodDonation,
    });
  } catch (err) {
    console.error("════════════ ERROR STACK TRACE ════════════");
    console.error(err);
    console.error("═══════════════════════════════════════════");
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

FoodRouter.post("/create-direct", async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash("Yashu@1454", 8);
    const ngo = new NGO({
      ngoName: "karthik aashram",
      registrationNumber: "NGO-KA-2025-001",
      description: "Karthik Aashram - Serving the community",
      foundedDate: new Date("2020-01-01"),
      logo: "",
      type: "ashram",
      location: {
        address: "Bengaluru, Karnataka",
        city: "Bengaluru",
        state: "Karnataka",
        country: "India",
        pincode: "560102",
        coordinates: { latitude: 12.899332, longitude: 77.651244 },
      },
      totalMembers: 10,
      totalVolunteers: 5,
      ashram: {
        hasAshram: true,
        ashramName: "karthik aashram",
        ashramAddress: "Bengaluru, Karnataka",
        ashramCapacity: 50,
        ashramFacilities: ["food", "shelter"],
      },
      phoneNumber: "9480262783",
      alternatePhone: "",
      email: "balakrishna152414@gmail.com",
      password: hashedPassword,
      website: "",
      socialMedia: { facebook: "", twitter: "", instagram: "" },
      category: "other",
      isActive: true,
      isVerified: false,
    });

    const savedNGO = await ngo.save();
    console.log("✅ NGO Created Successfully!");
    res.status(201).json({ success: true, message: "NGO created successfully!", ngo: savedNGO });
  } catch (error) {
    console.error("❌ Error:", error.message);
    res.status(400).json({ message: error.message });
  }
});

FoodRouter.get("/api/donations/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;
    let query = { user_id: userId };

    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const foodDonations = await FoodDonation.find(query).sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: foodDonations.length,
      donations: foodDonations,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = FoodRouter;