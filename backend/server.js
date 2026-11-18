const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const app = require('./app');
const { connectDatabase } = require('./config/database');

const port = Number(process.env.PORT) || 3000;

async function startServer() {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is missing. Add it to backend/.env before starting the API.');
    }

    let dbConnected = false;
    try {
      await connectDatabase();
      dbConnected = true;
    } catch (dbError) {
      console.error('\n[Database Disconnected]', dbError.message);
      console.error('[Database Disconnected] /api/health and database routes will report 503 until MySQL is available.\n');
    }

    app.listen(port, () => {
      console.log('====================================================');
      console.log(`ServiceHub HTTP server listening on http://localhost:${port}`);
      console.log(`Web Application : http://localhost:${port}/index.html`);
      console.log(`API Health Check: http://localhost:${port}/api/health`);
      console.log(`MySQL Database  : ${dbConnected ? 'CONNECTED' : 'DISCONNECTED (requires MySQL server)'}`);
      console.log('====================================================\n');
    });
  } catch (error) {
    console.error('Could not start ServiceHub API:', error.message);
    process.exit(1);
  }
}

startServer();
