require('dotenv').config();
const http = require('http');
const multer = require('multer');
const { BlobServiceClient } = require('@azure/storage-blob');
const { sql, poolPromise, patientsPoolPromise } = require('./db');

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
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  console.log(`➡️  ${req.method} ${req.url}`);
  console.log(`🔎 startsWith op-lab: ${req.url.startsWith('/api/op-lab/')}`);
  console.log(`🔎 startsWith lab: ${req.url.startsWith('/api/lab/')}`);

  // ── Test ────────────────────────────────────────────────────
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200); res.end('Backend is running!'); return;
  }

  // ── Upload image ────────────────────────────────────────────
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
    } catch (err) {
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── Get profile ─────────────────────────────────────────────
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
        sendJSON(res, 200, { user });
      } else {
        sendJSON(res, 404, { message: 'User not found' });
      }
    } catch (err) {
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── Sign in ─────────────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/signin') {
    const { email, password } = await getBody(req);
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('email', sql.VarChar, email)
        .input('password', sql.VarChar, password)
        .query('SELECT * FROM users WHERE email = @email AND password = @password');
      if (result.recordset.length > 0) {
        sendJSON(res, 200, { message: 'Sign in successful', user: result.recordset[0] });
      } else {
        sendJSON(res, 401, { message: 'Invalid email or password' });
      }
    } catch (err) {
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── Register ────────────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/register') {
    const body = await getBody(req);
    const { hospital_id, licence_no, name, designation, department,
            dob, age, sex, address, contact_no, email, password } = body;
    try {
      const pool = await poolPromise;
      await pool.request()
        .input('hospital_id', sql.VarChar, hospital_id)
        .input('licence_no',  sql.VarChar, licence_no)
        .input('name',        sql.VarChar, name)
        .input('designation', sql.VarChar, designation)
        .input('department',  sql.VarChar, department)
        .input('dob',         sql.Date,    dob)
        .input('age',         sql.Int,     age)
        .input('sex',         sql.VarChar, sex)
        .input('address',     sql.VarChar, address)
        .input('contact_no',  sql.VarChar, contact_no)
        .input('email',       sql.VarChar, email)
        .input('password',    sql.VarChar, password)
        .query(`INSERT INTO users
          (hospital_id, licence_no, name, designation, department,
           dob, age, sex, address, contact_no, email, password)
          VALUES
          (@hospital_id, @licence_no, @name, @designation, @department,
           @dob, @age, @sex, @address, @contact_no, @email, @password)`);
      sendJSON(res, 201, { message: 'Registration successful' });
    } catch (err) {
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── Get outpatient lab results by OP_No (/api/op-lab/) ──────
  if (req.method === 'GET' && req.url.startsWith('/api/op-lab/')) {
    const opNo = decodeURIComponent(req.url.split('/api/op-lab/')[1]);
    if (!opNo) { sendJSON(res, 400, { message: 'Invalid OP number' }); return; }
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('opNo', sql.VarChar, opNo)
        .query(`
          SELECT
            OP_No, BP_Systolic, BP_Diastolic, Pulse, Temperature, SpO2,
            Hb, WBC, Platelet_Count, RBS, FBS, PPBS,
            Urea, Creatinine, eGFR_mL_min_1_73m2,
            Sodium, Potassium, Chloride,
            SGOT, SGPT, ALP, Total_Bilirubin,
            Lipid_Profile, ECG, Xray, Ultrasound, CT, MRI,
            FreeT3, FreeT4, TSH, Other_Investigations
          FROM dbo.op_lab_results
          WHERE OP_No = @opNo
        `);
      if (result.recordset.length > 0) {
        sendJSON(res, 200, { lab: result.recordset[0] });
      } else {
        sendJSON(res, 404, { message: 'Outpatient lab results not found' });
      }
    } catch (err) {
      console.error('❌ op-lab error:', err.message);
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── Get inpatient lab results by IP_No (/api/lab/) ──────────
  if (req.method === 'GET' && req.url.startsWith('/api/lab/')) {
    const ipNo = decodeURIComponent(req.url.split('/api/lab/')[1]);
    if (!ipNo) { sendJSON(res, 400, { message: 'Invalid IP number' }); return; }
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('ipNo', sql.VarChar, ipNo)
        .query(`
          SELECT
            IP_No, Pulse, eGFR_mL_min_1_73m2, Sodium, Potassium, Chloride,
            Total_Bilirubin, FreeT3, FreeT4, TSH, Other_Investigations
          FROM dbo.ip_lab_results
          WHERE IP_No = @ipNo
        `);
      if (result.recordset.length > 0) {
        sendJSON(res, 200, { lab: result.recordset[0] });
      } else {
        sendJSON(res, 404, { message: 'Lab results not found' });
      }
    } catch (err) {
      console.error('❌ lab results error:', err.message);
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── Get single outpatient by OP_No ──────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/outpatients/')) {
    const opNo = decodeURIComponent(req.url.split('/api/outpatients/')[1]);
    if (!opNo) { sendJSON(res, 400, { message: 'Invalid OP number' }); return; }
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('opNo', sql.VarChar, opNo)
        .query(`
          SELECT
            OP_No, Name, Age, Sex, Race, Ethnicity, Preferred_Language,
            Occupation, Dept, DOA, Reason_for_Admission,
            Past_Medical_History, Past_Medication_History,
            Smoker, Alcoholic, Insurance_Type,
            Weight_kg, Height_cm, BMI, Followup_Outcome
          FROM dbo.outpatient_records
          WHERE OP_No = @opNo
        `);
      if (result.recordset.length > 0) {
        sendJSON(res, 200, { patient: result.recordset[0] });
      } else {
        sendJSON(res, 404, { message: 'Outpatient not found' });
      }
    } catch (err) {
      console.error('❌ single outpatient error:', err.message);
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── Get all outpatients ─────────────────────────────────────
  if (req.method === 'GET' && req.url === '/api/outpatients') {
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request().query(`
        SELECT
          OP_No, Name, Age, Sex, Race, Ethnicity, Preferred_Language,
          Occupation, Dept, DOA, Reason_for_Admission,
          Past_Medical_History, Past_Medication_History,
          Smoker, Alcoholic, Insurance_Type,
          Weight_kg, Height_cm, BMI, Followup_Outcome
        FROM dbo.outpatient_records
        ORDER BY OP_No ASC
      `);
      sendJSON(res, 200, { patients: result.recordset });
    } catch (err) {
      console.error('❌ outpatients error:', err.message);
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── Get single inpatient by IP_No ───────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/patients/')) {
    const ipNo = decodeURIComponent(req.url.split('/api/patients/')[1]);
    if (!ipNo) { sendJSON(res, 400, { message: 'Invalid IP number' }); return; }
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('ipNo', sql.VarChar, ipNo)
        .query(`
          SELECT
            IP_No, Name, Age, Sex, Race, Ethnicity, Preferred_Language,
            Occupation, Dept, DOA, DOD,
            Reason_for_Admission, Past_Medical_History, Past_Medication_History,
            Smoker, Alcoholic, Insurance_Type,
            Weight_kg, Height_cm, BMI, Followup_Outcome
          FROM dbo.patient_records
          WHERE IP_No = @ipNo
        `);
      if (result.recordset.length > 0) {
        sendJSON(res, 200, { patient: result.recordset[0] });
      } else {
        sendJSON(res, 404, { message: 'Patient not found' });
      }
    } catch (err) {
      console.error('❌ single patient error:', err.message);
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── Get all inpatients ──────────────────────────────────────
  if (req.method === 'GET' && req.url === '/api/patients') {
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request().query(`
        SELECT
          IP_No, Name, Age, Sex, Race, Ethnicity, Preferred_Language,
          Occupation, Dept, DOA, DOD,
          Reason_for_Admission, Past_Medical_History, Past_Medication_History,
          Smoker, Alcoholic, Insurance_Type,
          Weight_kg, Height_cm, BMI, Followup_Outcome
        FROM dbo.patient_records
        ORDER BY IP_No ASC
      `);
      sendJSON(res, 200, { patients: result.recordset });
    } catch (err) {
      console.error('❌ inpatients error:', err.message);
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── 404 ─────────────────────────────────────────────────────
  sendJSON(res, 404, { message: 'Route not found' });
});

server.listen(8080, () => console.log('🚀 Server running on http://localhost:8080'));