require('dotenv').config();
const db = require('./db'); 
const http = require('http');
const app = require('./app');
const initSocket = require('./socket');

// Create HTTP Server
const server = http.createServer(app);

// Initialize WebSockets
initSocket(server);

// Start the server
const PORT = 5000;
server.listen(PORT, () => {
    console.log(`Server is running live on http://localhost:${PORT}`);
});