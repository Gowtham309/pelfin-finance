import express from 'express';
import { getGoals, createGoal, depositToGoal, deleteGoal } from '../controllers/goal.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', getGoals);
router.post('/', createGoal);
router.patch('/:id/deposit', depositToGoal);
router.delete('/:id', deleteGoal);

export default router;
