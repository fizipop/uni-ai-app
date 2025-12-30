// ===================== IMPORTS =====================
const express = require("express");
const fs = require("fs");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ===================== CONFIG =====================
const JWT_SECRET = "supersecretkey"; // later move to env variable
const USERS_FILE = "users.json";

// ===================== USER STORAGE =====================
let users = [];
if (fs.existsSync(USERS_FILE)) {
    users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}

function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ===================== UNIVERSITIES =====================
const universities = [
    { name: "UofT", minPercentage: 90, fields: ["Engineering", "Computer Science", "Arts", "Business"] },
    { name: "TMU", minPercentage: 75, fields: ["Business", "Arts", "Engineering"] },
    { name: "UOttawa", minPercentage: 70, fields: ["Law", "Health Sciences", "Education"] },
    { name: "York", minPercentage: 65, fields: ["Arts", "Business", "Health Sciences"] },
    { name: "Seneca", minPercentage: 60, fields: ["Arts", "Business", "Computer Science"] }
];

// ===================== AUTH ROUTES =====================

// SIGN UP
app.post("/signup", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password)
        return res.status(400).json({ error: "Missing fields" });

    const exists = users.find(u => u.username === username);
    if (exists)
        return res.status(400).json({ error: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ username, password: hashedPassword });
    saveUsers();

    res.json({ message: "Account created successfully" });
});

// LOGIN
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    const user = users.find(u => u.username === username);
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "7d" });

    res.json({ token, username });
});

// AUTH MIDDLEWARE
function auth(req, res, next) {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "Not logged in" });

    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: "Invalid token" });
    }
}

// ===================== AI ENDPOINT =====================
app.post("/ai", auth, (req, res) => {
    const { percentage, interest, ecs = [] } = req.body;

    const possible = universities.filter(u =>
        percentage >= u.minPercentage &&
        (!interest || u.fields.map(f => f.toLowerCase()).includes(interest.toLowerCase()))
    );

    let reply = `Hey ${req.user.username}! With ${percentage}% and ${ecs.length} extracurriculars, `;

    if (possible.length === 0) {
        reply += "your options are limited, but college pathways could help.";
    } else {
        reply += "we recommend the following universities for your interests: ";
        reply += possible.map(u => u.name).join(", ") + ".";
    }

    res.json({ reply });
});

// ===================== START SERVER =====================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port", PORT));
