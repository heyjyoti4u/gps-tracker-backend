const { Server } = require('socket.io');
const db = require('./db'); // Import DB connection

const initSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log(`[+] New rider connected: ${socket.id}`);

        // Rider ki location receive aur save karna
        socket.on('updateLocation', async (data) => {
            console.log(`Live Location [${socket.id}]: Lat ${data.lat}, Lng ${data.lng}`);
            
            try {
                // Testing ke liye rider_id 1 use kar rahe hain
                const riderId = data.rider_id || 1; 
                const query = `INSERT INTO locations (rider_id, latitude, longitude) VALUES ($1, $2, $3) RETURNING *`;
                const result = await db.query(query, [riderId, data.lat, data.lng]);
                
                // Admin dashboard ko update bhejne ke liye (optional)
                io.emit('adminDashboardUpdate', result.rows[0]);
            } catch (error) {
                console.error('[-] Database Insert Error:', error.message);
            }
        });

        socket.on('disconnect', () => {
            console.log(`[-] Rider disconnected: ${socket.id}`);
        });
    });

    return io;
};

module.exports = initSocket;