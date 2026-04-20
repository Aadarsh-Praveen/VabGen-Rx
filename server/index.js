require('dotenv').config();
const { loadSecrets } = require('./secrets');

(async () => {
  await loadSecrets();

  const http       = require('http');
  const multer     = require('multer');
  const jwt        = require('jsonwebtoken');
  const bcrypt     = require('bcrypt');
  const nodemailer = require('nodemailer');
  const {
    BlobServiceClient,
    generateBlobSASQueryParameters,
    BlobSASPermissions,
    StorageSharedKeyCredential,
  } = require('@azure/storage-blob');
  const { sql, poolPromise, patientsPoolPromise } = require('./db');

  const SALT_ROUNDS          = 12;
  const JWT_SECRET           = process.env.JWT_SECRET     || 'vabgenrx_secret';
  const JWT_EXPIRES_IN       = process.env.JWT_EXPIRES_IN || '8h';
  const MAX_ATTEMPTS         = 3;
  const OTP_EXPIRES          = 10 * 60 * 1000;
  const PASSWORD_EXPIRY_DAYS = 90;
  const WARN_AT_DAYS_LEFT_15 = 15;
  const WARN_AT_DAYS_LEFT_5  = 5;

  const loginAttempts = {};
  const otpStore      = {};

  const CONDITION_DEPT_MAP = [
    { keywords: ['asthma', 'copd', 'pneumonia', 'respiratory', 'pulmonary', 'lung', 'bronchitis', 'breathing'], dept: 'Pulmonology' },
    { keywords: ['hypertension', 'heart', 'cardiac', 'chest', 'arrhythmia', 'coronary', 'ecg', 'blood pressure'], dept: 'Cardiology' },
    { keywords: ['diabetes', 'thyroid', 'hypothyroidism', 'hyperthyroidism', 'endocrine', 'insulin', 'glucose'], dept: 'Endocrinology' },
    { keywords: ['seizure', 'epilepsy', 'neuro', 'stroke', 'migraine', 'depression', 'anxiety', 'breakthrough'], dept: 'Neurology' },
    { keywords: ['cancer', 'tumor', 'oncology', 'chemo', 'breast', 'lymphoma', 'malignant'], dept: 'Oncology' },
    { keywords: ['pregnancy', 'obstetric', 'gynecology', 'anemia', 'obgyn', 'trimester', 'maternal'], dept: 'ObGyn' },
    { keywords: ['skin', 'rash', 'dermatitis', 'eczema', 'psoriasis', 'allergic'], dept: 'Dermatology' },
    { keywords: ['bone', 'fracture', 'orthopedic', 'joint', 'spine', 'arthritis'], dept: 'Orthopedics' },
    { keywords: ['child', 'pediatric', 'infant', 'neonatal'], dept: 'Pediatrics' },
  ];

  const inferDept = (reason = '', history = '') => {
    const text = `${reason} ${history}`.toLowerCase();
    for (const { keywords, dept } of CONDITION_DEPT_MAP) {
      if (keywords.some(k => text.includes(k))) return dept;
    }
    return 'General Medicine';
  };

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  const sendOTPEmail = async (email, otp) => {
    await transporter.sendMail({
      from:    `"VabGen Rx Security" <${process.env.SMTP_EMAIL}>`,
      to:      email,
      subject: 'VabGen Rx — Account Unlock Code',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px">
          <h2 style="color:#1e293b;margin-bottom:8px">Account Unlock Request</h2>
          <p style="color:#475569">Your VabGen Rx account has been temporarily locked due to multiple failed login attempts.</p>
          <p style="color:#475569">Use the code below to unlock your account and reset your password:</p>
          <div style="background:#f1f5f9;border-radius:8px;padding:20px;text-align:center;margin:24px 0">
            <span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#1a73e8">${otp}</span>
          </div>
          <p style="color:#94a3b8;font-size:13px">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
          <p style="color:#94a3b8;font-size:13px">If you did not request this, please contact your system administrator immediately.</p>
        </div>
      `,
    });
  };

  const sendPasswordExpiryWarningEmail = async (email, name, daysLeft) => {
    const isUrgent = daysLeft <= 5;
    await transporter.sendMail({
      from:    `"VabGen Rx Security" <${process.env.SMTP_EMAIL}>`,
      to:      email,
      subject: `VabGen Rx — Password Expires in ${daysLeft} Day${daysLeft !== 1 ? 's' : ''}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px">
          <h2 style="color:#1e293b;margin-bottom:8px">Password Expiry Notice</h2>
          <p style="color:#475569">Hi <strong>${name}</strong>,</p>
          <p style="color:#475569">Your VabGen Rx password will expire in <strong style="color:${isUrgent ? '#ef4444' : '#f59e0b'}">${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>.</p>
          <div style="background:${isUrgent ? '#fef2f2' : '#fffbeb'};border:1px solid ${isUrgent ? '#fca5a5' : '#fcd34d'};border-radius:8px;padding:16px;margin:20px 0">
            <p style="color:${isUrgent ? '#dc2626' : '#92400e'};margin:0;font-size:14px">
              ${isUrgent ? '🚨 Urgent:' : '⚠️'} Please update your password before it expires to avoid being locked out.
            </p>
          </div>
          <p style="color:#475569">Log in to VabGen Rx and go to <strong>Settings → Change Password</strong> to update it.</p>
          <p style="color:#94a3b8;font-size:13px">If you need help, contact your system administrator.</p>
        </div>
      `,
    });
  };

  const sendPasswordExpiredEmail = async (email, name) => {
    await transporter.sendMail({
      from:    `"VabGen Rx Security" <${process.env.SMTP_EMAIL}>`,
      to:      email,
      subject: 'VabGen Rx — Password Expired — Account Blocked',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px">
          <h2 style="color:#dc2626;margin-bottom:8px">Account Blocked</h2>
          <p style="color:#475569">Hi <strong>${name}</strong>,</p>
          <p style="color:#475569">Your VabGen Rx password has not been changed in <strong>90 days</strong> and your account has been <strong style="color:#dc2626">blocked</strong> for security reasons.</p>
          <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px;margin:20px 0">
            <p style="color:#dc2626;margin:0;font-size:14px">🔒 To reactivate your account, please contact your system administrator.</p>
          </div>
        </div>
      `,
    });
  };

  const sendPasswordChangedEmail = async (email, name) => {
    await transporter.sendMail({
      from:    `"VabGen Rx Security" <${process.env.SMTP_EMAIL}>`,
      to:      email,
      subject: 'VabGen Rx — Password Changed Successfully',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px">
          <h2 style="color:#1e293b;margin-bottom:8px">Password Changed</h2>
          <p style="color:#475569">Hi <strong>${name}</strong>,</p>
          <p style="color:#475569">Your VabGen Rx password has been changed successfully.</p>
          <p style="color:#475569">If you did not make this change, please contact your administrator immediately.</p>
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px;margin:20px 0">
            <p style="color:#166534;margin:0;font-size:14px">✅ Password updated on ${new Date().toLocaleString()}</p>
          </div>
        </div>
      `,
    });
  };

  const upload = multer({ storage: multer.memoryStorage() });

  const blobServiceClient = BlobServiceClient.fromConnectionString(
    process.env.AZURE_STORAGE_CONNECTION_STRING
  );
  const containerClient = blobServiceClient.getContainerClient(
    process.env.AZURE_CONTAINER_NAME
  );

  // ── SAS token helper ────────────────────────────────────────────────────────
  const _parseStorageConnStr = (connStr) => {
    const parts = {};
    (connStr || '').split(';').forEach(part => {
      const eq = part.indexOf('=');
      if (eq > 0) parts[part.slice(0, eq)] = part.slice(eq + 1);
    });
    return { accountName: parts.AccountName || '', accountKey: parts.AccountKey || '' };
  };

  const generateVoiceNoteSasUrl = (blobName) => {
    try {
      const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
      const { accountName, accountKey } = _parseStorageConnStr(connStr);
      if (!accountName || !accountKey) {
        console.warn('SAS: Missing storage credentials — returning null');
        return null;
      }
      const credential = new StorageSharedKeyCredential(accountName, accountKey);
      const sasToken   = generateBlobSASQueryParameters(
        {
          containerName: process.env.AZURE_CONTAINER_NAME,
          blobName,
          permissions:   BlobSASPermissions.parse('r'),
          startsOn:      new Date(),
          expiresOn:     new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        },
        credential
      ).toString();
      return `https://${accountName}.blob.core.windows.net/${process.env.AZURE_CONTAINER_NAME}/${blobName}?${sasToken}`;
    } catch (err) {
      console.error('SAS generation error:', err.message);
      return null;
    }
  };

  const parseMultipart = (req) => new Promise((resolve, reject) => {
    upload.single('image')(req, {}, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const parseMultipartField = (req, fieldName) => new Promise((resolve, reject) => {
    upload.single(fieldName)(req, {}, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const getBody = (req) => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });

  const sendJSON = (res, code, data) => {
    res.writeHead(code, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end(JSON.stringify(data));
  };

  const verifyToken = (req) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    try { return jwt.verify(token, JWT_SECRET); }
    catch { return null; }
  };

  // ── Public routes (no token required) ─────────────────────────────────────
  const PUBLIC_ROUTES = [
    { method: 'POST', url: '/api/signin'            },
    { method: 'POST', url: '/api/register'          },
    { method: 'POST', url: '/api/send-unlock-otp'   },
    { method: 'POST', url: '/api/verify-unlock-otp' },
    { method: 'POST', url: '/api/reset-password'    },
    { method: 'GET',  url: '/'                      },
    { method: 'POST', url: '/api/patient/signin'    },
    { method: 'GET',  url: '/api/users'             },
  ];

  const PUBLIC_PREFIXES = [
    '/api/profile',
    '/api/password-expiry-status',
    '/api/appointments/doctor/',
  ];

  const isPublic = (method, url) =>
    PUBLIC_ROUTES.some(r => r.method === method && r.url === url) ||
    PUBLIC_PREFIXES.some(p => url.startsWith(p));

  const urlPath = (url) => url.split('?')[0];

  const canAccessPatient = async (pool, patientNo, patientType, doctorDept) => {
    if (!doctorDept) return true;
    const tbl = patientType === 'IP' ? 'patient_records' : 'outpatient_records';
    const col = patientType === 'IP' ? 'IP_No'           : 'OP_No';
    const direct = await pool.request()
      .input('no',   sql.VarChar, patientNo)
      .input('dept', sql.VarChar, doctorDept)
      .query(`SELECT 1 AS ok FROM dbo.${tbl} WHERE ${col}=@no AND Dept=@dept`);
    if (direct.recordset.length > 0) return true;
    const ref = await pool.request()
      .input('no',   sql.VarChar, patientNo)
      .input('type', sql.VarChar, patientType)
      .input('dept', sql.VarChar, doctorDept)
      .query(`SELECT 1 AS ok FROM dbo.patient_referral_access
              WHERE Patient_No=@no AND Patient_Type=@type AND To_Dept=@dept`);
    return ref.recordset.length > 0;
  };

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    console.log(`➡️  ${req.method} ${req.url}`);

    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200); res.end('Backend is running!'); return;
    }

    if (!isPublic(req.method, req.url)) {
      const decoded = verifyToken(req);
      if (!decoded) return sendJSON(res, 401, { message: 'Unauthorized: Invalid or expired token' });
      req.user = decoded;
    }

    // ── Upload image ───────────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/api/upload-image') {
      try {
        await parseMultipart(req);
        const file = req.file;
        if (!file) return sendJSON(res, 400, { message: 'No file uploaded' });
        const blobName = `${Date.now()}-${file.originalname}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.uploadData(file.buffer, {
          blobHTTPHeaders: { blobContentType: file.mimetype }
        });
        sendJSON(res, 200, { imageUrl: blockBlobClient.url });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── Get user profile ───────────────────────────────────────────────────
    if (req.method === 'GET' && req.url.startsWith('/api/profile')) {
      const email = decodeURIComponent(req.url.split('?email=')[1] || '');
      try {
        const pool = await poolPromise;
        const result = await pool.request()
          .input('email', sql.VarChar, email)
          .query('SELECT * FROM users WHERE email = @email');
        if (result.recordset.length > 0) {
          const user = result.recordset[0];
          if (user.dob instanceof Date) user.dob = user.dob.toISOString().split('T')[0];
          delete user.password;
          sendJSON(res, 200, { user });
        } else {
          sendJSON(res, 404, { message: 'User not found' });
        }
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── Doctor sign in ─────────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/api/signin') {
      const { email, password } = await getBody(req);
      if (!email || !password)
        return sendJSON(res, 400, { message: 'Email and password required.' });

      const attempts = loginAttempts[email];
      if (attempts && attempts.locked)
        return sendJSON(res, 423, { message: 'Account locked.', locked: true, email });

      try {
        const pool = await poolPromise;
        const result = await pool.request()
          .input('email', sql.VarChar, email)
          .query('SELECT * FROM users WHERE email = @email');
        if (result.recordset.length === 0)
          return sendJSON(res, 401, { message: 'Invalid email or password' });

        const user  = result.recordset[0];
        const match = await bcrypt.compare(password, user.password);

        if (!match) {
          if (!loginAttempts[email]) loginAttempts[email] = { count: 0, locked: false };
          loginAttempts[email].count += 1;
          const remaining = MAX_ATTEMPTS - loginAttempts[email].count;
          if (loginAttempts[email].count >= MAX_ATTEMPTS) {
            loginAttempts[email].locked = true;
            return sendJSON(res, 423, { message: 'Account locked after 3 failed attempts.', locked: true, email });
          }
          return sendJSON(res, 401, {
            message: `Invalid email or password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
            attemptsLeft: remaining,
          });
        }

        const changedAt = user.password_changed_at ? new Date(user.password_changed_at) : new Date(0);
        const diffDays  = Math.floor((new Date() - changedAt) / (1000 * 60 * 60 * 24));
        const daysLeft  = PASSWORD_EXPIRY_DAYS - diffDays;

        if (daysLeft <= 0) {
          sendPasswordExpiredEmail(email, user.name).catch(() => {});
          return sendJSON(res, 403, { message: 'Your password has expired.', passwordExpired: true, email });
        }

        delete loginAttempts[email];

        const token = jwt.sign(
          {
            id:         user.id,
            email:      user.email,
            name:       user.name,
            role:       user.designation || 'doctor',
            department: user.department,
          },
          JWT_SECRET,
          { expiresIn: JWT_EXPIRES_IN }
        );

        delete user.password;
        delete user.password_changed_at;

        const passwordWarning = { daysLeft, urgent: daysLeft <= WARN_AT_DAYS_LEFT_5 };
        if (daysLeft === WARN_AT_DAYS_LEFT_15 || daysLeft === WARN_AT_DAYS_LEFT_5) {
          sendPasswordExpiryWarningEmail(email, user.name, daysLeft).catch(() => {});
        }

        sendJSON(res, 200, { message: 'Sign in successful', token, user, passwordWarning });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── Send unlock OTP ────────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/api/send-unlock-otp') {
      const { email } = await getBody(req);
      if (!email) return sendJSON(res, 400, { message: 'Email required.' });
      try {
        const pool = await poolPromise;
        const result = await pool.request()
          .input('email', sql.VarChar, email)
          .query('SELECT id, name FROM users WHERE email = @email');
        if (!result.recordset.length)
          return sendJSON(res, 404, { message: 'Email not found.' });
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        otpStore[email] = { otp, expiresAt: Date.now() + OTP_EXPIRES };
        await sendOTPEmail(email, otp);
        sendJSON(res, 200, { message: 'OTP sent to your email.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── Verify unlock OTP ──────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/api/verify-unlock-otp') {
      const { email, otp } = await getBody(req);
      if (!email || !otp) return sendJSON(res, 400, { message: 'Email and OTP required.' });
      const record = otpStore[email];
      if (!record) return sendJSON(res, 400, { message: 'No OTP found. Please request a new one.' });
      if (Date.now() > record.expiresAt) {
        delete otpStore[email];
        return sendJSON(res, 400, { message: 'OTP has expired. Please request a new one.' });
      }
      if (record.otp !== otp) return sendJSON(res, 400, { message: 'Invalid OTP. Please try again.' });
      delete otpStore[email];
      sendJSON(res, 200, { message: 'OTP verified.' });
      return;
    }

    // ── Reset password ─────────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/api/reset-password') {
      const { email, newPassword } = await getBody(req);
      if (!email || !newPassword) return sendJSON(res, 400, { message: 'Email and new password required.' });
      if (newPassword.length < 8) return sendJSON(res, 400, { message: 'Password must be at least 8 characters.' });
      try {
        const pool = await poolPromise;
        const result = await pool.request()
          .input('email', sql.VarChar, email)
          .query('SELECT name FROM users WHERE email = @email');
        if (!result.recordset.length) return sendJSON(res, 404, { message: 'User not found.' });
        const { name } = result.recordset[0];
        const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await pool.request()
          .input('email',    sql.VarChar,  email)
          .input('password', sql.VarChar,  hash)
          .input('now',      sql.DateTime, new Date())
          .query('UPDATE users SET password = @password, password_changed_at = @now WHERE email = @email');
        delete loginAttempts[email];
        await sendPasswordChangedEmail(email, name);
        sendJSON(res, 200, { message: 'Password reset successfully. Please login.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── Register doctor ────────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/api/register') {
      const { hospital_id, licence_no, name, designation, department,
              dob, age, sex, address, contact_no, email, password } = await getBody(req);
      if (!email || !password) return sendJSON(res, 400, { message: 'Email and password required.' });
      try {
        const pool = await poolPromise;
        const existing = await pool.request()
          .input('email', sql.VarChar, email)
          .query('SELECT id FROM users WHERE email = @email');
        if (existing.recordset.length > 0)
          return sendJSON(res, 409, { message: 'Email already registered.' });
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        await pool.request()
          .input('hospital_id',  sql.VarChar, hospital_id  || '')
          .input('licence_no',   sql.VarChar, licence_no   || '')
          .input('name',         sql.VarChar, name         || '')
          .input('designation',  sql.VarChar, designation  || '')
          .input('department',   sql.VarChar, department   || '')
          .input('dob',          sql.Date,    dob          || null)
          .input('age',          sql.Int,     age          || null)
          .input('sex',          sql.VarChar, sex          || '')
          .input('address',      sql.VarChar, address      || '')
          .input('contact_no',   sql.VarChar, contact_no   || '')
          .input('email',        sql.VarChar, email)
          .input('password',     sql.VarChar, hashedPassword)
          .query(`INSERT INTO users
            (hospital_id, licence_no, name, designation, department,
             dob, age, sex, address, contact_no, email, password)
            VALUES
            (@hospital_id, @licence_no, @name, @designation, @department,
             @dob, @age, @sex, @address, @contact_no, @email, @password)`);
        sendJSON(res, 201, { message: 'Registration successful' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── Update address ─────────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/api/profile/update-address') {
      const { email, address } = await getBody(req);
      if (!email || !address) return sendJSON(res, 400, { message: 'Email and address required.' });
      try {
        const pool = await poolPromise;
        await pool.request()
          .input('email',   sql.VarChar, email)
          .input('address', sql.VarChar, JSON.stringify(address))
          .query('UPDATE users SET address = @address WHERE email = @email');
        sendJSON(res, 200, { message: 'Address updated.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── Change password ────────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/api/profile/change-password') {
      const { email, currentPassword, newPassword } = await getBody(req);
      if (!email || !currentPassword || !newPassword)
        return sendJSON(res, 400, { message: 'All fields required.' });
      try {
        const pool = await poolPromise;
        const result = await pool.request()
          .input('email', sql.VarChar, email)
          .query('SELECT password FROM users WHERE email = @email');
        if (!result.recordset.length) return sendJSON(res, 404, { message: 'User not found.' });
        const match = await bcrypt.compare(currentPassword, result.recordset[0].password);
        if (!match) return sendJSON(res, 401, { message: 'Current password is incorrect.' });
        const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await pool.request()
          .input('email',    sql.VarChar,  email)
          .input('password', sql.VarChar,  newHash)
          .input('now',      sql.DateTime, new Date())
          .query('UPDATE users SET password = @password, password_changed_at = @now WHERE email = @email');
        sendJSON(res, 200, { message: 'Password changed successfully.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── Get all users ──────────────────────────────────────────────────────
    if (req.method === 'GET' && req.url === '/api/users') {
      try {
        const pool = await poolPromise;
        const result = await pool.request()
          .query('SELECT name, department, designation FROM dbo.users ORDER BY name ASC');
        sendJSON(res, 200, { users: result.recordset });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── Get all IP patients ────────────────────────────────────────────────
    if (req.method === 'GET' && req.url === '/api/patients') {
      try {
        const pool       = await patientsPoolPromise;
        const doctorDept = req.user.department;
        const result     = await pool.request()
          .input('dept', sql.VarChar, doctorDept)
          .query(`
            SELECT DISTINCT p.IP_No, p.Name, p.Age, p.Sex, p.Race, p.Ethnicity,
              p.Preferred_Language, p.Occupation, p.Dept, p.DOA, p.DOD,
              p.Reason_for_Admission, p.Past_Medical_History, p.Past_Medication_History,
              p.Smoker, p.Alcoholic, p.Insurance_Type,
              p.Weight_kg, p.Height_cm, p.BMI, p.Followup_Outcome
            FROM dbo.patient_records p
            LEFT JOIN dbo.patient_referral_access r
              ON r.Patient_No = p.IP_No AND r.Patient_Type = 'IP' AND r.To_Dept = @dept
            WHERE p.Dept = @dept OR r.To_Dept = @dept
              OR @dept IS NULL
            ORDER BY p.IP_No ASC
          `);
        sendJSON(res, 200, { patients: result.recordset });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── Get single IP patient ──────────────────────────────────────────────
    if (req.method === 'GET' && req.url.startsWith('/api/patients/')) {
      const ipNo = decodeURIComponent(req.url.split('/api/patients/')[1]);
      if (!ipNo) return sendJSON(res, 400, { message: 'Invalid IP number' });
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, ipNo, 'IP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied. This patient is not in your department.' });
        const result = await pool.request()
          .input('ipNo', sql.VarChar, ipNo)
          .query(`SELECT IP_No, Name, Age, Sex, Race, Ethnicity, Preferred_Language,
              Occupation, Dept, DOA, DOD, Reason_for_Admission,
              Past_Medical_History, Past_Medication_History,
              Smoker, Alcoholic, Insurance_Type,
              Weight_kg, Height_cm, BMI, Followup_Outcome, Assigned_Dept
            FROM dbo.patient_records WHERE IP_No = @ipNo`);
        if (result.recordset.length > 0) sendJSON(res, 200, { patient: result.recordset[0] });
        else sendJSON(res, 404, { message: 'Patient not found' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── Get all OP patients ────────────────────────────────────────────────
    if (req.method === 'GET' && req.url === '/api/outpatients') {
      try {
        const pool       = await patientsPoolPromise;
        const doctorDept = req.user.department;
        const result     = await pool.request()
          .input('dept', sql.VarChar, doctorDept)
          .query(`
            SELECT DISTINCT p.OP_No, p.Name, p.Age, p.Sex, p.Race, p.Ethnicity,
              p.Preferred_Language, p.Occupation, p.Dept, p.DOA,
              p.Reason_for_Admission, p.Past_Medical_History, p.Past_Medication_History,
              p.Smoker, p.Alcoholic, p.Insurance_Type,
              p.Weight_kg, p.Height_cm, p.BMI, p.Followup_Outcome
            FROM dbo.outpatient_records p
            LEFT JOIN dbo.patient_referral_access r
              ON r.Patient_No = p.OP_No AND r.Patient_Type = 'OP' AND r.To_Dept = @dept
            WHERE p.Dept = @dept OR r.To_Dept = @dept
              OR @dept IS NULL
            ORDER BY p.OP_No ASC
          `);
        sendJSON(res, 200, { patients: result.recordset });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── Get single OP patient ──────────────────────────────────────────────
    if (req.method === 'GET' && req.url.startsWith('/api/outpatients/')) {
      const opNo = decodeURIComponent(req.url.split('/api/outpatients/')[1]);
      if (!opNo) return sendJSON(res, 400, { message: 'Invalid OP number' });
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, opNo, 'OP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied. This patient is not in your department.' });
        const result = await pool.request()
          .input('opNo', sql.VarChar, opNo)
          .query(`SELECT OP_No, Name, Age, Sex, Race, Ethnicity, Preferred_Language,
              Occupation, Dept, DOA, Reason_for_Admission,
              Past_Medical_History, Past_Medication_History,
              Smoker, Alcoholic, Insurance_Type,
              Weight_kg, Height_cm, BMI, Followup_Outcome, Assigned_Dept
            FROM dbo.outpatient_records WHERE OP_No = @opNo`);
        if (result.recordset.length > 0) sendJSON(res, 200, { patient: result.recordset[0] });
        else sendJSON(res, 404, { message: 'Outpatient not found' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── Assign departments ─────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/api/admin/assign-depts') {
      try {
        const pool = await patientsPoolPromise;
        const ip   = await pool.request().query(
          `SELECT IP_No, Reason_for_Admission, Past_Medical_History FROM dbo.patient_records WHERE Assigned_Dept IS NULL`
        );
        for (const p of ip.recordset) {
          const dept = inferDept(p.Reason_for_Admission, p.Past_Medical_History);
          await pool.request()
            .input('ipNo', sql.VarChar, p.IP_No)
            .input('dept', sql.VarChar, dept)
            .query(`UPDATE dbo.patient_records SET Assigned_Dept=@dept WHERE IP_No=@ipNo`);
        }
        const op = await pool.request().query(
          `SELECT OP_No, Reason_for_Admission, Past_Medical_History FROM dbo.outpatient_records WHERE Assigned_Dept IS NULL`
        );
        for (const p of op.recordset) {
          const dept = inferDept(p.Reason_for_Admission, p.Past_Medical_History);
          await pool.request()
            .input('opNo', sql.VarChar, p.OP_No)
            .input('dept', sql.VarChar, dept)
            .query(`UPDATE dbo.outpatient_records SET Assigned_Dept=@dept WHERE OP_No=@opNo`);
        }
        sendJSON(res, 200, { message: `Assigned depts: ${ip.recordset.length} IP, ${op.recordset.length} OP patients.` });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── IP diagnosis ───────────────────────────────────────────────────────
    if (req.method === 'GET' && req.url.startsWith('/api/ip-diagnosis/')) {
      const ipNo = decodeURIComponent(req.url.split('/api/ip-diagnosis/')[1]);
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, ipNo, 'IP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        const result = await pool.request()
          .input('ipNo', sql.VarChar, ipNo)
          .query(`SELECT IP_No, Diagnosis, Secondary_Diagnosis, Clinical_Notes,
              Drugs_Prescribed, Drug_Drug_Interactions,
              Drug_Disease_Alerts, Drug_Food_Alerts, Dose_Adjustment_Notes
            FROM dbo.ip_diagnosis WHERE IP_No = @ipNo`);
        if (result.recordset.length > 0) sendJSON(res, 200, { diagnosis: result.recordset[0] });
        else sendJSON(res, 404, { message: 'Diagnosis not found' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/ip-diagnosis') {
      const { ipNo, primary, secondary, notes } = await getBody(req);
      if (!ipNo) return sendJSON(res, 400, { message: 'Invalid IP number' });
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, ipNo, 'IP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        await pool.request()
          .input('ipNo',      sql.VarChar, ipNo)
          .input('primary',   sql.VarChar, primary   || '')
          .input('secondary', sql.VarChar, secondary || '')
          .input('notes',     sql.VarChar, notes     || '')
          .query(`UPDATE dbo.ip_diagnosis
            SET Diagnosis=@primary, Secondary_Diagnosis=@secondary, Clinical_Notes=@notes
            WHERE IP_No=@ipNo`);
        sendJSON(res, 200, { message: 'Diagnosis saved' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── OP diagnosis ───────────────────────────────────────────────────────
    if (req.method === 'GET' && req.url.startsWith('/api/op-diagnosis/')) {
      const opNo = decodeURIComponent(req.url.split('/api/op-diagnosis/')[1]);
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, opNo, 'OP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        const result = await pool.request()
          .input('opNo', sql.VarChar, opNo)
          .query(`SELECT OP_No, Diagnosis, Secondary_Diagnosis, Clinical_Notes,
              Drugs_Prescribed, Drug_Drug_Interactions,
              Drug_Disease_Alerts, Drug_Food_Alerts, Dose_Adjustment_Notes
            FROM dbo.op_diagnosis WHERE OP_No = @opNo`);
        if (result.recordset.length > 0) sendJSON(res, 200, { diagnosis: result.recordset[0] });
        else sendJSON(res, 404, { message: 'Diagnosis not found' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/op-diagnosis') {
      const { opNo, primary, secondary, notes } = await getBody(req);
      if (!opNo) return sendJSON(res, 400, { message: 'Invalid OP number' });
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, opNo, 'OP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        await pool.request()
          .input('opNo',      sql.VarChar, opNo)
          .input('primary',   sql.VarChar, primary   || '')
          .input('secondary', sql.VarChar, secondary || '')
          .input('notes',     sql.VarChar, notes     || '')
          .query(`UPDATE dbo.op_diagnosis
            SET Diagnosis=@primary, Secondary_Diagnosis=@secondary, Clinical_Notes=@notes
            WHERE OP_No=@opNo`);
        sendJSON(res, 200, { message: 'Diagnosis saved' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── IP lab results ─────────────────────────────────────────────────────
    if (req.method === 'GET' && req.url.startsWith('/api/lab/')) {
      const ipNo = decodeURIComponent(req.url.split('/api/lab/')[1]);
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, ipNo, 'IP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        const result = await pool.request()
          .input('ipNo', sql.VarChar, ipNo)
          .query(`SELECT IP_No, Pulse, eGFR_mL_min_1_73m2, Sodium, Potassium, Chloride,
              Total_Bilirubin, FreeT3, FreeT4, TSH, Other_Investigations
            FROM dbo.ip_lab_results WHERE IP_No = @ipNo`);
        if (result.recordset.length > 0) sendJSON(res, 200, { lab: result.recordset[0] });
        else sendJSON(res, 404, { message: 'Lab results not found' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── OP lab results ─────────────────────────────────────────────────────
    if (req.method === 'GET' && req.url.startsWith('/api/op-lab/')) {
      const opNo = decodeURIComponent(req.url.split('/api/op-lab/')[1]);
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, opNo, 'OP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        const result = await pool.request()
          .input('opNo', sql.VarChar, opNo)
          .query(`SELECT OP_No, BP_Systolic, BP_Diastolic, Pulse, Temperature, SpO2,
              Hb, WBC, Platelet_Count, RBS, FBS, PPBS,
              Urea, Creatinine, eGFR_mL_min_1_73m2,
              Sodium, Potassium, Chloride,
              SGOT, SGPT, ALP, Total_Bilirubin,
              Lipid_Profile, ECG, Xray, Ultrasound, CT, MRI,
              FreeT3, FreeT4, TSH, Other_Investigations
            FROM dbo.op_lab_results WHERE OP_No = @opNo`);
        if (result.recordset.length > 0) sendJSON(res, 200, { lab: result.recordset[0] });
        else sendJSON(res, 404, { message: 'Outpatient lab results not found' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── Drug inventory search ──────────────────────────────────────────────
    if (req.method === 'GET' && req.url.startsWith('/api/drug-inventory/search')) {
      const rawQ = req.url.split('?q=')[1] || '';
      const q    = decodeURIComponent(rawQ.split('&')[0]);
      try {
        const pool   = await patientsPoolPromise;
        const result = await pool.request()
          .input('q', sql.VarChar, `%${q}%`)
          .query(`SELECT TOP 20 ID, Brand_Name, Generic_Name, Strength, Route, Stocks, Cost_Per_30_USD
            FROM dbo.drug_inventory
            WHERE Brand_Name LIKE @q OR Generic_Name LIKE @q
            ORDER BY Generic_Name, Strength ASC`);
        sendJSON(res, 200, { drugs: result.recordset });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── IP prescriptions ───────────────────────────────────────────────────
    if (req.method === 'GET' && req.url.startsWith('/api/ip-prescriptions/')) {
      const ipNo = decodeURIComponent(req.url.split('/api/ip-prescriptions/')[1]);
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, ipNo, 'IP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        const result = await pool.request().input('ipNo', sql.VarChar, ipNo)
          .query(`SELECT ID, IP_No, Brand_Name, Generic_Name, Strength, Route, Frequency, Days, Added_On, Is_Held
                  FROM dbo.ip_prescriptions WHERE IP_No = @ipNo ORDER BY ID ASC`);
        sendJSON(res, 200, { prescriptions: result.recordset });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/ip-prescriptions') {
      const { ipNo, brand, generic, strength, route, frequency, days } = await getBody(req);
      if (!ipNo || !generic) return sendJSON(res, 400, { message: 'IP_No and Generic Name required.' });
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, ipNo, 'IP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        await pool.request()
          .input('ipNo', sql.VarChar, ipNo).input('brand', sql.VarChar, brand || '')
          .input('generic', sql.VarChar, generic).input('strength', sql.VarChar, strength || '')
          .input('route', sql.VarChar, route || '').input('frequency', sql.VarChar, frequency || '')
          .input('days', sql.VarChar, days || '')
          .query(`INSERT INTO dbo.ip_prescriptions (IP_No, Brand_Name, Generic_Name, Strength, Route, Frequency, Days)
                  VALUES (@ipNo, @brand, @generic, @strength, @route, @frequency, @days)`);
        sendJSON(res, 201, { message: 'IP prescription saved.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/ip-prescriptions/update') {
      const { id, route, frequency, days } = await getBody(req);
      try {
        const pool = await patientsPoolPromise;
        await pool.request()
          .input('id', sql.Int, id).input('route', sql.VarChar, route || '')
          .input('frequency', sql.VarChar, frequency || '').input('days', sql.VarChar, days || '')
          .query(`UPDATE dbo.ip_prescriptions SET Route=@route, Frequency=@frequency, Days=@days WHERE ID=@id`);
        sendJSON(res, 200, { message: 'Updated.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/ip-prescriptions/delete') {
      const { id } = await getBody(req);
      try {
        const pool = await patientsPoolPromise;
        await pool.request().input('id', sql.Int, id)
          .query(`DELETE FROM dbo.ip_prescriptions WHERE ID = @id`);
        sendJSON(res, 200, { message: 'Deleted.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/ip-prescriptions/hold') {
      const { id, held } = await getBody(req);
      try {
        const pool = await patientsPoolPromise;
        await pool.request()
          .input('id',   sql.Int, id)
          .input('held', sql.Bit, held ? 1 : 0)
          .query(`UPDATE dbo.ip_prescriptions SET Is_Held=@held WHERE ID=@id`);
        sendJSON(res, 200, { message: 'Hold state updated.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── OP prescriptions ───────────────────────────────────────────────────
    if (req.method === 'GET' && req.url.startsWith('/api/op-prescriptions/')) {
      const opNo = decodeURIComponent(req.url.split('/api/op-prescriptions/')[1]);
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, opNo, 'OP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        const result = await pool.request().input('opNo', sql.VarChar, opNo)
          .query(`SELECT ID, OP_No, Brand_Name, Generic_Name, Strength, Route, Frequency, Days, Added_On, Is_Held
                  FROM dbo.op_prescriptions WHERE OP_No = @opNo ORDER BY ID ASC`);
        sendJSON(res, 200, { prescriptions: result.recordset });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/op-prescriptions') {
      const { opNo, brand, generic, strength, route, frequency, days } = await getBody(req);
      if (!opNo || !generic) return sendJSON(res, 400, { message: 'OP_No and Generic Name required.' });
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, opNo, 'OP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        await pool.request()
          .input('opNo', sql.VarChar, opNo).input('brand', sql.VarChar, brand || '')
          .input('generic', sql.VarChar, generic).input('strength', sql.VarChar, strength || '')
          .input('route', sql.VarChar, route || '').input('frequency', sql.VarChar, frequency || '')
          .input('days', sql.VarChar, days || '')
          .query(`INSERT INTO dbo.op_prescriptions (OP_No, Brand_Name, Generic_Name, Strength, Route, Frequency, Days)
                  VALUES (@opNo, @brand, @generic, @strength, @route, @frequency, @days)`);
        sendJSON(res, 201, { message: 'OP prescription saved.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/op-prescriptions/update') {
      const { id, route, frequency, days } = await getBody(req);
      try {
        const pool = await patientsPoolPromise;
        await pool.request()
          .input('id', sql.Int, id).input('route', sql.VarChar, route || '')
          .input('frequency', sql.VarChar, frequency || '').input('days', sql.VarChar, days || '')
          .query(`UPDATE dbo.op_prescriptions SET Route=@route, Frequency=@frequency, Days=@days WHERE ID=@id`);
        sendJSON(res, 200, { message: 'Updated.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/op-prescriptions/delete') {
      const { id } = await getBody(req);
      try {
        const pool = await patientsPoolPromise;
        await pool.request().input('id', sql.Int, id)
          .query(`DELETE FROM dbo.op_prescriptions WHERE ID = @id`);
        sendJSON(res, 200, { message: 'Deleted.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/op-prescriptions/hold') {
      const { id, held } = await getBody(req);
      try {
        const pool = await patientsPoolPromise;
        await pool.request()
          .input('id',   sql.Int, id)
          .input('held', sql.Bit, held ? 1 : 0)
          .query(`UPDATE dbo.op_prescriptions SET Is_Held=@held WHERE ID=@id`);
        sendJSON(res, 200, { message: 'Hold state updated.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── IP prescription notes ──────────────────────────────────────────────
    if (req.method === 'GET' && req.url.startsWith('/api/ip-prescription-notes/')) {
      const ipNo = decodeURIComponent(req.url.split('/api/ip-prescription-notes/')[1]);
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, ipNo, 'IP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        const result = await pool.request().input('ipNo', sql.VarChar, ipNo)
          .query(`SELECT ID, IP_No, Notes, Added_On FROM dbo.ip_prescription_notes WHERE IP_No=@ipNo ORDER BY Added_On DESC`);
        sendJSON(res, 200, { notes: result.recordset });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/ip-prescription-notes') {
      const { ipNo, notes } = await getBody(req);
      if (!ipNo || !notes) return sendJSON(res, 400, { message: 'IP_No and notes required.' });
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, ipNo, 'IP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        await pool.request().input('ipNo', sql.VarChar, ipNo).input('notes', sql.NVarChar, notes)
          .query(`INSERT INTO dbo.ip_prescription_notes (IP_No, Notes) VALUES (@ipNo, @notes)`);
        sendJSON(res, 201, { message: 'IP note saved.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/ip-prescription-notes/update') {
      const { id, notes } = await getBody(req);
      try {
        const pool = await patientsPoolPromise;
        await pool.request().input('id', sql.Int, id).input('notes', sql.NVarChar, notes)
          .query(`UPDATE dbo.ip_prescription_notes SET Notes=@notes WHERE ID=@id`);
        sendJSON(res, 200, { message: 'Updated.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/ip-prescription-notes/delete') {
      const { id } = await getBody(req);
      try {
        const pool = await patientsPoolPromise;
        await pool.request().input('id', sql.Int, id)
          .query(`DELETE FROM dbo.ip_prescription_notes WHERE ID=@id`);
        sendJSON(res, 200, { message: 'Deleted.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── OP prescription notes ──────────────────────────────────────────────
    if (req.method === 'GET' && req.url.startsWith('/api/op-prescription-notes/')) {
      const opNo = decodeURIComponent(req.url.split('/api/op-prescription-notes/')[1]);
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, opNo, 'OP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        const result = await pool.request().input('opNo', sql.VarChar, opNo)
          .query(`SELECT ID, OP_No, Notes, Added_On FROM dbo.op_prescription_notes WHERE OP_No=@opNo ORDER BY Added_On DESC`);
        sendJSON(res, 200, { notes: result.recordset });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/op-prescription-notes') {
      const { opNo, notes } = await getBody(req);
      if (!opNo || !notes) return sendJSON(res, 400, { message: 'OP_No and notes required.' });
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, opNo, 'OP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        await pool.request().input('opNo', sql.VarChar, opNo).input('notes', sql.NVarChar, notes)
          .query(`INSERT INTO dbo.op_prescription_notes (OP_No, Notes) VALUES (@opNo, @notes)`);
        sendJSON(res, 201, { message: 'OP note saved.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/op-prescription-notes/update') {
      const { id, notes } = await getBody(req);
      try {
        const pool = await patientsPoolPromise;
        await pool.request().input('id', sql.Int, id).input('notes', sql.NVarChar, notes)
          .query(`UPDATE dbo.op_prescription_notes SET Notes=@notes WHERE ID=@id`);
        sendJSON(res, 200, { message: 'Updated.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/op-prescription-notes/delete') {
      const { id } = await getBody(req);
      try {
        const pool = await patientsPoolPromise;
        await pool.request().input('id', sql.Int, id)
          .query(`DELETE FROM dbo.op_prescription_notes WHERE ID=@id`);
        sendJSON(res, 200, { message: 'Deleted.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── IP drug interactions ───────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/api/ip-drug-interactions') {
      const { ip_no, dd_severe, dd_moderate, dd_minor,
              ddis_contraindicated, ddis_moderate, ddis_minor, drug_food } = await getBody(req);
      if (!ip_no) return sendJSON(res, 400, { message: 'IP_No required.' });
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, ip_no, 'IP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        const existing = await pool.request().input('ipNo', sql.VarChar, ip_no)
          .query('SELECT ID FROM dbo.ip_drug_interactions WHERE IP_No = @ipNo');
        const q = existing.recordset.length > 0
          ? `UPDATE dbo.ip_drug_interactions SET DD_Severe=@ddSev,DD_Moderate=@ddMod,DD_Minor=@ddMin,
              DDis_Contraindicated=@disCon,DDis_Moderate=@disMod,DDis_Minor=@disMin,
              Drug_Food=@food,Updated_At=@now WHERE IP_No=@ipNo`
          : `INSERT INTO dbo.ip_drug_interactions
              (IP_No,DD_Severe,DD_Moderate,DD_Minor,DDis_Contraindicated,DDis_Moderate,DDis_Minor,Drug_Food)
              VALUES(@ipNo,@ddSev,@ddMod,@ddMin,@disCon,@disMod,@disMin,@food)`;
        await pool.request()
          .input('ipNo',   sql.VarChar,  ip_no)
          .input('ddSev',  sql.NVarChar, JSON.stringify(dd_severe            || []))
          .input('ddMod',  sql.NVarChar, JSON.stringify(dd_moderate          || []))
          .input('ddMin',  sql.NVarChar, JSON.stringify(dd_minor             || []))
          .input('disCon', sql.NVarChar, JSON.stringify(ddis_contraindicated || []))
          .input('disMod', sql.NVarChar, JSON.stringify(ddis_moderate        || []))
          .input('disMin', sql.NVarChar, JSON.stringify(ddis_minor           || []))
          .input('food',   sql.NVarChar, JSON.stringify(drug_food            || []))
          .input('now',    sql.DateTime, new Date())
          .query(q);
        sendJSON(res, 200, { message: 'IP drug interactions saved.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/api/ip-drug-interactions/')) {
      const ipNo = decodeURIComponent(req.url.split('/api/ip-drug-interactions/')[1]);
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, ipNo, 'IP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        const result = await pool.request().input('ipNo', sql.VarChar, ipNo)
          .query('SELECT * FROM dbo.ip_drug_interactions WHERE IP_No = @ipNo');
        if (!result.recordset.length) return sendJSON(res, 200, { found: false, data: null });
        const r = result.recordset[0];
        const parse = v => { try { return JSON.parse(v || '[]'); } catch { return []; } };
        sendJSON(res, 200, { found: true, data: {
          drug_drug:    { severe: parse(r.DD_Severe), moderate: parse(r.DD_Moderate), minor: parse(r.DD_Minor) },
          drug_disease: { contraindicated: parse(r.DDis_Contraindicated), moderate: parse(r.DDis_Moderate), minor: parse(r.DDis_Minor) },
          drug_food:    parse(r.Drug_Food),
          updated_at:   r.Updated_At,
        }});
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── OP drug interactions ───────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/api/op-drug-interactions') {
      const { op_no, dd_severe, dd_moderate, dd_minor,
              ddis_contraindicated, ddis_moderate, ddis_minor, drug_food } = await getBody(req);
      if (!op_no) return sendJSON(res, 400, { message: 'OP_No required.' });
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, op_no, 'OP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        const existing = await pool.request().input('opNo', sql.VarChar, op_no)
          .query('SELECT ID FROM dbo.op_drug_interactions WHERE OP_No = @opNo');
        const q = existing.recordset.length > 0
          ? `UPDATE dbo.op_drug_interactions SET DD_Severe=@ddSev,DD_Moderate=@ddMod,DD_Minor=@ddMin,
              DDis_Contraindicated=@disCon,DDis_Moderate=@disMod,DDis_Minor=@disMin,
              Drug_Food=@food,Updated_At=@now WHERE OP_No=@opNo`
          : `INSERT INTO dbo.op_drug_interactions
              (OP_No,DD_Severe,DD_Moderate,DD_Minor,DDis_Contraindicated,DDis_Moderate,DDis_Minor,Drug_Food)
              VALUES(@opNo,@ddSev,@ddMod,@ddMin,@disCon,@disMod,@disMin,@food)`;
        await pool.request()
          .input('opNo',   sql.VarChar,  op_no)
          .input('ddSev',  sql.NVarChar, JSON.stringify(dd_severe            || []))
          .input('ddMod',  sql.NVarChar, JSON.stringify(dd_moderate          || []))
          .input('ddMin',  sql.NVarChar, JSON.stringify(dd_minor             || []))
          .input('disCon', sql.NVarChar, JSON.stringify(ddis_contraindicated || []))
          .input('disMod', sql.NVarChar, JSON.stringify(ddis_moderate        || []))
          .input('disMin', sql.NVarChar, JSON.stringify(ddis_minor           || []))
          .input('food',   sql.NVarChar, JSON.stringify(drug_food            || []))
          .input('now',    sql.DateTime, new Date())
          .query(q);
        sendJSON(res, 200, { message: 'OP drug interactions saved.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/api/op-drug-interactions/')) {
      const opNo = decodeURIComponent(req.url.split('/api/op-drug-interactions/')[1]);
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, opNo, 'OP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        const result = await pool.request().input('opNo', sql.VarChar, opNo)
          .query('SELECT * FROM dbo.op_drug_interactions WHERE OP_No = @opNo');
        if (!result.recordset.length) return sendJSON(res, 200, { found: false, data: null });
        const r = result.recordset[0];
        const parse = v => { try { return JSON.parse(v || '[]'); } catch { return []; } };
        sendJSON(res, 200, { found: true, data: {
          drug_drug:    { severe: parse(r.DD_Severe), moderate: parse(r.DD_Moderate), minor: parse(r.DD_Minor) },
          drug_disease: { contraindicated: parse(r.DDis_Contraindicated), moderate: parse(r.DDis_Moderate), minor: parse(r.DDis_Minor) },
          drug_food:    parse(r.Drug_Food),
          updated_at:   r.Updated_At,
        }});
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── IP dosing recommendations ──────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/api/ip-dosing-recommendations') {
      const { ip_no, high, medium } = await getBody(req);
      if (!ip_no) return sendJSON(res, 400, { message: 'IP_No required.' });
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, ip_no, 'IP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        const existing = await pool.request().input('ipNo', sql.VarChar, ip_no)
          .query('SELECT ID FROM dbo.ip_dosing_recommendations WHERE IP_No = @ipNo');
        const q = existing.recordset.length > 0
          ? `UPDATE dbo.ip_dosing_recommendations SET High=@high,Medium=@medium,Updated_At=@now WHERE IP_No=@ipNo`
          : `INSERT INTO dbo.ip_dosing_recommendations (IP_No,High,Medium) VALUES(@ipNo,@high,@medium)`;
        await pool.request()
          .input('ipNo',   sql.VarChar,  ip_no)
          .input('high',   sql.NVarChar, JSON.stringify(high   || []))
          .input('medium', sql.NVarChar, JSON.stringify(medium || []))
          .input('now',    sql.DateTime, new Date())
          .query(q);
        sendJSON(res, 200, { message: 'IP dosing recommendations saved.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/api/ip-dosing-recommendations/')) {
      const ipNo = decodeURIComponent(req.url.split('/api/ip-dosing-recommendations/')[1]);
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, ipNo, 'IP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        const result = await pool.request().input('ipNo', sql.VarChar, ipNo)
          .query('SELECT * FROM dbo.ip_dosing_recommendations WHERE IP_No = @ipNo');
        if (!result.recordset.length) return sendJSON(res, 200, { found: false, data: null });
        const r = result.recordset[0];
        const parse = v => { try { return JSON.parse(v || '[]'); } catch { return []; } };
        sendJSON(res, 200, { found: true, data: { high: parse(r.High), medium: parse(r.Medium), updated_at: r.Updated_At } });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── OP dosing recommendations ──────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/api/op-dosing-recommendations') {
      const { op_no, high, medium } = await getBody(req);
      if (!op_no) return sendJSON(res, 400, { message: 'OP_No required.' });
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, op_no, 'OP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        const existing = await pool.request().input('opNo', sql.VarChar, op_no)
          .query('SELECT ID FROM dbo.op_dosing_recommendations WHERE OP_No = @opNo');
        const q = existing.recordset.length > 0
          ? `UPDATE dbo.op_dosing_recommendations SET High=@high,Medium=@medium,Updated_At=@now WHERE OP_No=@opNo`
          : `INSERT INTO dbo.op_dosing_recommendations (OP_No,High,Medium) VALUES(@opNo,@high,@medium)`;
        await pool.request()
          .input('opNo',   sql.VarChar,  op_no)
          .input('high',   sql.NVarChar, JSON.stringify(high   || []))
          .input('medium', sql.NVarChar, JSON.stringify(medium || []))
          .input('now',    sql.DateTime, new Date())
          .query(q);
        sendJSON(res, 200, { message: 'OP dosing recommendations saved.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/api/op-dosing-recommendations/')) {
      const opNo = decodeURIComponent(req.url.split('/api/op-dosing-recommendations/')[1]);
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, opNo, 'OP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        const result = await pool.request().input('opNo', sql.VarChar, opNo)
          .query('SELECT * FROM dbo.op_dosing_recommendations WHERE OP_No = @opNo');
        if (!result.recordset.length) return sendJSON(res, 200, { found: false, data: null });
        const r = result.recordset[0];
        const parse = v => { try { return JSON.parse(v || '[]'); } catch { return []; } };
        sendJSON(res, 200, { found: true, data: { high: parse(r.High), medium: parse(r.Medium), updated_at: r.Updated_At } });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── IP patient counselling ─────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/api/ip-patient-counselling') {
      const { ip_no, drug_counselling, condition_counselling } = await getBody(req);
      if (!ip_no) return sendJSON(res, 400, { message: 'IP_No required.' });
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, ip_no, 'IP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        const existing = await pool.request().input('ipNo', sql.VarChar, ip_no)
          .query('SELECT ID FROM dbo.ip_patient_counselling WHERE IP_No = @ipNo');
        const q = existing.recordset.length > 0
          ? `UPDATE dbo.ip_patient_counselling SET Drug_Counselling=@dc,Condition_Counselling=@cc,Updated_At=@now WHERE IP_No=@ipNo`
          : `INSERT INTO dbo.ip_patient_counselling (IP_No,Drug_Counselling,Condition_Counselling) VALUES(@ipNo,@dc,@cc)`;
        await pool.request()
          .input('ipNo', sql.VarChar,  ip_no)
          .input('dc',   sql.NVarChar, JSON.stringify(drug_counselling      || []))
          .input('cc',   sql.NVarChar, JSON.stringify(condition_counselling || []))
          .input('now',  sql.DateTime, new Date())
          .query(q);
        sendJSON(res, 200, { message: 'IP patient counselling saved.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/api/ip-patient-counselling/')) {
      const ipNo = decodeURIComponent(req.url.split('/api/ip-patient-counselling/')[1]);
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, ipNo, 'IP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        const result = await pool.request().input('ipNo', sql.VarChar, ipNo)
          .query('SELECT * FROM dbo.ip_patient_counselling WHERE IP_No = @ipNo');
        if (!result.recordset.length) return sendJSON(res, 200, { found: false, data: null });
        const r = result.recordset[0];
        const parse = v => { try { return JSON.parse(v || '[]'); } catch { return []; } };
        sendJSON(res, 200, { found: true, data: {
          drug_counselling:      parse(r.Drug_Counselling),
          condition_counselling: parse(r.Condition_Counselling),
          updated_at:            r.Updated_At,
        }});
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── OP patient counselling ─────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/api/op-patient-counselling') {
      const { op_no, drug_counselling, condition_counselling } = await getBody(req);
      if (!op_no) return sendJSON(res, 400, { message: 'OP_No required.' });
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, op_no, 'OP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        const existing = await pool.request().input('opNo', sql.VarChar, op_no)
          .query('SELECT ID FROM dbo.op_patient_counselling WHERE OP_No = @opNo');
        const q = existing.recordset.length > 0
          ? `UPDATE dbo.op_patient_counselling SET Drug_Counselling=@dc,Condition_Counselling=@cc,Updated_At=@now WHERE OP_No=@opNo`
          : `INSERT INTO dbo.op_patient_counselling (OP_No,Drug_Counselling,Condition_Counselling) VALUES(@opNo,@dc,@cc)`;
        await pool.request()
          .input('opNo', sql.VarChar,  op_no)
          .input('dc',   sql.NVarChar, JSON.stringify(drug_counselling      || []))
          .input('cc',   sql.NVarChar, JSON.stringify(condition_counselling || []))
          .input('now',  sql.DateTime, new Date())
          .query(q);
        sendJSON(res, 200, { message: 'OP patient counselling saved.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/api/op-patient-counselling/')) {
      const opNo = decodeURIComponent(req.url.split('/api/op-patient-counselling/')[1]);
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, opNo, 'OP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        const result = await pool.request().input('opNo', sql.VarChar, opNo)
          .query('SELECT * FROM dbo.op_patient_counselling WHERE OP_No = @opNo');
        if (!result.recordset.length) return sendJSON(res, 200, { found: false, data: null });
        const r = result.recordset[0];
        const parse = v => { try { return JSON.parse(v || '[]'); } catch { return []; } };
        sendJSON(res, 200, { found: true, data: {
          drug_counselling:      parse(r.Drug_Counselling),
          condition_counselling: parse(r.Condition_Counselling),
          updated_at:            r.Updated_At,
        }});
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── IP referral ────────────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/api/ip-referral') {
      const { ipNo, to_dept, to_doctor, urgency, reason, notes, date } = await getBody(req);
      if (!ipNo) return sendJSON(res, 400, { message: 'IP_No required.' });
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, ipNo, 'IP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        await pool.request()
          .input('ipNo',     sql.VarChar, ipNo)
          .input('toDept',   sql.VarChar, to_dept    || '')
          .input('toDoctor', sql.VarChar, to_doctor  || '')
          .input('urgency',  sql.VarChar, urgency    || 'Routine')
          .input('date',     sql.Date,    date       || null)
          .input('reason',   sql.VarChar, reason     || '')
          .input('notes',    sql.VarChar, notes      || null)
          .query(`INSERT INTO dbo.ip_refferal
            (IP_No,Refer_To_Department,Refer_To_Doctor,Urgency,Referral_Date,Reason_For_Referral,Additional_Notes)
            VALUES(@ipNo,@toDept,@toDoctor,@urgency,@date,@reason,@notes)`);
        await pool.request()
          .input('patientNo',  sql.VarChar, ipNo)
          .input('type',       sql.VarChar, 'IP')
          .input('fromDept',   sql.VarChar, req.user.department)
          .input('toDept',     sql.VarChar, to_dept || '')
          .input('referredBy', sql.VarChar, req.user.name)
          .query(`INSERT INTO dbo.patient_referral_access
            (Patient_No,Patient_Type,From_Dept,To_Dept,Referred_By)
            VALUES(@patientNo,@type,@fromDept,@toDept,@referredBy)`);
        sendJSON(res, 201, { message: 'IP referral saved.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/ip-referral/delete') {
      const { patientNo, to_doctor, to_dept, date } = await getBody(req);
      if (!patientNo) return sendJSON(res, 400, { message: 'IP_No required.' });
      try {
        const pool = await patientsPoolPromise;
        await pool.request()
          .input('ipNo',     sql.VarChar, patientNo)
          .input('toDoctor', sql.VarChar, to_doctor || '')
          .input('toDept',   sql.VarChar, to_dept   || '')
          .input('date',     sql.Date,    date      || null)
          .query(`DELETE FROM dbo.ip_refferal
                  WHERE IP_No=@ipNo AND Refer_To_Doctor=@toDoctor
                    AND Refer_To_Department=@toDept AND Referral_Date=@date`);
        sendJSON(res, 200, { message: 'IP referral deleted.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/api/ip-referral/')) {
      const ipNo = decodeURIComponent(req.url.split('/api/ip-referral/')[1]);
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, ipNo, 'IP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        const result = await pool.request().input('ipNo', sql.VarChar, ipNo)
          .query(`SELECT IP_No,Refer_To_Department,Refer_To_Doctor,Urgency,
                         Referral_Date,Reason_For_Referral,Additional_Notes,Created_At
                  FROM dbo.ip_refferal WHERE IP_No=@ipNo ORDER BY Created_At DESC`);
        sendJSON(res, 200, { referrals: result.recordset });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── OP referral ────────────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/api/op-referral') {
      const { opNo, to_dept, to_doctor, urgency, reason, notes, date } = await getBody(req);
      if (!opNo) return sendJSON(res, 400, { message: 'OP_No required.' });
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, opNo, 'OP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        await pool.request()
          .input('opNo',     sql.VarChar, opNo)
          .input('toDept',   sql.VarChar, to_dept    || '')
          .input('toDoctor', sql.VarChar, to_doctor  || '')
          .input('urgency',  sql.VarChar, urgency    || 'Routine')
          .input('date',     sql.Date,    date       || null)
          .input('reason',   sql.VarChar, reason     || '')
          .input('notes',    sql.VarChar, notes      || null)
          .query(`INSERT INTO dbo.op_refferal
            (OP_No,Refer_To_Department,Refer_To_Doctor,Urgency,Referral_Date,Reason_For_Referral,Additional_Notes)
            VALUES(@opNo,@toDept,@toDoctor,@urgency,@date,@reason,@notes)`);
        await pool.request()
          .input('patientNo',  sql.VarChar, opNo)
          .input('type',       sql.VarChar, 'OP')
          .input('fromDept',   sql.VarChar, req.user.department)
          .input('toDept',     sql.VarChar, to_dept || '')
          .input('referredBy', sql.VarChar, req.user.name)
          .query(`INSERT INTO dbo.patient_referral_access
            (Patient_No,Patient_Type,From_Dept,To_Dept,Referred_By)
            VALUES(@patientNo,@type,@fromDept,@toDept,@referredBy)`);
        sendJSON(res, 201, { message: 'OP referral saved.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/op-referral/delete') {
      const { patientNo, to_doctor, to_dept, date } = await getBody(req);
      if (!patientNo) return sendJSON(res, 400, { message: 'OP_No required.' });
      try {
        const pool = await patientsPoolPromise;
        await pool.request()
          .input('opNo',     sql.VarChar, patientNo)
          .input('toDoctor', sql.VarChar, to_doctor || '')
          .input('toDept',   sql.VarChar, to_dept   || '')
          .input('date',     sql.Date,    date      || null)
          .query(`DELETE FROM dbo.op_refferal
                  WHERE OP_No=@opNo AND Refer_To_Doctor=@toDoctor
                    AND Refer_To_Department=@toDept AND Referral_Date=@date`);
        sendJSON(res, 200, { message: 'OP referral deleted.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/api/op-referral/')) {
      const opNo = decodeURIComponent(req.url.split('/api/op-referral/')[1]);
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, opNo, 'OP', req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });
        const result = await pool.request().input('opNo', sql.VarChar, opNo)
          .query(`SELECT OP_No,Refer_To_Department,Refer_To_Doctor,Urgency,
                         Referral_Date,Reason_For_Referral,Additional_Notes,Created_At
                  FROM dbo.op_refferal WHERE OP_No=@opNo ORDER BY Created_At DESC`);
        sendJSON(res, 200, { referrals: result.recordset });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── Password expiry status ─────────────────────────────────────────────
    if (req.method === 'GET' && req.url.startsWith('/api/password-expiry-status')) {
      const email = decodeURIComponent(req.url.split('?email=')[1] || '');
      if (!email) return sendJSON(res, 400, { message: 'Email required.' });
      try {
        const pool   = await poolPromise;
        const result = await pool.request()
          .input('email', sql.VarChar, email)
          .query('SELECT name, password_changed_at FROM users WHERE email = @email');
        if (!result.recordset.length) return sendJSON(res, 404, { message: 'User not found.' });
        const { password_changed_at } = result.recordset[0];
        const changedAt   = password_changed_at ? new Date(password_changed_at) : new Date(0);
        const diffDays    = Math.floor((new Date() - changedAt) / (1000 * 60 * 60 * 24));
        const daysLeft    = PASSWORD_EXPIRY_DAYS - diffDays;
        const lastChanged = changedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        sendJSON(res, 200, { daysLeft: Math.max(0, daysLeft), daysSinceChange: diffDays, lastChanged, expired: daysLeft <= 0 });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ══════════════════════════════════════════════════════════════════════
    // ── PATIENT PORTAL ROUTES ─────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════

    if (req.method === 'POST' && req.url === '/api/patient/signin') {
      const { email, password } = await getBody(req);
      if (!email || !password)
        return sendJSON(res, 400, { message: 'Email and password required.' });
      try {
        const pool = await patientsPoolPromise;
        const result = await pool.request()
          .input('email', sql.VarChar, email)
          .query(`
            SELECT
              pc.Credential_ID, pc.IP_No, pc.OP_No, pc.Email, pc.Password,
              COALESCE(ip.Name, op.Name) AS Name,
              COALESCE(ip.Age,  op.Age)  AS Age,
              COALESCE(ip.Sex,  op.Sex)  AS Sex,
              COALESCE(ip.Dept, op.Dept) AS Dept
            FROM dbo.patient_credential pc
            LEFT JOIN dbo.patient_records    ip ON ip.IP_No = pc.IP_No
            LEFT JOIN dbo.outpatient_records op ON op.OP_No = pc.OP_No
            WHERE pc.Email = @email
          `);
        if (!result.recordset.length)
          return sendJSON(res, 401, { message: 'Invalid email or password.' });
        const patient = result.recordset[0];
        const match   = await bcrypt.compare(password, patient.Password);
        if (!match)
          return sendJSON(res, 401, { message: 'Invalid email or password.' });
        const token = jwt.sign(
          { id: patient.Credential_ID, email: patient.Email, name: patient.Name,
            ip_no: patient.IP_No || null, op_no: patient.OP_No || null, role: 'patient' },
          JWT_SECRET, { expiresIn: JWT_EXPIRES_IN }
        );
        sendJSON(res, 200, {
          message: 'Sign in successful', token,
          patient: { name: patient.Name, age: patient.Age, sex: patient.Sex,
                     dept: patient.Dept, ip_no: patient.IP_No || null,
                     op_no: patient.OP_No || null, email: patient.Email },
        });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'GET' && req.url === '/api/patient/me/ip') {
      if (req.user?.role !== 'patient') return sendJSON(res, 403, { message: 'Access denied.' });
      if (!req.user.ip_no) return sendJSON(res, 404, { message: 'No inpatient record linked.' });
      try {
        const pool   = await patientsPoolPromise;
        const result = await pool.request().input('ipNo', sql.VarChar, req.user.ip_no)
          .query(`SELECT IP_No, Name, Age, Sex, Race, Ethnicity, Preferred_Language, Occupation,
              Dept, DOA, DOD, Reason_for_Admission, Past_Medical_History,
              Past_Medication_History, Smoker, Alcoholic, Insurance_Type,
              Weight_kg, Height_cm, BMI, Followup_Outcome
            FROM dbo.patient_records WHERE IP_No = @ipNo`);
        if (!result.recordset.length) return sendJSON(res, 404, { message: 'Record not found.' });
        sendJSON(res, 200, { patient: result.recordset[0] });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'GET' && req.url === '/api/patient/me/op') {
      if (req.user?.role !== 'patient') return sendJSON(res, 403, { message: 'Access denied.' });
      if (!req.user.op_no) return sendJSON(res, 404, { message: 'No outpatient record linked.' });
      try {
        const pool   = await patientsPoolPromise;
        const result = await pool.request().input('opNo', sql.VarChar, req.user.op_no)
          .query(`SELECT OP_No, Name, Age, Sex, Race, Ethnicity, Preferred_Language, Occupation,
              Dept, DOA, Reason_for_Admission, Past_Medical_History,
              Past_Medication_History, Smoker, Alcoholic, Insurance_Type,
              Weight_kg, Height_cm, BMI, Followup_Outcome
            FROM dbo.outpatient_records WHERE OP_No = @opNo`);
        if (!result.recordset.length) return sendJSON(res, 404, { message: 'Record not found.' });
        sendJSON(res, 200, { patient: result.recordset[0] });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'GET' && req.url === '/api/patient/me/prescriptions') {
      if (req.user?.role !== 'patient') return sendJSON(res, 403, { message: 'Access denied.' });
      try {
        const pool = await patientsPoolPromise;
        if (req.user.ip_no) {
          const result = await pool.request().input('ipNo', sql.VarChar, req.user.ip_no)
            .query(`SELECT Brand_Name, Generic_Name, Strength, Route, Frequency, Days, Added_On
                    FROM dbo.ip_prescriptions WHERE IP_No = @ipNo AND Is_Held = 0 ORDER BY ID ASC`);
          return sendJSON(res, 200, { prescriptions: result.recordset });
        }
        if (req.user.op_no) {
          const result = await pool.request().input('opNo', sql.VarChar, req.user.op_no)
            .query(`SELECT Brand_Name, Generic_Name, Strength, Route, Frequency, Days, Added_On
                    FROM dbo.op_prescriptions WHERE OP_No = @opNo AND Is_Held = 0 ORDER BY ID ASC`);
          return sendJSON(res, 200, { prescriptions: result.recordset });
        }
        sendJSON(res, 404, { message: 'No patient record linked.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ══════════════════════════════════════════════════════════════════════
    // ── APPOINTMENT ROUTES ────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════

    if (req.method === 'POST' && req.url === '/api/appointments') {
      const { doctor_name, doctor_dept, date, time, reason } = await getBody(req);
      if (!doctor_name || !date || !time)
        return sendJSON(res, 400, { message: 'Doctor name, date and time are required.' });
      const patientNo   = req.user.ip_no || req.user.op_no;
      const patientType = req.user.ip_no ? 'IP' : 'OP';
      if (!patientNo)
        return sendJSON(res, 400, { message: 'No patient record linked to this account.' });
      try {
        const pool = await patientsPoolPromise;
        const conflict = await pool.request()
          .input('doctorName', sql.VarChar, doctor_name)
          .input('date',       sql.Date,    date)
          .input('time',       sql.VarChar, time)
          .query(`SELECT ID FROM dbo.appointments
                  WHERE Doctor_Name=@doctorName AND Appointment_Date=@date
                    AND Appointment_Time=@time AND Status != 'Cancelled'`);
        if (conflict.recordset.length > 0)
          return sendJSON(res, 409, { message: 'This time slot has already been booked. Please choose another.' });
        await pool.request()
          .input('patientNo',   sql.VarChar, patientNo)
          .input('patientType', sql.VarChar, patientType)
          .input('patientName', sql.VarChar, req.user.name || '')
          .input('doctorName',  sql.VarChar, doctor_name)
          .input('doctorDept',  sql.VarChar, doctor_dept || '')
          .input('date',        sql.Date,    date)
          .input('time',        sql.VarChar, time)
          .input('reason',      sql.VarChar, reason || '')
          .query(`INSERT INTO dbo.appointments
            (Patient_No, Patient_Type, Patient_Name, Doctor_Name, Doctor_Dept,
             Appointment_Date, Appointment_Time, Reason, Status)
            VALUES
            (@patientNo, @patientType, @patientName, @doctorName, @doctorDept,
             @date, @time, @reason, 'Scheduled')`);
        sendJSON(res, 201, { message: 'Appointment booked successfully.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/api/appointments/doctor/')) {
      const doctorName = decodeURIComponent(req.url.split('/api/appointments/doctor/')[1]);
      if (!doctorName) return sendJSON(res, 400, { message: 'Doctor name required.' });
      try {
        const pool   = await patientsPoolPromise;
        const result = await pool.request().input('name', sql.VarChar, doctorName)
          .query(`SELECT ID, Patient_No, Patient_Type, Patient_Name,
                         Doctor_Name, Doctor_Dept, Appointment_Date, Appointment_Time,
                         Reason, Status, Created_At
                  FROM dbo.appointments WHERE Doctor_Name = @name
                  ORDER BY Appointment_Date ASC, Appointment_Time ASC`);
        sendJSON(res, 200, { appointments: result.recordset });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'GET' && req.url === '/api/patient/me/appointments') {
      if (req.user?.role !== 'patient') return sendJSON(res, 403, { message: 'Access denied.' });
      const patientNo = req.user.ip_no || req.user.op_no;
      if (!patientNo) return sendJSON(res, 404, { message: 'No patient record linked.' });
      try {
        const pool   = await patientsPoolPromise;
        const result = await pool.request().input('no', sql.VarChar, patientNo)
          .query(`SELECT ID, Doctor_Name, Doctor_Dept, Appointment_Date, Appointment_Time,
                         Reason, Status, Created_At
                  FROM dbo.appointments WHERE Patient_No = @no
                  ORDER BY Appointment_Date DESC, Appointment_Time ASC`);
        sendJSON(res, 200, { appointments: result.recordset });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/appointments/update-status') {
      const { id, status } = await getBody(req);
      const VALID = ['Scheduled', 'Checked In', 'Waiting', 'Completed', 'Cancelled'];
      if (!id || !VALID.includes(status))
        return sendJSON(res, 400, { message: `Status must be one of: ${VALID.join(', ')}` });
      try {
        const pool = await patientsPoolPromise;
        await pool.request()
          .input('id',     sql.Int,     id)
          .input('status', sql.VarChar, status)
          .query(`UPDATE dbo.appointments SET Status=@status WHERE ID=@id`);
        sendJSON(res, 200, { message: 'Appointment status updated.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ══════════════════════════════════════════════════════════════════════
    // ── VOICE NOTES ROUTES ────────────────────────────────────────────────
    //
    // SQL migration (run once — safe to re-run):
    //
    //   IF NOT EXISTS (
    //     SELECT 1 FROM sys.tables
    //     WHERE object_id = OBJECT_ID('dbo.voice_notes')
    //   )
    //   CREATE TABLE dbo.voice_notes (
    //     ID                  INT IDENTITY(1,1) PRIMARY KEY,
    //     Patient_No          VARCHAR(50)   NOT NULL,
    //     Patient_Type        VARCHAR(10)   NOT NULL,
    //     Blob_Name           VARCHAR(500)  NOT NULL,
    //     Duration_Seconds    FLOAT         NULL,
    //     Recorded_By         VARCHAR(200)  NULL,
    //     Transcript          NVARCHAR(MAX) NULL,   -- raw Whisper text
    //     Diarized_Transcript NVARCHAR(MAX) NULL,   -- JSON array [{speaker,text}]
    //     Soap_Note           NVARCHAR(MAX) NULL,   -- JSON object (SOAP sections)
    //     Language_Detected   NVARCHAR(20)  NULL,   -- e.g. "english", "hindi"
    //     Created_At          DATETIME      DEFAULT GETDATE()
    //   );
    //
    //   -- Safe column additions if table already exists:
    //   IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.voice_notes') AND name='Transcript')
    //     ALTER TABLE dbo.voice_notes ADD Transcript NVARCHAR(MAX) NULL;
    //   IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.voice_notes') AND name='Diarized_Transcript')
    //     ALTER TABLE dbo.voice_notes ADD Diarized_Transcript NVARCHAR(MAX) NULL;
    //   IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.voice_notes') AND name='Soap_Note')
    //     ALTER TABLE dbo.voice_notes ADD Soap_Note NVARCHAR(MAX) NULL;
    //   IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.voice_notes') AND name='Language_Detected')
    //     ALTER TABLE dbo.voice_notes ADD Language_Detected NVARCHAR(20) NULL;
    //
    // ══════════════════════════════════════════════════════════════════════

    // ── POST /api/voice-notes — Upload audio + store transcript data ───────
    if (req.method === 'POST' && req.url === '/api/voice-notes') {
      try {
        await parseMultipartField(req, 'audio');
        const file = req.file;
        if (!file) return sendJSON(res, 400, { message: 'No audio file uploaded.' });

        const patientNo   = req.body?.patientNo   || '';
        const patientType = req.body?.patientType || 'IP';
        const duration    = parseFloat(req.body?.duration)  || null;
        const recordedBy  = req.body?.recordedBy  || req.user?.name || '';

        // Transcript fields — sent from frontend after calling /agent/transcribe-summarize
        const transcript         = req.body?.transcript          || null;
        const diarizedRaw        = req.body?.diarized_transcript || null;
        const soapRaw            = req.body?.soap_note           || null;
        const languageDetected   = req.body?.language_detected   || null;

        // Validate and normalise JSON fields
        const safeJson = (raw) => {
          if (!raw) return null;
          if (typeof raw === 'object') return JSON.stringify(raw);
          try { JSON.parse(raw); return raw; }   // already valid JSON string
          catch { return null; }
        };

        if (!patientNo) return sendJSON(res, 400, { message: 'patientNo is required.' });

        const ext             = (file.originalname.split('.').pop() || 'webm').toLowerCase();
        const blobName        = `voice-notes/${patientNo}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        await blockBlobClient.uploadData(file.buffer, {
          blobHTTPHeaders: { blobContentType: file.mimetype || 'audio/webm' },
        });

        const pool = await patientsPoolPromise;
        await pool.request()
          .input('patientNo',          sql.VarChar,  patientNo)
          .input('patientType',        sql.VarChar,  patientType)
          .input('blobName',           sql.VarChar,  blobName)
          .input('duration',           sql.Float,    duration)
          .input('recordedBy',         sql.VarChar,  recordedBy)
          .input('transcript',         sql.NVarChar, transcript)
          .input('diarizedTranscript', sql.NVarChar, safeJson(diarizedRaw))
          .input('soapNote',           sql.NVarChar, safeJson(soapRaw))
          .input('languageDetected',   sql.NVarChar, languageDetected)
          .query(`INSERT INTO dbo.voice_notes
                    (Patient_No, Patient_Type, Blob_Name, Duration_Seconds,
                     Recorded_By, Transcript, Diarized_Transcript, Soap_Note, Language_Detected)
                  VALUES
                    (@patientNo, @patientType, @blobName, @duration,
                     @recordedBy, @transcript, @diarizedTranscript, @soapNote, @languageDetected)`);

        sendJSON(res, 201, { message: 'Voice note saved.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── GET /api/voice-notes/:patientNo?type=IP|OP — List notes ───────────
    // IMPORTANT: this route MUST be checked BEFORE the transcript route
    // because both start with /api/voice-notes/. The transcript route
    // matches /api/voice-notes/:id/transcript (has a second path segment).
    if (req.method === 'GET' && req.url.startsWith('/api/voice-notes/')) {
      const rawSeg  = req.url.split('/api/voice-notes/')[1] || '';
      const segments = rawSeg.split('?')[0].split('/');

      // ── GET /api/voice-notes/:id/transcript — Lazy-load transcript ───────
      // Matches when there are exactly 2 path segments: <id>/transcript
      if (segments.length === 2 && segments[1] === 'transcript') {
        const id = parseInt(segments[0], 10);
        if (!id || isNaN(id)) return sendJSON(res, 400, { message: 'Invalid voice note ID.' });
        try {
          const pool   = await patientsPoolPromise;
          const result = await pool.request()
            .input('id', sql.Int, id)
            .query(`SELECT ID, Patient_No, Patient_Type,
                           Transcript, Diarized_Transcript, Soap_Note, Language_Detected
                    FROM dbo.voice_notes WHERE ID = @id`);

          if (!result.recordset.length)
            return sendJSON(res, 404, { message: 'Voice note not found.' });

          const row = result.recordset[0];

          // Verify the requesting doctor can access this patient
          const patientType = row.Patient_Type || 'IP';
          const access = await canAccessPatient(
            pool, row.Patient_No, patientType, req.user.department
          );
          if (!access) return sendJSON(res, 403, { message: 'Access denied.' });

          const parseJson = (val) => {
            if (!val) return null;
            if (typeof val === 'object') return val;
            try { return JSON.parse(val); } catch { return null; }
          };

          const transcript  = row.Transcript         || '';
          const diarized    = parseJson(row.Diarized_Transcript) || [];
          const soap        = parseJson(row.Soap_Note)           || {};
          const language    = row.Language_Detected              || '';

          if (!transcript && !diarized.length && !Object.keys(soap).length) {
            return sendJSON(res, 404, { message: 'No transcript stored for this note yet.' });
          }

          return sendJSON(res, 200, {
            transcript,
            diarized_transcript: diarized,
            soap_note:           soap,
            language_detected:   language,
          });
        } catch (err) { return sendJSON(res, 500, { message: err.message }); }
      }

      // ── GET /api/voice-notes/:patientNo?type=IP|OP — List all notes ──────
      const patientNo   = decodeURIComponent(segments[0]);
      const patientType = rawSeg.includes('type=OP') ? 'OP' : 'IP';

      if (!patientNo) return sendJSON(res, 400, { message: 'Patient number required.' });
      try {
        const pool   = await patientsPoolPromise;
        const access = await canAccessPatient(pool, patientNo, patientType, req.user.department);
        if (!access) return sendJSON(res, 403, { message: 'Access denied.' });

        const result = await pool.request()
          .input('patientNo',   sql.VarChar, patientNo)
          .input('patientType', sql.VarChar, patientType)
          .query(`SELECT ID, Patient_No, Patient_Type, Blob_Name,
                         Duration_Seconds, Recorded_By, Created_At,
                         -- include a flag so frontend knows if transcript exists
                         CASE WHEN Transcript IS NOT NULL AND LEN(Transcript) > 0
                              THEN 1 ELSE 0 END AS Has_Transcript
                  FROM dbo.voice_notes
                  WHERE Patient_No = @patientNo AND Patient_Type = @patientType
                  ORDER BY Created_At DESC`);

        // Generate 1-hour SAS URL per note. Transcript text is NOT included
        // in the list response — it is fetched on demand via the /transcript route.
        const notes = result.recordset.map(note => ({
          ID:               note.ID,
          Patient_No:       note.Patient_No,
          Patient_Type:     note.Patient_Type,
          Blob_URL:         note.Blob_Name ? generateVoiceNoteSasUrl(note.Blob_Name) : null,
          Duration_Seconds: note.Duration_Seconds,
          Recorded_By:      note.Recorded_By,
          Created_At:       note.Created_At,
          Has_Transcript:   !!note.Has_Transcript,  // tells frontend whether to show accordion
        }));

        sendJSON(res, 200, { notes });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── DELETE /api/voice-notes/:id — Delete a voice note ─────────────────
    if (req.method === 'DELETE' && req.url.startsWith('/api/voice-notes/')) {
      const seg = req.url.split('/api/voice-notes/')[1] || '';
      const id  = parseInt(seg, 10);
      if (!id || isNaN(id)) return sendJSON(res, 400, { message: 'Invalid voice note ID.' });
      try {
        const pool = await patientsPoolPromise;
        const row  = await pool.request()
          .input('id', sql.Int, id)
          .query('SELECT Blob_Name FROM dbo.voice_notes WHERE ID = @id');
        if (!row.recordset.length) return sendJSON(res, 404, { message: 'Voice note not found.' });

        try {
          const blockBlobClient = containerClient.getBlockBlobClient(row.recordset[0].Blob_Name);
          await blockBlobClient.deleteIfExists();
        } catch (blobErr) {
          console.warn('Azure blob delete warning:', blobErr.message);
        }

        await pool.request()
          .input('id', sql.Int, id)
          .query('DELETE FROM dbo.voice_notes WHERE ID = @id');

        sendJSON(res, 200, { message: 'Voice note deleted.' });
      } catch (err) { sendJSON(res, 500, { message: err.message }); }
      return;
    }

    // ── 404 fallback ───────────────────────────────────────────────────────
    sendJSON(res, 404, { message: 'Route not found' });
  });

  const PORT = process.env.PORT || 8080;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 VabGenRx API running on port ${PORT}`);
  });
})();