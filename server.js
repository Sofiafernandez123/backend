const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// Ruta de prueba
app.get('/test', async (req, res) => {
  try {
    const [rows] = await pool.promise().query('SELECT 1 + 1 AS result');
    res.json({ message: 'Conexión exitosa', result: rows[0].result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error en la conexión a la base de datos' });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { dni } = req.body;

  try {
    const [rows] = await pool.promise().query('SELECT * FROM users WHERE dni = ?', [dni]);

    if (rows.length === 0) {
      return res.status(401).json({ message: 'DNI no encontrado' });
    }

    const user = rows[0];
    const [planRows] = await pool.promise().query('SELECT * FROM plans WHERE id = ?', [user.plan_id]);

    if (planRows.length === 0 || !planRows[0].can_access_client_panel) {
      return res.status(403).json({ message: 'Tu plan no permite acceso al panel de clientes' });
    }

    res.json({ message: 'Login exitoso', user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al procesar el login' });
  }
});

// Registrar cliente
app.post('/register-client', async (req, res) => {
  const { name, dni, email, phone, plan_id } = req.body;

  try {
    const [existingUser] = await pool.promise().query('SELECT * FROM users WHERE dni = ?', [dni]);

    if (existingUser.length > 0) {
      return res.status(400).json({ message: 'El DNI ya está registrado' });
    }

    await pool.promise().query(
      'INSERT INTO users (name, dni, email, phone, role, plan_id, status) VALUES (?, ?, ?, ?, "client", ?, "active")',
      [name, dni, email, phone, plan_id]
    );

    res.status(201).json({ message: 'Cliente registrado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al registrar el cliente' });
  }
});

// Listar clientes
app.get('/clients', async (req, res) => {
  try {
    const [rows] = await pool.promise().query('SELECT * FROM users WHERE role = "client"');
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener la lista de clientes' });
  }
});

// Registrar pago
app.post('/register-payment', async (req, res) => {
  const { user_id, amount, month } = req.body;

  try {
    await pool.promise().query(
      'INSERT INTO payments (user_id, amount, payment_date, month) VALUES (?, ?, CURDATE(), ?)',
      [user_id, amount, month]
    );

    await pool.promise().query(
      'UPDATE users SET payment_status = "paid", next_payment_date = DATE_ADD(CURDATE(), INTERVAL 30 DAY) WHERE id = ?',
      [user_id]
    );

    res.json({ message: 'Pago registrado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al registrar el pago' });
  }
});

// Historial de pagos
app.get('/payment-history', async (req, res) => {
  try {
    const [rows] = await pool.promise().query(`
      SELECT payments.*, users.name 
      FROM payments 
      JOIN users ON payments.user_id = users.id 
      ORDER BY payment_date DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener el historial de pagos' });
  }
});

const PORT = process.env.PORT || 3001;
pool.promise().query('SELECT 1')
  .then(() => console.log('✅ Conexión a MySQL exitosa'))
  .catch(err => console.error('❌ Error al conectar con MySQL:', err));

app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
