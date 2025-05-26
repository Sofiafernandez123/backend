require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { pool } = require('./db');

const app = express(); // 🔹 Debes definir `app` ANTES de usarlo
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'production';

// ======================
// Middlewares
// ======================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ======================
// Inicio del servidor
// ======================
app.listen(PORT, async () => {
  console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
  console.log(`🌐 Entorno: ${NODE_ENV}`);

  try {
    const [rows] = await pool.query('SELECT NOW() AS db_time');
    console.log('✅ Conexión a la base de datos establecida');
    console.log(`🕒 Hora del servidor de la base de datos: ${rows[0].db_time}`);
  } catch (error) {
    console.error('❌ Error en la conexión a la base de datos:', error);
  }
});

// ======================
// Middlewares
// ======================
app.use(cors({
  origin: 'https://redmyclub.com.ar', // 🔹 No agregues '/login'
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Logging middleware para desarrollo
if (NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ======================
// Verificación de base de datos
// ======================
const checkDatabaseConnection = async () => {
  try {
    const [rows] = await pool.query('SELECT 1');
    return rows.length > 0;
  } catch (error) {
    console.error('Error en la conexión a la base de datos:', error);
    return false;
  }
};

// ======================
// Rutas
// ======================

// Comprobación de estado del backend
app.get('/health', async (req, res) => {
  const dbStatus = await checkDatabaseConnection();
  res.json({
    status: 'UP',
    database: dbStatus ? 'CONNECTED' : 'DISCONNECTED',
    environment: NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Ruta de prueba
app.get('/test', async (req, res) => {
  try {
    const [testQuery, users] = await Promise.all([
      pool.query('SELECT 1 + 1 AS result'),
      pool.query('SELECT COUNT(*) AS count FROM users')
    ]);
    
    res.json({
      status: 'success',
      testResult: testQuery[0][0].result,
      totalUsers: users[0][0].count
    });
  } catch (error) {
    console.error('Error en /test:', error);
    res.status(500).json({ status: 'error', message: 'Error en la base de datos' });
  }
});

// Endpoint principal
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

// ======================
// Autenticación
// ======================
app.post('/login', async (req, res) => {
  const { dni } = req.body;
console.log("Intentando autenticación para DNI:", dni);
  if (!dni) {
    return res.status(400).json({ status: 'error', message: 'DNI es requerido' });
  }

  try {
    const [users] = await pool.query('SELECT * FROM users WHERE dni = ?', [dni]);

    if (users.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Usuario no encontrado' });
    }

    res.json({
      status: 'success',
      message: 'Autenticación exitosa',
      user: users[0]
    });
  } catch (error) {
    console.error('Error en /login:', error);
    res.status(500).json({ status: 'error', message: 'Error en el servidor' });
  }
});

// ======================
// Manejo de errores
// ======================
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Endpoint no encontrado' });
});

app.use((err, req, res, next) => {
  console.error('Error global:', err);
  res.status(500).json({ status: 'error', message: 'Error interno del servidor' });
});

// ======================
// Inicio del servidor
// ======================

