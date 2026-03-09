const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

// ─── Route Imports (matching your actual folder structure) ───
const ngoAuthRouter = require("./routes/auth/ngoAuth");  // routes/auth/ngoAuth.js
const ngoRouter = require("./routes/ngo");                // routes/ngo.js
const configurePassport = require("./routes/oAuth");      // routes/oAuth.js
const passport = require("passport");
const session = require("express-session");
const authRouter = require("./routes/auth");              // routes/auth.js ← NOT auth/auth
const foodRouter = require("./routes/food_donation");  
   // routes/food_donation.js
   const fcmRouter = require("./routes/fcmRoutes"); 

 // Path from your sidebar
const ngoCrudRouter = require('./routes/ngo');      // Path from your sidebar



const app = express();

configurePassport();

const PORT = process.env.PORT || 5000;

app.use(ngoAuthRouter); 

// 2. Handles CRUD like /api/ngo/:id
app.use('/api/ngo', ngoCrudRouter); 

app.use(express.json());
app.use(cors());
app.use("/api/fcm", fcmRouter); 


app.use(ngoAuthRouter);
app.use("/api/ngo", ngoRouter);

app.use(
  session({
    secret: "a random string",
    resave: false,
    saveUninitialized: true,
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use(authRouter);
app.use(foodRouter);

const DB = process.env.MONGODB_URL;

app.get("/", (req, res) => {
  res.json({ message: "SSL Pinning test successful!" });
});

mongoose
  .connect(DB)
  .then(() => {
    console.log("Connected to database successfully");
  })
  .catch((e) => {
    console.log("DB connection error:", e);
  });

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://192.168.1.7:${PORT}`);
});
