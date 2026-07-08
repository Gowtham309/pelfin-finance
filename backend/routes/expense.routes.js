import express from 'express';
import multer from 'multer';
import { getExpenses, createExpense, updateExpense, deleteExpense, importCSV, ocrReceipt, handleSMSWebhook } from '../controllers/expense.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = express.Router();
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max file size limit
});

// Expose webhook route before standard auth verification middleware
router.post('/sms-webhook/:userId', handleSMSWebhook);

router.use(requireAuth);

router.get('/', getExpenses);
router.post('/', createExpense);
router.put('/:id', updateExpense);
router.delete('/:id', deleteExpense);
router.post('/import-csv', upload.single('csv'), importCSV);
router.post('/ocr', upload.single('receipt'), ocrReceipt);

export default router;
