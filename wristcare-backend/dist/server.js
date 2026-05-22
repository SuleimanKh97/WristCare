"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const vitals_1 = __importDefault(require("./src/routes/vitals"));
const auth_1 = __importDefault(require("./src/routes/auth"));
const pool_1 = __importDefault(require("./src/db/pool"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get('/', (req, res) => {
    res.json({ message: 'WristCare API is running!' });
});
app.use('/api/vitals', vitals_1.default);
app.use('/api/auth', auth_1.default);
// Wrap Express with HTTP Server for Socket.io
const server = http_1.default.createServer(app);
// Initialize Socket.io Server
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*', // Allow all origins for graduation mockup, restrict in production
        methods: ['GET', 'POST']
    }
});
// Attach Socket.io to Express application context to share with router
app.set('io', io);
io.on('connection', (socket) => {
    console.log(`Dashboard client connected: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`Dashboard client disconnected: ${socket.id}`);
    });
});
// Test MySQL connection pool on startup
pool_1.default.query('SELECT 1')
    .then(() => {
    console.log('✓ Successfully connected to the XAMPP MySQL database [wristcare]!');
})
    .catch((err) => {
    console.error('✗ Failed to connect to the XAMPP MySQL database:', err.message);
    console.error('Make sure XAMPP MySQL is running on port 3306 and the database name is "wristcare".');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`WristCare server running on port ${PORT}`);
});
