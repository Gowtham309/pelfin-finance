import express from 'express';
import { requireAuth } from '../middlewares/auth.middleware.js';
import {
  getSettings, saveSettings, getSafeToSpend,
  mlClassifyText, mlCorrect, mlAccuracy
} from '../controllers/user.controller.js';

const router = express.Router();

router.use(requireAuth);

// Allowance-cycle settings
router.get('/settings', getSettings);
router.put('/settings', saveSettings);
router.get('/safe-to-spend', getSafeToSpend);

// ML Classifier endpoints
router.post('/ml/classify', mlClassifyText);
router.post('/ml/correct', mlCorrect);
router.get('/ml/accuracy', mlAccuracy);

export default router;
