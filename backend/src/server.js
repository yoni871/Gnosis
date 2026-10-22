require("dotenv").config();

const app = require("./app");

// Use the configured port, or 5000 when none is supplied.
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});