require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { pool } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'production';

// ======================
// Middlewares
// ======================
app.use(cors({
  origin: ['https://redmyclub.com.ar'], // 🔹 Permite solo el dominio correcto
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
  console.log("Intentando autenticación para DNI:", req.body.dni);

  try {
    const [users] = await pool.query('SELECT * FROM users WHERE dni = ?', [req.body.dni]);
    console.log("Usuarios encontrados:", users);

    if (users.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Usuario no encontrado' });
    }

    const user = users[0];

    res.json({
      status: 'success',
      message: 'Autenticación exitosa',
      user: { // 🔹 Asegura que `user` está bien estructurado
        id: user.id,
        nombre: user.nombre,
        dni: user.dni,
        email: user.correo_electronico,
        plan_id: user.plan_id,
        estado: user.estado
      }
    });

    console.log("🔹 Respuesta enviada al frontend:", user);
  } catch (error) {
    console.error("❌ Error en /login:", error);
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
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
  console.log(`🌐 Entorno: ${NODE_ENV}`);
});
