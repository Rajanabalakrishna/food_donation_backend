const express = require("express");
const router = express.Router();
const NGO = require("../models/ngoitemSchema");

// CREATE
router.post("/", async (req, res) => {
  try {
    const ngo = new NGO(req.body);
    const savedNGO = await ngo.save();
    res.status(201).json(savedNGO);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// GET ALL
router.get("/", async (req, res) => {
  try {
    const ngos = await NGO.find();
    res.json(ngos);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET BY ID
router.get("/:id", async (req, res) => {
  try {
    const ngo = await NGO.findById(req.params.id);
    if (!ngo) return res.status(404).json({ message: "NGO not found" });
    res.json(ngo);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// UPDATE
router.put("/:id", async (req, res) => {
  try {
    const updatedNGO = await NGO.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!updatedNGO)
      return res.status(404).json({ message: "NGO not found" });
    res.json(updatedNGO);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE
router.delete("/:id", async (req, res) => {
  try {
    const deletedNGO = await NGO.findByIdAndDelete(req.params.id);
    if (!deletedNGO)
      return res.status(404).json({ message: "NGO not found" });
    res.json({ message: "NGO deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
