require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const { pool } = require('./db');

// Inicialización de la aplicación
const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'production';

// ======================
// Configuración de Seguridad
// ======================

// Configuración de CORS
const corsOptions = {
  origin: [
    'https://redmyclub.com.ar',
    'https://www.redmyclub.com.ar',
    'http://localhost:3000' // Solo para desarrollo
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept'
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  maxAge: 86400
};

// Middlewares de seguridad
app.use(helmet());
app.disable('x-powered-by');
app.use(cors(corsOptions));

// Limitador de tasa para prevenir ataques de fuerza bruta
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // límite de 100 peticiones por IP
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Configuración de body parser
app.use(bodyParser.json({ limit: '10kb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10kb' }));

// Cabeceras de seguridad personalizadas
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// ======================
// Logging en desarrollo
// ======================
if (NODE_ENV === 'development') {
  const morgan = require('morgan');
  app.use(morgan('dev'));
  
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ======================
// Verificación de conexión a la base de datos
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

// Estado del backend
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
    res.status(500).json({ 
      status: 'error', 
      message: 'Error en la base de datos',
      error: NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Endpoint principal
app.get('/', (req, res) => {
  res.json({
    message: 'Gym Management System API',
    status: 'operational',
    version: '1.0.0',
    environment: NODE_ENV,
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

  if (!dni) {
    return res.status(400).json({ 
      status: 'error', 
      message: 'DNI requerido para iniciar sesión' 
    });
  }

  console.log("🔍 Intentando autenticación para DNI:", dni);

  try {
    const [users] = await pool.query('SELECT * FROM users WHERE dni = ?', [dni]);
    console.log("🛠 Datos obtenidos de la DB:", users);

    if (users.length === 0) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'Usuario no encontrado' 
      });
    }

    const user = users[0];

    // Generar token JWT (opcional)
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );

    const responseData = {
      status: 'success',
      message: 'Autenticación exitosa',
      user: {
        id: user.id,
        name: user.name,
        dni: user.dni,
        email: user.email,
        phone: user.phone,
        role: user.role,
        plan_id: user.plan_id,
        status: user.status,
        next_payment_date: user.next_payment_date,
        payment_status: user.payment_status
      },
      token: token
    };

    // Configurar cookie HTTP-only para producción
    if (NODE_ENV === 'production') {
      res.cookie('token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 3600000 // 1 hora
      });
    }

    console.log("📢 Respuesta enviada al frontend:", responseData);
    res.json(responseData);
  } catch (error) {
    console.error("❌ Error en /login:", error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Error en el servidor',
      error: NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ======================
// Manejo de errores
// ======================
app.use((req, res) => {
  res.status(404).json({ 
    status: 'error', 
    message: 'Endpoint no encontrado' 
  });
});

app.use((err, req, res, next) => {
  console.error('Error global:', err);
  
  // Manejo específico para errores JWT
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ 
      status: 'error', 
      message: 'Token inválido o expirado' 
    });
  }

  res.status(500).json({ 
    status: 'error', 
    message: 'Error interno del servidor',
    error: NODE_ENV === 'development' ? err.message : undefined
  });
});

// ======================
// Inicio del servidor
// ======================
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
  console.log(`🌐 Entorno: ${NODE_ENV}`);
  console.log(`🔒 Modo seguro: ${process.env.NODE_ENV === 'production' ? 'ACTIVADO' : 'DESACTIVADO'}`);
  console.log(`🛡️ CORS configurado para: ${corsOptions.origin.join(', ')}`);
});