const mysql = require('mysql2/promise');
require('dotenv').config();

// Configuración SSL para Hostinger
const sslOptions = {
  rejectUnauthorized: true,
  ca: `
    -----BEGIN CERTIFICATE-----
    MIIDdzCCAl+gAwIBAgIEAgAAuTANBgkqhkiG9w0BAQUFADBaMQswCQYDVQQGEwJJ
    RTESMBAGA1UEChMJQmFsdGltb3JlMRMwEQYDVQQLEwpDeWJlclRydXN0MSIwIAYD
    VQQDExlCYWx0aW1vcmUgQ3liZXJUcnVzdCBSb290MB4XDTAwMDUxMjE4NDYwMFoX
    DTI1MDUxMjIzNTkwMFowWjELMAkGA1UEBhMCSUUxEjAQBgNVBAoTCUJhbHRpbW9y
    ZTETMBEGA1UECxMKQ3liZXJUcnVzdDEiMCAGA1UEAxMZQmFsdGltb3JlIEN5YmVy
    VHJ1c3QgUm9vdDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAKMEuyKr
    mD1X6CZymrV51Cni4eiVgLGw41uOKymaZN+hXe2wCQVt2yguzmKiYv60iNoS6zjr
    IZ3AQSsBUnuId9Mcj8e6uYi1agnnc+gRQKfRzMpijS3ljwumUNKoUMMo6vWrJYeK
    mpYcqWe4PwzV9/lSEy/CG9VwcPCPwBLKBsua4dnKM3p31vjsufFoREJIE9LAwqSu
    XmD+tqYF/LTdB1kC1FkYmGP1pWPgkAx9XbIGevOF6uvUA65ehD5f/xXtabz5OTZy
    dc93Uk3zyZAsuT3lySNTPx8kmCFcB5kpvcY67Oduhjprl3RjM71oGDHweI12v/ye
    jl0qhqdNkNwnGjkCAwEAAaNFMEMwHQYDVR0OBBYEFOWdWTCCR1jMrPoIVDaGezq1
    BE3wMBIGA1UdEwEB/wQIMAYBAf8CAQMwDgYDVR0PAQH/BAQDAgEGMA0GCSqGSIb3
    DQEBBQUAA4IBAQCFDF2O5G9RaEIFoN27TyclhAO992T9Ldcw46QQF+vaKSm2eT92
    9hkTI7gQCvlYpNRhcL0EYWoSihfVCr3FvDB81ukMJY2GQEsozEVWA3NoBY4mSZXu
    kv5X5G7pXmI1OZkE6S1G/wC8JZJv7D6A9EAG7NDME1sQJTEa3YlTRRZ5b8S5XGd
    3Z6V7W5lK6WDBH1WGj+7p2wK3Z6Z4/3aJnbyU+F5Zk6vZqSkY8I5NgA7YFo2W+Z
    D7ZkqD5YtT6v4Z9ZJH9Z+5Jz0vZJ9w4Y7Yd3y6yq3y7q3y7q3y7q3y7q3y7q3y7
    q3y7q3y7q3y7q3y7q3y7q3y7q3y7q3y7q3y7q3y7q3y7q3y7q3y7q3y7q3y7q3
    -----END CERTIFICATE-----
  `
};

// Configuración del pool de conexiones
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'srv1056.hstgr.io',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  ssl: process.env.NODE_ENV === 'production' ? sslOptions : { rejectUnauthorized: false },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'local'
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

    // Verificar tablas esenciales
    const [tables] = await connection.query('SHOW TABLES LIKE "users"');
    if (tables.length === 0) {
      console.warn('⚠️ Advertencia: La tabla "users" no existe');
    }
  } catch (err) {
    console.error('❌ Error de conexión a MySQL:', err);
    
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('🔐 Error de autenticación: Revisa las credenciales en .env');
      console.error(`Usuario: ${process.env.DB_USER || 'No definido'}`);
      console.error(`Base de datos: ${process.env.DB_NAME || 'No definida'}`);
    } else if (err.code === 'ECONNREFUSED') {
      console.error('🔌 Error de conexión: Verifica el host y puerto');
      console.error(`Host: ${process.env.DB_HOST || 'No definido'}`);
      console.error(`Puerto: ${process.env.DB_PORT || '3306 (default)'}`);
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

// Manejadores de eventos
pool.on('acquire', (connection) => {
  console.debug(`🔄 Conexión adquirida (ID: ${connection.threadId})`);
});

pool.on('release', (connection) => {
  console.debug(`🔄 Conexión liberada (ID: ${connection.threadId})`);
});

pool.on('enqueue', () => {
  console.debug('⌛ Solicitud en cola, esperando conexión disponible');
});

// Exportación
module.exports = {
  pool,
  testConnection,
  initialize: async () => {
    await testConnection();
    return pool;
  }
};