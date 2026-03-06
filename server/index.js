// ─── IMPORTANT ───────────────────────────────────────────────────
// ALL route handlers must be INSIDE the http.createServer callback.
// The `await getBody(req)` calls only work inside an async function.
// Do NOT paste any route blocks outside the createServer callback.
// ─────────────────────────────────────────────────────────────────
require('dotenv').config();
const http    = require('http');
const multer  = require('multer');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcrypt');
const { BlobServiceClient } = require('@azure/storage-blob');
const { sql, poolPromise, patientsPoolPromise } = require('./db');

const SALT_ROUNDS    = 12;
const JWT_SECRET     = process.env.JWT_SECRET     || 'vabgenrx_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

const upload = multer({ storage: multer.memoryStorage() });

const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
);
const containerClient = blobServiceClient.getContainerClient(
  process.env.AZURE_CONTAINER_NAME
);

const parseMultipart = (req) => new Promise((resolve, reject) => {
  upload.single('image')(req, {}, (err) => {
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
};

// ── JWT Middleware ───────────────────────────────────────────
const verifyToken = (req) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
};

const PUBLIC_ROUTES = [
  { method: 'POST', url: '/api/signin'   },
  { method: 'POST', url: '/api/register' },
  { method: 'GET',  url: '/'             },
];

const isPublic = (method, url) =>
  PUBLIC_ROUTES.some(r => r.method === method && r.url === url);

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  console.log(`➡️  ${req.method} ${req.url}`);

  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200); res.end('Backend is running!'); return;
  }

  // ── JWT Guard ────────────────────────────────────────────────
  if (!isPublic(req.method, req.url)) {
    const decoded = verifyToken(req);
    if (!decoded) return sendJSON(res, 401, { message: 'Unauthorized: Invalid or expired token' });
    req.user = decoded;
  }

  // ── Upload image ─────────────────────────────────────────────
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

  // ── Get profile ──────────────────────────────────────────────
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

  // ── Sign in ──────────────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/signin') {
    const { email, password } = await getBody(req);
    if (!email || !password)
      return sendJSON(res, 400, { message: 'Email and password required.' });
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('email', sql.VarChar, email)
        .query('SELECT * FROM users WHERE email = @email');
      if (result.recordset.length === 0)
        return sendJSON(res, 401, { message: 'Invalid email or password' });
      const user  = result.recordset[0];
      const match = await bcrypt.compare(password, user.password);
      if (!match)
        return sendJSON(res, 401, { message: 'Invalid email or password' });
      const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name, role: user.designation || 'doctor' },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      delete user.password;
      sendJSON(res, 200, { message: 'Sign in successful', token, user });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Register ─────────────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/register') {
    const { hospital_id, licence_no, name, designation, department,
            dob, age, sex, address, contact_no, email, password } = await getBody(req);
    if (!email || !password)
      return sendJSON(res, 400, { message: 'Email and password required.' });
    try {
      const pool = await poolPromise;
      const existing = await pool.request()
        .input('email', sql.VarChar, email)
        .query('SELECT id FROM users WHERE email = @email');
      if (existing.recordset.length > 0)
        return sendJSON(res, 409, { message: 'Email already registered.' });
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      await pool.request()
        .input('hospital_id',    sql.VarChar, hospital_id  || '')
        .input('licence_no',     sql.VarChar, licence_no   || '')
        .input('name',           sql.VarChar, name         || '')
        .input('designation',    sql.VarChar, designation  || '')
        .input('department',     sql.VarChar, department   || '')
        .input('dob',            sql.Date,    dob          || null)
        .input('age',            sql.Int,     age          || null)
        .input('sex',            sql.VarChar, sex          || '')
        .input('address',        sql.VarChar, address      || '')
        .input('contact_no',     sql.VarChar, contact_no   || '')
        .input('email',          sql.VarChar, email)
        .input('password',       sql.VarChar, hashedPassword)
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

  // ── Update address ───────────────────────────────────────────
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

  // ── Change password ──────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/profile/change-password') {
    const { email, currentPassword, newPassword } = await getBody(req);
    if (!email || !currentPassword || !newPassword)
      return sendJSON(res, 400, { message: 'All fields required.' });
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('email', sql.VarChar, email)
        .query('SELECT password FROM users WHERE email = @email');
      if (!result.recordset.length)
        return sendJSON(res, 404, { message: 'User not found.' });
      const match = await bcrypt.compare(currentPassword, result.recordset[0].password);
      if (!match)
        return sendJSON(res, 401, { message: 'Current password is incorrect.' });
      const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await pool.request()
        .input('email',    sql.VarChar, email)
        .input('password', sql.VarChar, newHash)
        .query('UPDATE users SET password = @password WHERE email = @email');
      sendJSON(res, 200, { message: 'Password changed successfully.' });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Get all users (for referral autocomplete) ────────────────
  if (req.method === 'GET' && req.url === '/api/users') {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .query('SELECT name, department, designation FROM dbo.users ORDER BY name ASC');
      sendJSON(res, 200, { users: result.recordset });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Get all inpatients ───────────────────────────────────────
  if (req.method === 'GET' && req.url === '/api/patients') {
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request().query(`
        SELECT IP_No, Name, Age, Sex, Race, Ethnicity, Preferred_Language,
          Occupation, Dept, DOA, Reason_for_Admission,
          Past_Medical_History, Past_Medication_History,
          Smoker, Alcoholic, Insurance_Type,
          Weight_kg, Height_cm, BMI, Followup_Outcome
        FROM dbo.patient_records ORDER BY IP_No ASC
      `);
      sendJSON(res, 200, { patients: result.recordset });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Get single inpatient ─────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/patients/')) {
    const ipNo = decodeURIComponent(req.url.split('/api/patients/')[1]);
    if (!ipNo) return sendJSON(res, 400, { message: 'Invalid IP number' });
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('ipNo', sql.VarChar, ipNo)
        .query(`SELECT IP_No, Name, Age, Sex, Race, Ethnicity, Preferred_Language,
            Occupation, Dept, DOA, Reason_for_Admission,
            Past_Medical_History, Past_Medication_History,
            Smoker, Alcoholic, Insurance_Type,
            Weight_kg, Height_cm, BMI, Followup_Outcome
          FROM dbo.patient_records WHERE IP_No = @ipNo`);
      if (result.recordset.length > 0) sendJSON(res, 200, { patient: result.recordset[0] });
      else sendJSON(res, 404, { message: 'Patient not found' });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Get all outpatients ──────────────────────────────────────
  if (req.method === 'GET' && req.url === '/api/outpatients') {
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request().query(`
        SELECT OP_No, Name, Age, Sex, Race, Ethnicity, Preferred_Language,
          Occupation, Dept, DOA, Reason_for_Admission,
          Past_Medical_History, Past_Medication_History,
          Smoker, Alcoholic, Insurance_Type,
          Weight_kg, Height_cm, BMI, Followup_Outcome
        FROM dbo.outpatient_records ORDER BY OP_No ASC
      `);
      sendJSON(res, 200, { patients: result.recordset });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Get single outpatient ────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/outpatients/')) {
    const opNo = decodeURIComponent(req.url.split('/api/outpatients/')[1]);
    if (!opNo) return sendJSON(res, 400, { message: 'Invalid OP number' });
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('opNo', sql.VarChar, opNo)
        .query(`SELECT OP_No, Name, Age, Sex, Race, Ethnicity, Preferred_Language,
            Occupation, Dept, DOA, Reason_for_Admission,
            Past_Medical_History, Past_Medication_History,
            Smoker, Alcoholic, Insurance_Type,
            Weight_kg, Height_cm, BMI, Followup_Outcome
          FROM dbo.outpatient_records WHERE OP_No = @opNo`);
      if (result.recordset.length > 0) sendJSON(res, 200, { patient: result.recordset[0] });
      else sendJSON(res, 404, { message: 'Outpatient not found' });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Get IP diagnosis ─────────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/ip-diagnosis/')) {
    const ipNo = decodeURIComponent(req.url.split('/api/ip-diagnosis/')[1]);
    try {
      const pool = await patientsPoolPromise;
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

  // ── Save IP diagnosis ────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/ip-diagnosis') {
    const { ipNo, primary, secondary, notes } = await getBody(req);
    if (!ipNo) return sendJSON(res, 400, { message: 'Invalid IP number' });
    try {
      const pool = await patientsPoolPromise;
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

  // ── Get OP diagnosis ─────────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/op-diagnosis/')) {
    const opNo = decodeURIComponent(req.url.split('/api/op-diagnosis/')[1]);
    try {
      const pool = await patientsPoolPromise;
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

  // ── Save OP diagnosis ────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/op-diagnosis') {
    const { opNo, primary, secondary, notes } = await getBody(req);
    if (!opNo) return sendJSON(res, 400, { message: 'Invalid OP number' });
    try {
      const pool = await patientsPoolPromise;
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

  // ── Get IP lab results ───────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/lab/')) {
    const ipNo = decodeURIComponent(req.url.split('/api/lab/')[1]);
    try {
      const pool = await patientsPoolPromise;
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

  // ── Get OP lab results ───────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/op-lab/')) {
    const opNo = decodeURIComponent(req.url.split('/api/op-lab/')[1]);
    try {
      const pool = await patientsPoolPromise;
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

  // ── Search drug inventory ────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/drug-inventory/search')) {
    const rawQ = req.url.split('?q=')[1] || '';
    const q = decodeURIComponent(rawQ.split('&')[0]);
    try {
      const pool = await patientsPoolPromise;
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

  // ── IP Prescriptions ─────────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/ip-prescriptions/')) {
    const ipNo = decodeURIComponent(req.url.split('/api/ip-prescriptions/')[1]);
    try {
      const pool = await patientsPoolPromise;
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
      const pool = await patientsPoolPromise;
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

  // ── OP Prescriptions ─────────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/op-prescriptions/')) {
    const opNo = decodeURIComponent(req.url.split('/api/op-prescriptions/')[1]);
    try {
      const pool = await patientsPoolPromise;
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
      const pool = await patientsPoolPromise;
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

  // ── IP Prescription Notes ────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/ip-prescription-notes/')) {
    const ipNo = decodeURIComponent(req.url.split('/api/ip-prescription-notes/')[1]);
    try {
      const pool = await patientsPoolPromise;
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
      const pool = await patientsPoolPromise;
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

  // ── OP Prescription Notes ────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/op-prescription-notes/')) {
    const opNo = decodeURIComponent(req.url.split('/api/op-prescription-notes/')[1]);
    try {
      const pool = await patientsPoolPromise;
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
      const pool = await patientsPoolPromise;
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

  // ── Save IP drug interactions ────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/ip-drug-interactions') {
    const { ip_no, dd_severe, dd_moderate, dd_minor,
            ddis_contraindicated, ddis_moderate, ddis_minor,
            drug_food } = await getBody(req);
    if (!ip_no) return sendJSON(res, 400, { message: 'IP_No required.' });
    try {
      const pool = await patientsPoolPromise;
      const existing = await pool.request()
        .input('ipNo', sql.VarChar, ip_no)
        .query('SELECT ID FROM dbo.ip_drug_interactions WHERE IP_No = @ipNo');
      if (existing.recordset.length > 0) {
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
          .query(`UPDATE dbo.ip_drug_interactions SET
            DD_Severe=@ddSev, DD_Moderate=@ddMod, DD_Minor=@ddMin,
            DDis_Contraindicated=@disCon, DDis_Moderate=@disMod, DDis_Minor=@disMin,
            Drug_Food=@food, Updated_At=@now WHERE IP_No=@ipNo`);
      } else {
        await pool.request()
          .input('ipNo',   sql.VarChar,  ip_no)
          .input('ddSev',  sql.NVarChar, JSON.stringify(dd_severe            || []))
          .input('ddMod',  sql.NVarChar, JSON.stringify(dd_moderate          || []))
          .input('ddMin',  sql.NVarChar, JSON.stringify(dd_minor             || []))
          .input('disCon', sql.NVarChar, JSON.stringify(ddis_contraindicated || []))
          .input('disMod', sql.NVarChar, JSON.stringify(ddis_moderate        || []))
          .input('disMin', sql.NVarChar, JSON.stringify(ddis_minor           || []))
          .input('food',   sql.NVarChar, JSON.stringify(drug_food            || []))
          .query(`INSERT INTO dbo.ip_drug_interactions
            (IP_No, DD_Severe, DD_Moderate, DD_Minor,
             DDis_Contraindicated, DDis_Moderate, DDis_Minor, Drug_Food)
            VALUES (@ipNo,@ddSev,@ddMod,@ddMin,@disCon,@disMod,@disMin,@food)`);
      }
      sendJSON(res, 200, { message: 'IP drug interactions saved.' });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Get IP drug interactions ─────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/ip-drug-interactions/')) {
    const ipNo = decodeURIComponent(req.url.split('/api/ip-drug-interactions/')[1]);
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('ipNo', sql.VarChar, ipNo)
        .query('SELECT * FROM dbo.ip_drug_interactions WHERE IP_No = @ipNo');
      if (!result.recordset.length)
        return sendJSON(res, 200, { found: false, data: null });
      const r = result.recordset[0];
      const parse = v => { try { return JSON.parse(v || '[]'); } catch { return []; } };
      sendJSON(res, 200, {
        found: true,
        data: {
          drug_drug: {
            severe:   parse(r.DD_Severe),
            moderate: parse(r.DD_Moderate),
            minor:    parse(r.DD_Minor),
          },
          drug_disease: {
            contraindicated: parse(r.DDis_Contraindicated),
            moderate:        parse(r.DDis_Moderate),
            minor:           parse(r.DDis_Minor),
          },
          drug_food:  parse(r.Drug_Food),
          updated_at: r.Updated_At,
        },
      });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Save OP drug interactions ────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/op-drug-interactions') {
    const { op_no, dd_severe, dd_moderate, dd_minor,
            ddis_contraindicated, ddis_moderate, ddis_minor,
            drug_food } = await getBody(req);
    if (!op_no) return sendJSON(res, 400, { message: 'OP_No required.' });
    try {
      const pool = await patientsPoolPromise;
      const existing = await pool.request()
        .input('opNo', sql.VarChar, op_no)
        .query('SELECT ID FROM dbo.op_drug_interactions WHERE OP_No = @opNo');
      if (existing.recordset.length > 0) {
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
          .query(`UPDATE dbo.op_drug_interactions SET
            DD_Severe=@ddSev, DD_Moderate=@ddMod, DD_Minor=@ddMin,
            DDis_Contraindicated=@disCon, DDis_Moderate=@disMod, DDis_Minor=@disMin,
            Drug_Food=@food, Updated_At=@now WHERE OP_No=@opNo`);
      } else {
        await pool.request()
          .input('opNo',   sql.VarChar,  op_no)
          .input('ddSev',  sql.NVarChar, JSON.stringify(dd_severe            || []))
          .input('ddMod',  sql.NVarChar, JSON.stringify(dd_moderate          || []))
          .input('ddMin',  sql.NVarChar, JSON.stringify(dd_minor             || []))
          .input('disCon', sql.NVarChar, JSON.stringify(ddis_contraindicated || []))
          .input('disMod', sql.NVarChar, JSON.stringify(ddis_moderate        || []))
          .input('disMin', sql.NVarChar, JSON.stringify(ddis_minor           || []))
          .input('food',   sql.NVarChar, JSON.stringify(drug_food            || []))
          .query(`INSERT INTO dbo.op_drug_interactions
            (OP_No, DD_Severe, DD_Moderate, DD_Minor,
             DDis_Contraindicated, DDis_Moderate, DDis_Minor, Drug_Food)
            VALUES (@opNo,@ddSev,@ddMod,@ddMin,@disCon,@disMod,@disMin,@food)`);
      }
      sendJSON(res, 200, { message: 'OP drug interactions saved.' });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Get OP drug interactions ─────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/op-drug-interactions/')) {
    const opNo = decodeURIComponent(req.url.split('/api/op-drug-interactions/')[1]);
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('opNo', sql.VarChar, opNo)
        .query('SELECT * FROM dbo.op_drug_interactions WHERE OP_No = @opNo');
      if (!result.recordset.length)
        return sendJSON(res, 200, { found: false, data: null });
      const r = result.recordset[0];
      const parse = v => { try { return JSON.parse(v || '[]'); } catch { return []; } };
      sendJSON(res, 200, {
        found: true,
        data: {
          drug_drug: {
            severe:   parse(r.DD_Severe),
            moderate: parse(r.DD_Moderate),
            minor:    parse(r.DD_Minor),
          },
          drug_disease: {
            contraindicated: parse(r.DDis_Contraindicated),
            moderate:        parse(r.DDis_Moderate),
            minor:           parse(r.DDis_Minor),
          },
          drug_food:  parse(r.Drug_Food),
          updated_at: r.Updated_At,
        },
      });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Save IP dosing recommendations ───────────────────────────
  if (req.method === 'POST' && req.url === '/api/ip-dosing-recommendations') {
    const { ip_no, high, medium } = await getBody(req);
    if (!ip_no) return sendJSON(res, 400, { message: 'IP_No required.' });
    try {
      const pool = await patientsPoolPromise;
      const existing = await pool.request()
        .input('ipNo', sql.VarChar, ip_no)
        .query('SELECT ID FROM dbo.ip_dosing_recommendations WHERE IP_No = @ipNo');
      if (existing.recordset.length > 0) {
        await pool.request()
          .input('ipNo',   sql.VarChar,  ip_no)
          .input('high',   sql.NVarChar, JSON.stringify(high   || []))
          .input('medium', sql.NVarChar, JSON.stringify(medium || []))
          .input('now',    sql.DateTime, new Date())
          .query(`UPDATE dbo.ip_dosing_recommendations
            SET High=@high, Medium=@medium, Updated_At=@now WHERE IP_No=@ipNo`);
      } else {
        await pool.request()
          .input('ipNo',   sql.VarChar,  ip_no)
          .input('high',   sql.NVarChar, JSON.stringify(high   || []))
          .input('medium', sql.NVarChar, JSON.stringify(medium || []))
          .query(`INSERT INTO dbo.ip_dosing_recommendations (IP_No, High, Medium)
            VALUES (@ipNo, @high, @medium)`);
      }
      sendJSON(res, 200, { message: 'IP dosing recommendations saved.' });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Get IP dosing recommendations ────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/ip-dosing-recommendations/')) {
    const ipNo = decodeURIComponent(req.url.split('/api/ip-dosing-recommendations/')[1]);
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('ipNo', sql.VarChar, ipNo)
        .query('SELECT * FROM dbo.ip_dosing_recommendations WHERE IP_No = @ipNo');
      if (!result.recordset.length)
        return sendJSON(res, 200, { found: false, data: null });
      const r = result.recordset[0];
      const parse = v => { try { return JSON.parse(v || '[]'); } catch { return []; } };
      sendJSON(res, 200, { found: true, data: { high: parse(r.High), medium: parse(r.Medium), updated_at: r.Updated_At } });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Save OP dosing recommendations ───────────────────────────
  if (req.method === 'POST' && req.url === '/api/op-dosing-recommendations') {
    const { op_no, high, medium } = await getBody(req);
    if (!op_no) return sendJSON(res, 400, { message: 'OP_No required.' });
    try {
      const pool = await patientsPoolPromise;
      const existing = await pool.request()
        .input('opNo', sql.VarChar, op_no)
        .query('SELECT ID FROM dbo.op_dosing_recommendations WHERE OP_No = @opNo');
      if (existing.recordset.length > 0) {
        await pool.request()
          .input('opNo',   sql.VarChar,  op_no)
          .input('high',   sql.NVarChar, JSON.stringify(high   || []))
          .input('medium', sql.NVarChar, JSON.stringify(medium || []))
          .input('now',    sql.DateTime, new Date())
          .query(`UPDATE dbo.op_dosing_recommendations
            SET High=@high, Medium=@medium, Updated_At=@now WHERE OP_No=@opNo`);
      } else {
        await pool.request()
          .input('opNo',   sql.VarChar,  op_no)
          .input('high',   sql.NVarChar, JSON.stringify(high   || []))
          .input('medium', sql.NVarChar, JSON.stringify(medium || []))
          .query(`INSERT INTO dbo.op_dosing_recommendations (OP_No, High, Medium)
            VALUES (@opNo, @high, @medium)`);
      }
      sendJSON(res, 200, { message: 'OP dosing recommendations saved.' });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Get OP dosing recommendations ────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/op-dosing-recommendations/')) {
    const opNo = decodeURIComponent(req.url.split('/api/op-dosing-recommendations/')[1]);
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('opNo', sql.VarChar, opNo)
        .query('SELECT * FROM dbo.op_dosing_recommendations WHERE OP_No = @opNo');
      if (!result.recordset.length)
        return sendJSON(res, 200, { found: false, data: null });
      const r = result.recordset[0];
      const parse = v => { try { return JSON.parse(v || '[]'); } catch { return []; } };
      sendJSON(res, 200, { found: true, data: { high: parse(r.High), medium: parse(r.Medium), updated_at: r.Updated_At } });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Save IP patient counselling ──────────────────────────────
  if (req.method === 'POST' && req.url === '/api/ip-patient-counselling') {
    const { ip_no, drug_counselling, condition_counselling } = await getBody(req);
    if (!ip_no) return sendJSON(res, 400, { message: 'IP_No required.' });
    try {
      const pool = await patientsPoolPromise;
      const existing = await pool.request()
        .input('ipNo', sql.VarChar, ip_no)
        .query('SELECT ID FROM dbo.ip_patient_counselling WHERE IP_No = @ipNo');
      if (existing.recordset.length > 0) {
        await pool.request()
          .input('ipNo', sql.VarChar,  ip_no)
          .input('dc',   sql.NVarChar, JSON.stringify(drug_counselling      || []))
          .input('cc',   sql.NVarChar, JSON.stringify(condition_counselling || []))
          .input('now',  sql.DateTime, new Date())
          .query(`UPDATE dbo.ip_patient_counselling
            SET Drug_Counselling=@dc, Condition_Counselling=@cc, Updated_At=@now
            WHERE IP_No=@ipNo`);
      } else {
        await pool.request()
          .input('ipNo', sql.VarChar,  ip_no)
          .input('dc',   sql.NVarChar, JSON.stringify(drug_counselling      || []))
          .input('cc',   sql.NVarChar, JSON.stringify(condition_counselling || []))
          .query(`INSERT INTO dbo.ip_patient_counselling (IP_No, Drug_Counselling, Condition_Counselling)
            VALUES (@ipNo, @dc, @cc)`);
      }
      sendJSON(res, 200, { message: 'IP patient counselling saved.' });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Get IP patient counselling ───────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/ip-patient-counselling/')) {
    const ipNo = decodeURIComponent(req.url.split('/api/ip-patient-counselling/')[1]);
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('ipNo', sql.VarChar, ipNo)
        .query('SELECT * FROM dbo.ip_patient_counselling WHERE IP_No = @ipNo');
      if (!result.recordset.length)
        return sendJSON(res, 200, { found: false, data: null });
      const r = result.recordset[0];
      const parse = v => { try { return JSON.parse(v || '[]'); } catch { return []; } };
      sendJSON(res, 200, {
        found: true,
        data: {
          drug_counselling:      parse(r.Drug_Counselling),
          condition_counselling: parse(r.Condition_Counselling),
          updated_at:            r.Updated_At,
        },
      });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Save OP patient counselling ──────────────────────────────
  if (req.method === 'POST' && req.url === '/api/op-patient-counselling') {
    const { op_no, drug_counselling, condition_counselling } = await getBody(req);
    if (!op_no) return sendJSON(res, 400, { message: 'OP_No required.' });
    try {
      const pool = await patientsPoolPromise;
      const existing = await pool.request()
        .input('opNo', sql.VarChar, op_no)
        .query('SELECT ID FROM dbo.op_patient_counselling WHERE OP_No = @opNo');
      if (existing.recordset.length > 0) {
        await pool.request()
          .input('opNo', sql.VarChar,  op_no)
          .input('dc',   sql.NVarChar, JSON.stringify(drug_counselling      || []))
          .input('cc',   sql.NVarChar, JSON.stringify(condition_counselling || []))
          .input('now',  sql.DateTime, new Date())
          .query(`UPDATE dbo.op_patient_counselling
            SET Drug_Counselling=@dc, Condition_Counselling=@cc, Updated_At=@now
            WHERE OP_No=@opNo`);
      } else {
        await pool.request()
          .input('opNo', sql.VarChar,  op_no)
          .input('dc',   sql.NVarChar, JSON.stringify(drug_counselling      || []))
          .input('cc',   sql.NVarChar, JSON.stringify(condition_counselling || []))
          .query(`INSERT INTO dbo.op_patient_counselling (OP_No, Drug_Counselling, Condition_Counselling)
            VALUES (@opNo, @dc, @cc)`);
      }
      sendJSON(res, 200, { message: 'OP patient counselling saved.' });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Get OP patient counselling ───────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/op-patient-counselling/')) {
    const opNo = decodeURIComponent(req.url.split('/api/op-patient-counselling/')[1]);
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('opNo', sql.VarChar, opNo)
        .query('SELECT * FROM dbo.op_patient_counselling WHERE OP_No = @opNo');
      if (!result.recordset.length)
        return sendJSON(res, 200, { found: false, data: null });
      const r = result.recordset[0];
      const parse = v => { try { return JSON.parse(v || '[]'); } catch { return []; } };
      sendJSON(res, 200, {
        found: true,
        data: {
          drug_counselling:      parse(r.Drug_Counselling),
          condition_counselling: parse(r.Condition_Counselling),
          updated_at:            r.Updated_At,
        },
      });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Save IP referral ─────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/ip-referral') {
    const { ipNo, to_dept, to_doctor, urgency, reason, notes, date } = await getBody(req);
    if (!ipNo) return sendJSON(res, 400, { message: 'IP_No required.' });
    try {
      const pool = await patientsPoolPromise;
      await pool.request()
        .input('ipNo',     sql.VarChar, ipNo)
        .input('toDept',   sql.VarChar, to_dept    || '')
        .input('toDoctor', sql.VarChar, to_doctor  || '')
        .input('urgency',  sql.VarChar, urgency    || 'Routine')
        .input('date',     sql.Date,    date       || null)
        .input('reason',   sql.VarChar, reason     || '')
        .input('notes',    sql.VarChar, notes      || null)
        .query(`INSERT INTO dbo.ip_refferal
          (IP_No, Refer_To_Department, Refer_To_Doctor, Urgency, Referral_Date, Reason_For_Referral, Additional_Notes)
          VALUES (@ipNo, @toDept, @toDoctor, @urgency, @date, @reason, @notes)`);
      sendJSON(res, 201, { message: 'IP referral saved.' });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Delete IP referral ───────────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/ip-referral/delete') {
    const { patientNo, to_doctor, to_dept, date } = await getBody(req);
    if (!patientNo) return sendJSON(res, 400, { message: 'IP_No required.' });
    try {
      const pool = await patientsPoolPromise;
      await pool.request()
        .input('ipNo',     sql.VarChar, patientNo)
        .input('toDoctor', sql.VarChar, to_doctor || '')
        .input('toDept',   sql.VarChar, to_dept   || '')
        .input('date',     sql.Date,    date       || null)
        .query(`DELETE FROM dbo.ip_refferal
                WHERE IP_No = @ipNo
                  AND Refer_To_Doctor     = @toDoctor
                  AND Refer_To_Department = @toDept
                  AND Referral_Date       = @date`);
      sendJSON(res, 200, { message: 'IP referral deleted.' });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Get IP referrals ─────────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/ip-referral/')) {
    const ipNo = decodeURIComponent(req.url.split('/api/ip-referral/')[1]);
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('ipNo', sql.VarChar, ipNo)
        .query(`SELECT IP_No, Refer_To_Department, Refer_To_Doctor, Urgency,
                       Referral_Date, Reason_For_Referral, Additional_Notes, Created_At
                FROM dbo.ip_refferal WHERE IP_No = @ipNo ORDER BY Created_At DESC`);
      sendJSON(res, 200, { referrals: result.recordset });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Save OP referral ─────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/op-referral') {
    const { opNo, to_dept, to_doctor, urgency, reason, notes, date } = await getBody(req);
    if (!opNo) return sendJSON(res, 400, { message: 'OP_No required.' });
    try {
      const pool = await patientsPoolPromise;
      await pool.request()
        .input('opNo',     sql.VarChar, opNo)
        .input('toDept',   sql.VarChar, to_dept    || '')
        .input('toDoctor', sql.VarChar, to_doctor  || '')
        .input('urgency',  sql.VarChar, urgency    || 'Routine')
        .input('date',     sql.Date,    date       || null)
        .input('reason',   sql.VarChar, reason     || '')
        .input('notes',    sql.VarChar, notes      || null)
        .query(`INSERT INTO dbo.op_refferal
          (OP_No, Refer_To_Department, Refer_To_Doctor, Urgency, Referral_Date, Reason_For_Referral, Additional_Notes)
          VALUES (@opNo, @toDept, @toDoctor, @urgency, @date, @reason, @notes)`);
      sendJSON(res, 201, { message: 'OP referral saved.' });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Delete OP referral ───────────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/op-referral/delete') {
    const { patientNo, to_doctor, to_dept, date } = await getBody(req);
    if (!patientNo) return sendJSON(res, 400, { message: 'OP_No required.' });
    try {
      const pool = await patientsPoolPromise;
      await pool.request()
        .input('opNo',     sql.VarChar, patientNo)
        .input('toDoctor', sql.VarChar, to_doctor || '')
        .input('toDept',   sql.VarChar, to_dept   || '')
        .input('date',     sql.Date,    date       || null)
        .query(`DELETE FROM dbo.op_refferal
                WHERE OP_No = @opNo
                  AND Refer_To_Doctor     = @toDoctor
                  AND Refer_To_Department = @toDept
                  AND Referral_Date       = @date`);
      sendJSON(res, 200, { message: 'OP referral deleted.' });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── Get OP referrals ─────────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/op-referral/')) {
    const opNo = decodeURIComponent(req.url.split('/api/op-referral/')[1]);
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('opNo', sql.VarChar, opNo)
        .query(`SELECT OP_No, Refer_To_Department, Refer_To_Doctor, Urgency,
                       Referral_Date, Reason_For_Referral, Additional_Notes, Created_At
                FROM dbo.op_refferal WHERE OP_No = @opNo ORDER BY Created_At DESC`);
      sendJSON(res, 200, { referrals: result.recordset });
    } catch (err) { sendJSON(res, 500, { message: err.message }); }
    return;
  }

  // ── 404 ──────────────────────────────────────────────────────
  sendJSON(res, 404, { message: 'Route not found' });
});

server.listen(8080, () => console.log('🚀 Server running on http://localhost:8080'));