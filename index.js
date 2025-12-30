// ===================== IMPORTS =====================
const express = require("express");
const fs = require("fs");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Configuration, OpenAIApi } = require("openai");

require("dotenv").config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ===================== CONFIG =====================
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";
const USERS_FILE = "users.json";

// ===================== USER STORAGE =====================
let users = [];
if (fs.existsSync(USERS_FILE)) {
    users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}

function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ===================== OPENAI SETUP =====================
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(configuration);

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
    users.push({ username, password: hashedPassword, ecs: [], interest: null, extraInfo: "" });
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

    res.json({ token, username, ecs: user.ecs, interest: user.interest, extraInfo: user.extraInfo });
});

// ===================== AUTH MIDDLEWARE =====================
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

// ===================== USER DATA UPDATE =====================
app.post("/user-data", auth, (req, res) => {
    const { ecs, interest, extraInfo } = req.body;

    const user = users.find(u => u.username === req.user.username);
    if (!user) return res.status(400).json({ error: "User not found" });

    if (ecs) user.ecs = ecs;
    if (interest) user.interest = interest;
    if (extraInfo) user.extraInfo = extraInfo;

    saveUsers();
    res.json({ message: "User data updated" });
});

// ===================== AI ENDPOINT =====================
app.post("/ai", auth, async (req, res) => {
    const { percentage, interest, ecs = [] } = req.body;

    if (!percentage) return res.status(400).json({ error: "Percentage required" });

    const ecsString = ecs.length > 0
        ? ecs.map(e => `${e.name} (${e.hours} hrs)`).join(", ")
        : "none";

    const prompt = `
You are an expert Canadian university guidance counselor.
A student has:
- Percentage: ${percentage}%
- Field of interest: ${interest || "not specified"}
- Extracurriculars: ${ecsString}

Provide 3-5 Canadian universities the student is most likely eligible for.
For each university, give:
1. Name
2. Short description (1-2 sentences)
3. Why this university is a good fit (consider percentage, interest, and extracurriculars)
Use real general admission thresholds and make recommendations realistic.
Format your answer clearly with line breaks.
`;

    try {
        const completion = await openai.createChatCompletion({
            model: "gpt-4",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7
        });

        const reply = completion.data.choices[0].message.content;
        res.json({ reply });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "AI request failed", details: err.message });
    }
});

// ===================== START SERVER =====================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port", PORT));
