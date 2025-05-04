const fs = require('fs');
const bcrypt = require('bcrypt');
const path = require('path');

const DATABASE_DIR = path.join(__dirname, 'database');
const ADMIN_FILE = path.join(DATABASE_DIR, 'admin.json');

if (!fs.existsSync(DATABASE_DIR)) {
  fs.mkdirSync(DATABASE_DIR, { recursive: true });
}

const adminUsername = 'admin'; // Ganti jika ingin nama lain
const plainPassword = 'admin123'; // Ganti ke password yang diinginkan

bcrypt.hash(plainPassword, 10, (err, hash) => {
  if (err) throw err;

  const adminData = {
    username: adminUsername,
    password: hash
  };

  fs.writeFileSync(ADMIN_FILE, JSON.stringify(adminData, null, 2));
  console.log('admin.json berhasil dibuat dengan username:', adminUsername);
});
