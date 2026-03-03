import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import nitradoRoutes from './routes/nitrado';
import { initializeDiscordStrategy } from './services/discordService';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'your_secret_key', resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

// Initialize Discord OAuth strategy
initializeDiscordStrategy(passport);

// Routes
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/nitrado', nitradoRoutes);

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});