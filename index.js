const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Example university data
const universities = [
    { name: "UofT", minPercentage: 90, fields: ["Engineering", "Computer Science", "Arts", "Business"] },
    { name: "Ryerson", minPercentage: 75, fields: ["Business", "Arts", "Engineering"] },
    { name: "UOttawa", minPercentage: 70, fields: ["Law", "Health Sciences", "Education"] },
    { name: "York University", minPercentage: 65, fields: ["Arts", "Business", "Health Sciences"] },
    { name: "Seneca College", minPercentage: 60, fields: ["Arts", "Business", "Computer Science"] }
];

app.post("/ai", (req, res) => {
    const userData = req.body;
    const percentage = userData.percentage;
    const interest = userData.interest ? userData.interest.toLowerCase() : "";

    // Filter universities based on score and field
    let possible = universities.filter(u =>
        percentage >= u.minPercentage &&
        (interest ? u.fields.map(f => f.toLowerCase()).includes(interest) : true)
    );

    let reply = `Hello ${userData.name}! `;
    reply += `With ${percentage}% and ${userData.ecs.length} extracurriculars, `;

    if (possible.length === 0) {
        reply += `your options are limited due to your current score. Consider improving your grades or exploring colleges suited to your profile.`;
    } else {
        reply += `we recommend the following universities for your interests: `;
        reply += possible.map(u => u.name).join(", ") + ".";
    }

    res.json({ reply });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

