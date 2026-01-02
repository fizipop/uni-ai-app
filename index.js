// ===================== IMPORTS =====================
const express = require("express");
const fs = require("fs");
const cors = require("cors");
// Store chat history per user (in memory for now)
const catChatHistory = {}; // { username: [ {role, content}, ... ] }

const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const welcomeBackMessages = [
    "Welcome back 👋 Ready to plan your future?",
    "Good to see you again! Let’s continue 🔍",
    "Welcome back! Your journey continues 🚀",
    "Back again? Let’s find your best uni 🎓",
    "Welcome back, scholar 😎"
];

function getRandomWelcome() {
    return welcomeBackMessages[Math.floor(Math.random() * welcomeBackMessages.length)];
}

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

// ===================== OPENAI SETUP =====================
const OpenAI = require("openai");
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});
app.post("/cat-ai", auth, async (req, res) => {
    const { question } = req.body;
    const username = req.user.username;

    // Initialize history if not present
    if (!catChatHistory[username]) {
        catChatHistory[username] = [
            {
                role: "system",
                content: `
You are a friendly Canadian university advisor cat 🐱. 
ONLY answer questions related to Canadian universities, courses, admissions, grades, scholarships, or student life.
Do NOT answer unrelated questions like personal hygiene, cooking, or politics.
Keep answers short, clear, and helpful.
            `
            }
        ];
    }

    // Add user's new question to history
    catChatHistory[username].push({ role: "user", content: question });

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: catChatHistory[username],
            temperature: 0.7
        });

        const answer = completion.choices[0].message.content;

        // Add AI's answer to history
        catChatHistory[username].push({ role: "assistant", content: answer });

        res.json({ answer });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Cat AI failed" });
    }
});


// ===================== AI ENDPOINT =====================
app.post("/ai", auth, async (req, res) => {
    const { percentage, interest, ecs = [] } = req.body;

    if (!percentage) {
        return res.status(400).json({ error: "Percentage required" });
    }

    const ecsString = ecs.length > 0
        ? ecs.map(e => `${e.name} (${e.hours} hrs)`).join(", ")
        : "none";

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo", // ✅ MORE STABLE FOR JSON
            messages: [
                {
                    role: "system",
                    content: "You are a Canadian university admissions expert."
                },
                {
                    role: "user",
                    content: `
Return ONLY valid JSON.
Choose exactly 4 BEST-FIT Canadian universities.

Student profile:
- Percentage: ${percentage}%
- Interest: ${interest || "Not specified"}
- Extracurriculars: ${ecsString}

Respond in this exact format:

{
  "universities": [
    {
      "name": "University Name",
      "reason": "Short explanation (1–2 sentences)"
    }
  ]
}

No extra text.
`
                }
            ],
            response_format: { type: "json_object" }, // 🔥 CRITICAL
            temperature: 0.4
        });

        const raw = completion.choices[0].message.content;
        console.log("RAW AI RESPONSE:", raw); // 👈 DEBUG SAFETY

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch {
            return res.status(500).json({
                error: "AI returned malformed JSON"
            });
        }

        if (!parsed.universities || parsed.universities.length !== 4) {
            return res.status(500).json({
                error: "AI returned invalid structure"
            });
        }

        res.json(parsed);

    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: "AI request failed",
            details: err.message
        });
    }
});

// ===================== LOGOUT =====================
app.post("/logout", auth, (req, res) => {
    // JWT is stateless — nothing to destroy server-side
    res.json({ message: "Logged out successfully" });
});

// ===================== START SERVER =====================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port", PORT));
