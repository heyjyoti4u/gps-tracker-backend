const express = require('express');
const cors = require('cors');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Base Route
app.get('/', (req, res) => {
    res.send('GPS Tracker API is running inside the src directory!');
});

module.exports = app;