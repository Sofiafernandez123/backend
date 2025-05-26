require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { pool } = require('./db');
const app = express();

// ======================
// Configuration
// ======================
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ======================
// Middlewares
// ======================
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Logging middleware for development
if (NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ======================
// Database Health Check
// ======================
const checkDatabaseConnection = async () => {
  try {
    const [rows] = await pool.query('SELECT 1');
    return rows.length > 0;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
};

// ======================
// Routes
// ======================

// Health Check Endpoint
app.get('/health', async (req, res) => {
  const dbStatus = await checkDatabaseConnection();
  res.json({
    status: 'UP',
    database: dbStatus ? 'CONNECTED' : 'DISCONNECTED',
    environment: NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Enhanced Test Endpoint
app.get('/test', async (req, res) => {
  try {
    const [testQuery, users] = await Promise.all([
      pool.query('SELECT 1 + 1 AS result'),
      pool.query('SELECT COUNT(*) AS count FROM users')
    ]);
    
    res.json({
      status: 'success',
      dbConnection: 'OK',
      testResult: testQuery[0][0].result,
      totalUsers: users[0][0].count,
      environment: {
        dbHost: process.env.DB_HOST,
        dbUser: process.env.DB_USER,
        dbName: process.env.DB_NAME
      }
    });
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Database connection error',
      error: {
        code: error.code,
        errno: error.errno,
        sqlMessage: error.sqlMessage
      }
    });
  }
});

// Main Endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Gym Management System API',
    status: 'operational',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      test: 'GET /test',
      login: 'POST /login',
      registerClient: 'POST /register-client',
      clients: 'GET /clients',
      registerPayment: 'POST /register-payment',
      paymentHistory: 'GET /payment-history'
    }
  });
});

// Authentication Routes
app.post('/login', async (req, res) => {
  const { dni } = req.body;

  if (!dni) {
    return res.status(400).json({ 
      status: 'error',
      message: 'DNI is required' 
    });
  }

  try {
    const [users] = await pool.query(
      'SELECT * FROM users WHERE dni = ?', 
      [dni]
    );

    if (users.length === 0) {
      return res.status(404).json({ 
        status: 'error',
        message: 'User not found' 
      });
    }

    const user = users[0];
    const [plans] = await pool.query(
      'SELECT * FROM plans WHERE id = ?', 
      [user.plan_id]
    );

    if (plans.length === 0 || !plans[0].can_access_client_panel) {
      return res.status(403).json({ 
        status: 'error',
        message: 'Access denied: Invalid plan or no panel access' 
      });
    }

    res.json({ 
      status: 'success',
      message: 'Authentication successful',
      user: {
        id: user.id,
        name: user.name,
        dni: user.dni,
        email: user.email,
        plan: plans[0]
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Server error during authentication',
      error: error.message 
    });
  }
});

// Client Management Routes
app.post('/register-client', async (req, res) => {
  const { name, dni, email, phone, plan_id } = req.body;

  if (!name || !dni || !plan_id) {
    return res.status(400).json({ 
      status: 'error',
      message: 'Name, DNI and Plan are required' 
    });
  }

  try {
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE dni = ?', 
      [dni]
    );

    if (existing.length > 0) {
      return res.status(409).json({ 
        status: 'error',
        message: 'DNI already registered' 
      });
    }

    const [result] = await pool.query(
      `INSERT INTO users 
       (name, dni, email, phone, role, plan_id, status) 
       VALUES (?, ?, ?, ?, 'client', ?, 'active')`,
      [name, dni, email, phone, plan_id]
    );

    res.status(201).json({
      status: 'success',
      message: 'Client registered successfully',
      clientId: result.insertId
    });
  } catch (error) {
    console.error('Client registration error:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Error registering client',
      error: error.sqlMessage 
    });
  }
});

app.get('/clients', async (req, res) => {
  try {
    const [clients] = await pool.query(`
      SELECT u.*, p.name AS plan_name 
      FROM users u
      LEFT JOIN plans p ON u.plan_id = p.id
      WHERE u.role = 'client'
    `);
    res.json({
      status: 'success',
      count: clients.length,
      data: clients
    });
  } catch (error) {
    console.error('Get clients error:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Error fetching clients',
      error: error.message 
    });
  }
});

// Payment Management Routes
app.post('/register-payment', async (req, res) => {
  const { user_id, amount, month } = req.body;

  if (!user_id || !amount || !month) {
    return res.status(400).json({ 
      status: 'error',
      message: 'user_id, amount and month are required' 
    });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    await connection.query(
      `INSERT INTO payments 
       (user_id, amount, payment_date, month) 
       VALUES (?, ?, CURDATE(), ?)`,
      [user_id, amount, month]
    );

    await connection.query(
      `UPDATE users 
       SET payment_status = 'paid', 
           next_payment_date = DATE_ADD(CURDATE(), INTERVAL 30 DAY) 
       WHERE id = ?`,
      [user_id]
    );

    await connection.commit();
    res.json({ 
      status: 'success',
      message: 'Payment registered successfully' 
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Payment registration error:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Error registering payment',
      error: error.sqlMessage 
    });
  } finally {
    if (connection) connection.release();
  }
});

app.get('/payment-history', async (req, res) => {
  try {
    const [payments] = await pool.query(`
      SELECT p.*, u.name AS user_name 
      FROM payments p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.payment_date DESC
      LIMIT 100
    `);
    res.json({
      status: 'success',
      count: payments.length,
      data: payments
    });
  } catch (error) {
    console.error('Payment history error:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Error fetching payment history',
      error: error.message 
    });
  }
});

// ======================
// Error Handling
// ======================
app.use((req, res, next) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found'
  });
});

app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    error: NODE_ENV === 'development' ? err.message : undefined
  });
});

// ======================
// Server Startup
// ======================
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${NODE_ENV}`);
  
  try {
    const [rows] = await pool.query('SELECT NOW() AS db_time');
    console.log('✅ Database connection established');
    console.log(`🕒 Database server time: ${rows[0].db_time}`);
  } catch (error) {
    console.error('❌ Database connection failed:', error);
  }
});