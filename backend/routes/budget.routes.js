import express from 'express';
import { getBudgets, upsertBudget, getBudgetStatus } from '../controllers/budget.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', getBudgets);
router.post('/', upsertBudget);
router.get('/status', getBudgetStatus);

export default router;
