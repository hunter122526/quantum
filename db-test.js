const mysql = require('mysql2');

// Configure database connection
const connection = mysql.createConnection({
  host: '127.0.0.1',            // usually localhost on CloudPanel
  user: 'quantumalphaindiadb',  // your DB username
  password: 'quantumalphaindiadb@2026', // your DB password
  database: 'quantumalphaindiadb2026'
});

// Connect to the database
connection.connect((err) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Database connected successfully!');
  }
  
  connection.end(); // close connection
});
