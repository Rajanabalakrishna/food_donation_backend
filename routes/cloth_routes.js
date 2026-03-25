const express = require("express");
const ClothRouter = express.Router();
const ClothDonation = require("../models/ClothdonationSchema");
const NGO = require("../models/ngoitemSchema");
const admin = require("../models/config/firebaseAdmin");
const { DonorToken, NgoToken } = require("../models/FCMModels");
const axios = require("axios");

const ML_SERVICE_URL = "https://nubilous-toby-nonrateably.ngrok-free.dev";

// ════════════════════════════════════════════════
//  HELPER: Haversine distance
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
//  HELPER: Notify nearby NGOs about new cloth donation
// ════════════════════════════════════════════════
async function notifyNearbyNgos(clothDonation, radiusKm = 50) {
  try {
    const donorLat = clothDonation.location?.latitude;
    const donorLng = clothDonation.location?.longitude;
    if (!donorLat || !donorLng || donorLat === 0 || donorLng === 0) return;

    const allNgos = await NGO.find({
      "location.coordinates.latitude": { $exists: true, $ne: 0 },
      "location.coordinates.longitude": { $exists: true, $ne: 0 },
      isActive: true,
    });

    const nearbyNgos = allNgos
      .map((ngo) => ({
        ngo,
        distanceKm:
          Math.round(
            haversineDistanceKm(
              donorLat,
              donorLng,
              ngo.location.coordinates.latitude,
              ngo.location.coordinates.longitude
            ) * 10
          ) / 10,
      }))
      .filter((n) => n.distanceKm <= radiusKm);

    console.log(`📡 Notifying ${nearbyNgos.length} nearby NGOs about cloth donation`);

    const itemSummary = clothDonation.cloth_items
      ?.map((i) => `${i.quantity}x ${i.cloth_type}`)
      .slice(0, 3)
      .join(", ");

    for (const { ngo, distanceKm } of nearbyNgos) {
      try {
        const ngoToken = await NgoToken.findOne({ userId: ngo._id.toString() });
        if (!ngoToken?.fcmToken) continue;

        await admin.messaging().send({
          token: ngoToken.fcmToken,
          notification: {
            title: "👕 New Cloth Donation Nearby!",
            body: `${clothDonation.owner_name} donated ${clothDonation.total_pieces} clothing items (${itemSummary}) — ${distanceKm} km away`,
          },
          data: {
            type: "new_cloth_donation_nearby",
            clothId: clothDonation._id.toString(),
          },
          android: { priority: "high" },
        });
      } catch (e) {
        if (
          e.code === "messaging/registration-token-not-registered" ||
          e.code === "messaging/invalid-registration-token"
        ) {
          await NgoToken.deleteOne({ userId: ngo._id.toString() });
        }
      }
    }
  } catch (err) {
    console.error("❌ notifyNearbyNgos (cloth) error:", err.message);
  }
}

// ════════════════════════════════════════════════
//  HELPER: Notify all requesting NGOs
// ════════════════════════════════════════════════
async function notifyAllNgos(cloth, winnerNgoId, winnerNgoName, rankings) {
  const requests = cloth.booking_requests || [];
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
            ? "🏆 You got the cloth allocation!"
            : "❌ Cloth allocated to another NGO",
          body: isWinner
            ? `ML selected you for ${cloth.owner_name}'s clothing donation.${scoreText}`
            : `${winnerNgoName} was selected.${scoreText} Better luck next time!`,
        },
        data: {
          type: isWinner ? "cloth_allocation_won" : "cloth_allocation_lost",
          clothId: cloth._id.toString(),
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

// ════════════════════════════════════════════════
//  HELPER: Run ML and get winner
// ════════════════════════════════════════════════
async function runMLAndAllocate(cloth) {
  const requests = cloth.booking_requests || [];

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`🤖 ML CLOTH ALLOCATION — ${requests.length} NGO(s) competing`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (requests.length === 1) {
    console.log("✅ Single requester — direct allocation");
    return {
      winnerId: requests[0].ngo_id,
      winnerName: requests[0].ngo_name,
      rankings: null,
    };
  }

  const donorLat = cloth.location?.latitude || 0;
  const donorLng = cloth.location?.longitude || 0;

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
    } catch (e) {
      console.error(`Error fetching NGO ${request.ngo_id}:`, e.message);
    }
  }

  console.log("📡 Calling ML service for cloth allocation...");
  const mlResponse = await axios.post(
    `${ML_SERVICE_URL}/rank`,
    {
      food: { food_id: cloth._id.toString(), expiry_hours_left: 720 }, // cloth doesn't expire, 30 days default
      ngos: ngoDataForML,
    },
    { timeout: 10000 }
  );

  const rankings = mlResponse.data.rankings;
  const winner = rankings[0];

  console.log("🏆 ML Rankings:");
  rankings.forEach((r) => {
    console.log(`   ${r.rank}. ${r.ngo_name} → score: ${r.score}`);
  });

  return { winnerId: winner.ngo_id, winnerName: winner.ngo_name, rankings };
}

// ════════════════════════════════════════════════
//  POST: Donate clothes
// ════════════════════════════════════════════════
ClothRouter.post("/api/cloth_donate", async (req, res) => {
  try {
    const {
      user_id,
      owner_name,
      phone_number,
      alternative_phone_number,
      address,
      location,
      cloth_items,
      description,
    } = req.body;

    if (!user_id || !owner_name || !phone_number || !address || !location || !cloth_items) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const locationWithPoint = {
      ...location,
      point: {
        type: "Point",
        coordinates: [parseFloat(location.longitude), parseFloat(location.latitude)],
      },
    };

    const totalPieces = cloth_items.reduce((sum, item) => sum + (item.quantity || 0), 0);

    let clothDonation = new ClothDonation({
      user_id,
      owner_name,
      phone_number,
      alternative_phone_number,
      address,
      location: locationWithPoint,
      cloth_items,
      total_pieces: totalPieces,
      description: description || "",
    });

    clothDonation = await clothDonation.save();

    // Notify nearby NGOs
    notifyNearbyNgos(clothDonation, 50).catch(console.error);

    res.status(200).json({
      message: "Cloth donation uploaded successfully",
      clothDonation,
    });
  } catch (err) {
    console.error("❌ cloth_donate error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════
//  GET: All available cloth donations (not booked)
// ════════════════════════════════════════════════
ClothRouter.get("/api/cloth/available", async (req, res) => {
  try {
    const cloths = await ClothDonation.find({ is_booked: false }).sort({ createdAt: -1 });
    res.json({ success: true, count: cloths.length, donations: cloths });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════
//  GET: Nearby cloth donations (geo query)
// ════════════════════════════════════════════════
ClothRouter.get("/api/cloth/nearby", async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;
    if (!lat || !lng)
      return res.status(400).json({ message: "lat and lng are required" });

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    const radiusKm = parseFloat(radius) || 100;
    const radiusMeters = radiusKm * 1000;

    const docsWithPoint = await ClothDonation.countDocuments({
      "location.point.coordinates.0": { $ne: 0 },
      "location.point.coordinates.1": { $ne: 0 },
    });

    if (docsWithPoint === 0) {
      return res.json({
        success: true,
        count: 0,
        donations: [],
        warning: "No GeoJSON points. Run migration first.",
      });
    }

    const cloths = await ClothDonation.aggregate([
      {
        $geoNear: {
          near: { type: "Point", coordinates: [parsedLng, parsedLat] },
          distanceField: "distance_meters",
          maxDistance: radiusMeters,
          spherical: true,
          key: "location.point",
          query: { is_booked: false },
        },
      },
      { $sort: { distance_meters: 1 } },
    ]);

    res.json({ success: true, count: cloths.length, donations: cloths });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════
//  POST: Book cloth donation — Instant ML Allocation
// ════════════════════════════════════════════════
ClothRouter.post("/api/cloth/book", async (req, res) => {
  try {
    const { clothId, ngoId, ngoName } = req.body;

    if (!clothId || !ngoId || !ngoName) {
      return res.status(400).json({ message: "clothId, ngoId and ngoName are required" });
    }

    const cloth = await ClothDonation.findById(clothId);
    if (!cloth) return res.status(404).json({ message: "Cloth donation not found" });

    if (cloth.is_booked) {
      return res.status(400).json({
        message: `Already booked by ${cloth.booked_by_name || "another NGO"}.`,
        alreadyBooked: true,
      });
    }

    const alreadyRequested = cloth.booking_requests?.some((r) => r.ngo_id === ngoId);
    if (alreadyRequested) {
      return res.status(400).json({
        message: "You already submitted a request for this donation.",
        alreadyRequested: true,
      });
    }

    if (!cloth.booking_requests) cloth.booking_requests = [];
    cloth.booking_requests.push({ ngo_id: ngoId, ngo_name: ngoName, requested_at: new Date() });
    await cloth.save();

    const totalRequesters = cloth.booking_requests.length;
    console.log(`\n📥 Cloth book request — NGO: ${ngoName} | Total: ${totalRequesters}`);

    // ── Run ML allocation immediately ──
    let winnerId, winnerName, rankings;
    try {
      const result = await runMLAndAllocate(cloth);
      winnerId = result.winnerId;
      winnerName = result.winnerName;
      rankings = result.rankings;
    } catch (mlErr) {
      console.error("❌ ML failed, using first requester:", mlErr.message);
      winnerId = cloth.booking_requests[0].ngo_id;
      winnerName = cloth.booking_requests[0].ngo_name;
      rankings = null;
    }

    // ── Finalize booking ──
    cloth.is_booked = true;
    cloth.booked_by = winnerId;
    cloth.booked_by_name = winnerName;
    cloth.booked_at = new Date();
    cloth.booking_status = "booked";
    await cloth.save();

    console.log(`\n🏆 WINNER: ${winnerName}`);

    // ── Notify donor ──
    try {
      const donorToken = await DonorToken.findOne({ userId: cloth.user_id });
      if (donorToken?.fcmToken) {
        await admin.messaging().send({
          token: donorToken.fcmToken,
          notification: {
            title: "🎉 Your clothes have been booked!",
            body: `${winnerName} has booked your donation of ${cloth.total_pieces} clothing items.`,
          },
          data: {
            type: "cloth_booked",
            clothId: cloth._id.toString(),
            ngoName: winnerName,
          },
          android: {
            priority: "high",
            notification: { channelId: "cloth_donations", sound: "default" },
          },
          apns: { payload: { aps: { sound: "default", badge: 1 } } },
        });
        console.log(`✅ Donor notified: ${cloth.user_id}`);
      }
    } catch (fcmErr) {
      console.error("❌ FCM donor notify error:", fcmErr.message);
    }

    // ── Notify all requesting NGOs (if multiple) ──
    if (totalRequesters > 1) {
      await notifyAllNgos(cloth, winnerId, winnerName, rankings);
    }

    const iWon = winnerId === ngoId;
    const myRank = rankings?.find((r) => r.ngo_id === ngoId);

    return res.json({
      success: true,
      allocated: true,
      won: iWon,
      message: iWon
        ? totalRequesters === 1
          ? "Clothes booked successfully!"
          : `ML selected you as the best match! Score: ${myRank?.score ?? "N/A"}`
        : `ML selected ${winnerName} as the better match.`,
      winner: { ngoId: winnerId, ngoName: winnerName },
      myScore: myRank?.score ?? null,
      myInterpretation: myRank?.interpretation ?? null,
      totalCompetitors: totalRequesters,
      rankings: rankings ?? null,
    });
  } catch (err) {
    console.error("❌ Cloth book error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT: Update Order Status ───
ClothRouter.put("/api/cloth/order/:id", async (req, res) => {
  try {
    const cloth = await ClothDonation.findById(req.params.id);
    if (!cloth) return res.status(404).json({ message: "Not found" });

    cloth.is_ordered = true;
    cloth.ordered_at = new Date();
    cloth.booking_status = "picked_up";
    await cloth.save();

    res.json({ success: true, cloth });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT: Update Delivery Status ───
ClothRouter.put("/api/cloth/deliver/:id", async (req, res) => {
  try {
    const cloth = await ClothDonation.findById(req.params.id);
    if (!cloth) return res.status(404).json({ message: "Not found" });

    cloth.is_delivered = true;
    cloth.delivered_at = new Date();
    cloth.booking_status = "delivered";
    await cloth.save();

    res.json({ success: true, cloth });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ════════════════════════════════════════════════
//  GET: Single cloth donation detail
// ════════════════════════════════════════════════
ClothRouter.get("/api/cloth/:id", async (req, res) => {
  try {
    const cloth = await ClothDonation.findById(req.params.id);
    if (!cloth) return res.status(404).json({ message: "Cloth donation not found" });
    res.json(cloth);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════
//  GET: NGO's booked cloth donations
// ════════════════════════════════════════════════
ClothRouter.get("/api/cloth/ngo-bookings/:ngoId", async (req, res) => {
  try {
    const bookings = await ClothDonation.find({ booked_by: req.params.ngoId }).sort({ booked_at: -1 });
    res.json({ success: true, count: bookings.length, donations: bookings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════
//  GET: Donor's cloth donations
// ════════════════════════════════════════════════
ClothRouter.get("/api/cloth/donor/:userId", async (req, res) => {
  try {
    const donations = await ClothDonation.find({ user_id: req.params.userId }).sort({ createdAt: -1 });
    res.json({ success: true, count: donations.length, donations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════
//  POST: Migrate geo (one-time)
// ════════════════════════════════════════════════
ClothRouter.post("/api/cloth/migrate-geo", async (req, res) => {
  try {
    const docs = await ClothDonation.find({});
    let migrated = 0, skipped = 0, errors = 0;

    for (const doc of docs) {
      try {
        if (doc.location?.latitude && doc.location?.longitude &&
            doc.location.latitude !== 0 && doc.location.longitude !== 0) {
          await ClothDonation.updateOne(
            { _id: doc._id },
            { $set: { "location.point": { type: "Point", coordinates: [doc.location.longitude, doc.location.latitude] } } }
          );
          migrated++;
        } else {
          skipped++;
        }
      } catch (e) { errors++; }
    }

    try { await ClothDonation.collection.dropIndex("location.point_2dsphere"); } catch (e) {}
    await ClothDonation.collection.createIndex({ "location.point": "2dsphere" }, { background: true });

    res.json({ success: true, message: `Migrated: ${migrated}, Skipped: ${skipped}, Errors: ${errors}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = ClothRouter;