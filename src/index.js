import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import storyRoutes from './routes/storyRoutes.js';
import { initDatabase } from './services/dbService.js';

// Load environment variables from .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// Enable CORS for the Vite dev server (localhost:5173)
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

// Parse JSON bodies — limit raised to 50 MB to accommodate base64 images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use('/api', storyRoutes);

// Simple health-check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`   Health check → http://localhost:${PORT}/health`);

  // Initialize the database (create tables if needed)
  try {
    await initDatabase();
  } catch (err) {
    console.warn('⚠️  Database connection failed:', err.message);
    console.warn('   Stories will NOT be saved. Set DATABASE_URL or PG_* vars in .env');
  }
});
