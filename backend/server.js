import app from './app.js';
import { initDb } from './config/db.js';

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`Server successfully started on port ${PORT}`);
    });
  } catch (err) {
    console.error('Fatal: Server startup failed:', err);
    process.exit(1);
  }
};

startServer();
