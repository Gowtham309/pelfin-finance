import app from './app.js';
import { initDb } from './config/db.js';
import { initMLModel } from './services/ml.service.js';

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await initDb();
    await initMLModel(); // Train Naive Bayes classifier from seed + stored corrections
    app.listen(PORT, () => {
      console.log(`Server successfully started on port ${PORT}`);
    });
  } catch (err) {
    console.error('Fatal: Server startup failed:', err);
    process.exit(1);
  }
};

startServer();
