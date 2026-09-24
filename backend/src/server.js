const pool = require("./db/db");
const cors = require("cors");
const bibleRoutes = require("./routes/bibleRoutes");
const authRoutes = require("./routes/authRoutes");
const searchRoutes = require("./routes/searchRoutes");
const notesRoutes = require("./routes/notesRoutes");

const express = require("express"); // loads the express library

const app = express(); //creates the express server

app.use(cors());
app.use(express.json());
app.use("/api", bibleRoutes);
app.use("/api/auth", authRoutes);
app.use("/api", searchRoutes);
app.use("/api/notes", notesRoutes);

const PORT = 5000; // backend will run http://localhost:5000

app.get("/", (req, res) => { // when someone sends a GET request to /, this function will run.
    res.json({ message: "Bible commentary API is running!"}); // send JSON back to whoever made the request
});


app.listen(PORT, () => { //tells node to start listening to requests
    console.log(`Server running on port ${PORT}`);
});
