/**
 * Naive Bayes Text Classifier for Expense Categorization
 * 
 * A from-scratch implementation (no external ML library) for the project report.
 * Trained on seed keyword data and user corrections stored in SQLite.
 * Accuracy is tracked and exposed via the /api/ai/ml-accuracy endpoint.
 */

import { dbAll, dbRun, dbGet } from '../config/db.js';

// ── Category labels ─────────────────────────────────────────────────────────
export const CATEGORIES = [
  'Food', 'Transport', 'Entertainment', 'Utilities', 'Books/Supplies', 'Miscellaneous'
];

// ── Seed training corpus ─────────────────────────────────────────────────────
// Each entry is { text, category }. This gives the model a prior distribution
// even before the user has logged any corrections.
const SEED_CORPUS = [
  // Food
  { text: 'swiggy biryani order', category: 'Food' },
  { text: 'zomato pizza delivery', category: 'Food' },
  { text: 'mcdonalds burger meal', category: 'Food' },
  { text: 'coffee cafe starbucks', category: 'Food' },
  { text: 'grocery vegetables rice dal', category: 'Food' },
  { text: 'lunch canteen mess food', category: 'Food' },
  { text: 'dinner restaurant eat', category: 'Food' },
  { text: 'haldirams snack chips', category: 'Food' },
  { text: 'breakfast idli dosa', category: 'Food' },
  { text: 'milk bread eggs grocery store', category: 'Food' },
  { text: 'kfc chicken wings fast food', category: 'Food' },
  { text: 'subway sandwich wrap', category: 'Food' },
  { text: 'blinkit zepto quick commerce grocery', category: 'Food' },
  { text: 'fruit juice smoothie shake', category: 'Food' },

  // Transport
  { text: 'uber cab ride auto', category: 'Transport' },
  { text: 'ola taxi booking', category: 'Transport' },
  { text: 'metro train bus ticket', category: 'Transport' },
  { text: 'rapido bike ride', category: 'Transport' },
  { text: 'petrol fuel fill pump', category: 'Transport' },
  { text: 'irctc train booking railway', category: 'Transport' },
  { text: 'auto rickshaw fare', category: 'Transport' },
  { text: 'parking toll expressway', category: 'Transport' },
  { text: 'flight airline airasia ticket', category: 'Transport' },
  { text: 'redbus bus ticket travel', category: 'Transport' },

  // Entertainment
  { text: 'netflix subscription streaming', category: 'Entertainment' },
  { text: 'spotify premium music', category: 'Entertainment' },
  { text: 'pvr cinemas movie ticket', category: 'Entertainment' },
  { text: 'bookmyshow concert event', category: 'Entertainment' },
  { text: 'steam game purchase gaming', category: 'Entertainment' },
  { text: 'youtube premium hotstar disney', category: 'Entertainment' },
  { text: 'amazon prime video subscription', category: 'Entertainment' },
  { text: 'bowling arcade game fun zone', category: 'Entertainment' },
  { text: 'bar pub club night out', category: 'Entertainment' },
  { text: 'cricket ipl match ticket', category: 'Entertainment' },

  // Utilities
  { text: 'electricity bill power bescom', category: 'Utilities' },
  { text: 'wifi internet jio fiber broadband', category: 'Utilities' },
  { text: 'mobile recharge airtel prepaid', category: 'Utilities' },
  { text: 'water bill municipality', category: 'Utilities' },
  { text: 'gas cylinder lpg cooking', category: 'Utilities' },
  { text: 'hostel rent room payment', category: 'Utilities' },
  { text: 'phone postpaid bill monthly', category: 'Utilities' },
  { text: 'insurance premium health', category: 'Utilities' },

  // Books/Supplies
  { text: 'amazon textbook purchase online', category: 'Books/Supplies' },
  { text: 'pen notebook stationery xerox', category: 'Books/Supplies' },
  { text: 'coursera udemy online course', category: 'Books/Supplies' },
  { text: 'library book fine college', category: 'Books/Supplies' },
  { text: 'exam fees registration hall ticket', category: 'Books/Supplies' },
  { text: 'calculator pen drive usb accessories', category: 'Books/Supplies' },
  { text: 'printing xerox assignment binding', category: 'Books/Supplies' },
  { text: 'laptop charger mouse keyboard', category: 'Books/Supplies' },
  { text: 'highlighter marker pens pencil', category: 'Books/Supplies' },
  { text: 'reference book subject material', category: 'Books/Supplies' },

  // Miscellaneous
  { text: 'medicine pharmacy medical', category: 'Miscellaneous' },
  { text: 'salon haircut grooming barber', category: 'Miscellaneous' },
  { text: 'clothes shopping dress amazon flipkart', category: 'Miscellaneous' },
  { text: 'gift birthday present friend', category: 'Miscellaneous' },
  { text: 'donation charity temple', category: 'Miscellaneous' },
  { text: 'atm cash withdrawal bank', category: 'Miscellaneous' },
  { text: 'repair service maintenance', category: 'Miscellaneous' },
  { text: 'hotel stay oyo accommodation', category: 'Miscellaneous' },
];

// ── In-memory model state ─────────────────────────────────────────────────────
let model = null; // { wordCounts, categoryCounts, totalDocs, vocab }

// ── Tokenize text ─────────────────────────────────────────────────────────────
const tokenize = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);

// ── Train the Naive Bayes model ───────────────────────────────────────────────
const trainModel = (corpus) => {
  const wordCounts = {};   // { category: { word: count } }
  const categoryCounts = {}; // { category: docCount }
  const vocab = new Set();

  CATEGORIES.forEach(cat => {
    wordCounts[cat] = {};
    categoryCounts[cat] = 0;
  });

  corpus.forEach(({ text, category }) => {
    if (!CATEGORIES.includes(category)) return;
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    tokenize(text).forEach(word => {
      vocab.add(word);
      wordCounts[category][word] = (wordCounts[category][word] || 0) + 1;
    });
  });

  return {
    wordCounts,
    categoryCounts,
    totalDocs: corpus.length,
    vocabSize: vocab.size
  };
};

// ── Classify a text string ────────────────────────────────────────────────────
const classify = (text, trainedModel) => {
  const tokens = tokenize(text);
  const { wordCounts, categoryCounts, totalDocs, vocabSize } = trainedModel;

  let bestCategory = 'Miscellaneous';
  let bestScore = -Infinity;

  CATEGORIES.forEach(cat => {
    const catDocCount = categoryCounts[cat] || 0;
    // Log-prior: log P(category)
    const logPrior = Math.log((catDocCount + 1) / (totalDocs + CATEGORIES.length));

    // Log-likelihood: sum of log P(word | category) with Laplace smoothing
    const catWordCounts = wordCounts[cat] || {};
    const catTotalWords = Object.values(catWordCounts).reduce((a, b) => a + b, 0);

    const logLikelihood = tokens.reduce((acc, word) => {
      const wordCount = catWordCounts[word] || 0;
      return acc + Math.log((wordCount + 1) / (catTotalWords + vocabSize + 1));
    }, 0);

    const score = logPrior + logLikelihood;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat;
    }
  });

  return bestCategory;
};

// ── Initialize / retrain model from DB + seed corpus ─────────────────────────
export const initMLModel = async () => {
  try {
    // Merge seed corpus with stored user corrections
    const corrections = await dbAll(
      `SELECT text, category FROM ml_training_data ORDER BY created_at DESC LIMIT 500`,
      []
    );
    const corpus = [...SEED_CORPUS, ...corrections];
    model = trainModel(corpus);
    console.log(`[ML] Model trained on ${corpus.length} samples (${SEED_CORPUS.length} seed + ${corrections.length} corrections). Vocab size: ${model.vocabSize}`);
  } catch (err) {
    // If the table doesn't exist yet, train on seed only
    model = trainModel(SEED_CORPUS);
    console.log(`[ML] Model trained on ${SEED_CORPUS.length} seed samples (DB corrections not available yet).`);
  }
};

// ── Classify with auto-init ───────────────────────────────────────────────────
export const mlClassify = async (text) => {
  if (!model) await initMLModel();
  return classify(text, model);
};

// ── Store a user correction and retrain ───────────────────────────────────────
export const recordCorrection = async (text, correctCategory) => {
  try {
    await dbRun(
      `INSERT INTO ml_training_data (text, category) VALUES (?, ?)`,
      [text, correctCategory]
    );
    await initMLModel(); // retrain with the new correction
  } catch (err) {
    console.warn('[ML] Failed to store correction:', err.message);
  }
};

// ── Accuracy evaluation ───────────────────────────────────────────────────────
export const evaluateAccuracy = async () => {
  if (!model) await initMLModel();

  // Hold-out test set (not in seed corpus, honest evaluation)
  const testSet = [
    { text: 'paid swiggy 120 for lunch', expected: 'Food' },
    { text: 'auto fare to college', expected: 'Transport' },
    { text: 'netflix monthly charge', expected: 'Entertainment' },
    { text: 'electricity bill paid BESCOM', expected: 'Utilities' },
    { text: 'bought pen notebook at stationery shop', expected: 'Books/Supplies' },
    { text: 'pharmacy medicine paracetamol', expected: 'Miscellaneous' },
    { text: 'ordered pizza zomato', expected: 'Food' },
    { text: 'rapido bike taxi evening', expected: 'Transport' },
    { text: 'pvr movie avengers', expected: 'Entertainment' },
    { text: 'jio recharge 239', expected: 'Utilities' },
    { text: 'coursera python certification', expected: 'Books/Supplies' },
    { text: 'bought shirt clothing store', expected: 'Miscellaneous' },
    { text: 'zomato gold subscription food delivery', expected: 'Food' },
    { text: 'metro card top up travel', expected: 'Transport' },
    { text: 'spotify music monthly sub', expected: 'Entertainment' },
    { text: 'hostel rent monthly payment', expected: 'Utilities' },
  ];

  let correct = 0;
  const results = testSet.map(({ text, expected }) => {
    const predicted = classify(text, model);
    const isCorrect = predicted === expected;
    if (isCorrect) correct++;
    return { text, expected, predicted, correct: isCorrect };
  });

  const accuracy = ((correct / testSet.length) * 100).toFixed(1);

  // Count corrections in DB
  let correctionCount = 0;
  try {
    const row = await dbGet(`SELECT COUNT(*) as cnt FROM ml_training_data`, []);
    correctionCount = row?.cnt || 0;
  } catch (_) {}

  return {
    accuracy: parseFloat(accuracy),
    correct,
    total: testSet.length,
    correctionCount,
    seedSize: SEED_CORPUS.length,
    vocabSize: model.vocabSize,
    results
  };
};
