import express from 'express';
import { getIncomes, createIncome, updateIncome, deleteIncome, confirmIncome } from '../controllers/income.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', getIncomes);
router.post('/', createIncome);
router.put('/:id', updateIncome);
router.delete('/:id', deleteIncome);
router.post('/:id/confirm', confirmIncome);

export default router;
