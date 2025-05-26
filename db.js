const mysql = require('mysql2/promise');
require('dotenv').config();

// SSL: desactivado en producción si el certificado es autofirmado
const ssl =
  process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false } // ⚠️ Render + Hostinger = necesario
    : false;

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'srv1056.hstgr.io',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  ssl,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'local',
});

// Función para verificar la conexión
const testConnection = async () => {
  let connection;
  try {
    connection = await pool.getConnection();
    console.log('🔌 Verificando conexión a MySQL...');

    const [rows] = await connection.query(`
      SELECT 
        NOW() AS current_time, 
        DATABASE() AS db_name, 
        CURRENT_USER() AS db_user
    `);

    console.log('✅ Conexión exitosa a MySQL:');
    console.log(`- Hora del servidor: ${rows[0].current_time}`);
    console.log(`- Base de datos: ${rows[0].db_name}`);
    console.log(`- Usuario: ${rows[0].db_user}`);

    const [tables] = await connection.query('SHOW TABLES LIKE "users"');
    if (tables.length === 0) {
      console.warn('⚠️ Advertencia: La tabla "users" no existe');
    }
  } catch (err) {
    console.error('❌ Error de conexión a MySQL:', err);

    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('🔐 Error de autenticación: Revisa las credenciales en .env');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('🔌 Error de conexión: Verifica el host y puerto');
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.error('🗄️ La base de datos especificada no existe');
    } else if (err.code === 'HANDSHAKE_SSL_ERROR') {
      console.error('🔒 Error SSL: Verifica la configuración de certificados');
    }

    if (process.env.NODE_ENV === 'production') process.exit(1);
  } finally {
    if (connection) connection.release();
  }
};

// Eventos
pool.on('acquire', (connection) => {
  console.debug(`🔄 Conexión adquirida (ID: ${connection.threadId})`);
});
pool.on('release', (connection) => {
  console.debug(`🔄 Conexión liberada (ID: ${connection.threadId})`);
});
pool.on('enqueue', () => {
  console.debug('⌛ Esperando conexión disponible');
});

// Exportar pool y función de test
module.exports = {
  pool,
  testConnection,
  initialize: async () => {
    await testConnection();
    return pool;
  }
};
