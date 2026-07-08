import express from 'express';
import { parseNL, chatCoach, forecast } from '../controllers/ai.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { aiRateLimiter } from '../middlewares/rate-limiter.middleware.js';

const router = express.Router();

router.use(requireAuth);

router.post('/parse-nl', aiRateLimiter, parseNL);
router.post('/coach', aiRateLimiter, chatCoach);
router.get('/forecast', forecast);

export default router;
