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

  // ── Update address ──────────────────────────────────────────
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
    } catch (err) {
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── Change password ─────────────────────────────────────────
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
      if (currentPassword !== result.recordset[0].password)
        return sendJSON(res, 401, { message: 'Current password is incorrect.' });
      await pool.request()
        .input('email',    sql.VarChar, email)
        .input('password', sql.VarChar, newPassword)
        .query('UPDATE users SET password = @password WHERE email = @email');
      sendJSON(res, 200, { message: 'Password changed.' });
    } catch (err) {
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── Get all inpatients ──────────────────────────────────────
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
    } catch (err) {
      console.error('❌ inpatients error:', err.message);
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── Get single inpatient by IP_No ───────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/patients/')) {
    const ipNo = decodeURIComponent(req.url.split('/api/patients/')[1]);
    if (!ipNo) return sendJSON(res, 400, { message: 'Invalid IP number' });
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('ipNo', sql.VarChar, ipNo)
        .query(`
          SELECT IP_No, Name, Age, Sex, Race, Ethnicity, Preferred_Language,
            Occupation, Dept, DOA,
            Reason_for_Admission, Past_Medical_History, Past_Medication_History,
            Smoker, Alcoholic, Insurance_Type,
            Weight_kg, Height_cm, BMI, Followup_Outcome
          FROM dbo.patient_records WHERE IP_No = @ipNo
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

  // ── Get all outpatients ─────────────────────────────────────
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
    } catch (err) {
      console.error('❌ outpatients error:', err.message);
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── Get single outpatient by OP_No ──────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/outpatients/')) {
    const opNo = decodeURIComponent(req.url.split('/api/outpatients/')[1]);
    if (!opNo) return sendJSON(res, 400, { message: 'Invalid OP number' });
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('opNo', sql.VarChar, opNo)
        .query(`
          SELECT OP_No, Name, Age, Sex, Race, Ethnicity, Preferred_Language,
            Occupation, Dept, DOA, Reason_for_Admission,
            Past_Medical_History, Past_Medication_History,
            Smoker, Alcoholic, Insurance_Type,
            Weight_kg, Height_cm, BMI, Followup_Outcome
          FROM dbo.outpatient_records WHERE OP_No = @opNo
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

  // ── Get IP diagnosis ────────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/ip-diagnosis/')) {
    const ipNo = decodeURIComponent(req.url.split('/api/ip-diagnosis/')[1]);
    if (!ipNo) return sendJSON(res, 400, { message: 'Invalid IP number' });
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('ipNo', sql.VarChar, ipNo)
        .query(`
          SELECT IP_No, Diagnosis, Secondary_Diagnosis, Clinical_Notes,
            Drugs_Prescribed, Drug_Drug_Interactions,
            Drug_Disease_Alerts, Drug_Food_Alerts, Dose_Adjustment_Notes
          FROM dbo.ip_diagnosis WHERE IP_No = @ipNo
        `);
      if (result.recordset.length > 0) {
        sendJSON(res, 200, { diagnosis: result.recordset[0] });
      } else {
        sendJSON(res, 404, { message: 'Diagnosis not found' });
      }
    } catch (err) {
      console.error('❌ ip-diagnosis error:', err.message);
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── Save IP diagnosis ───────────────────────────────────────
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
        .query(`
          UPDATE dbo.ip_diagnosis
          SET Diagnosis = @primary, Secondary_Diagnosis = @secondary, Clinical_Notes = @notes
          WHERE IP_No = @ipNo
        `);
      sendJSON(res, 200, { message: 'Diagnosis saved' });
    } catch (err) {
      console.error('❌ save ip-diagnosis error:', err.message);
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── Get OP diagnosis ────────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/op-diagnosis/')) {
    const opNo = decodeURIComponent(req.url.split('/api/op-diagnosis/')[1]);
    if (!opNo) return sendJSON(res, 400, { message: 'Invalid OP number' });
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('opNo', sql.VarChar, opNo)
        .query(`
          SELECT OP_No, Diagnosis, Secondary_Diagnosis, Clinical_Notes,
            Drugs_Prescribed, Drug_Drug_Interactions,
            Drug_Disease_Alerts, Drug_Food_Alerts, Dose_Adjustment_Notes
          FROM dbo.op_diagnosis WHERE OP_No = @opNo
        `);
      if (result.recordset.length > 0) {
        sendJSON(res, 200, { diagnosis: result.recordset[0] });
      } else {
        sendJSON(res, 404, { message: 'Diagnosis not found' });
      }
    } catch (err) {
      console.error('❌ op-diagnosis error:', err.message);
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── Save OP diagnosis ───────────────────────────────────────
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
        .query(`
          UPDATE dbo.op_diagnosis
          SET Diagnosis = @primary, Secondary_Diagnosis = @secondary, Clinical_Notes = @notes
          WHERE OP_No = @opNo
        `);
      sendJSON(res, 200, { message: 'Diagnosis saved' });
    } catch (err) {
      console.error('❌ save op-diagnosis error:', err.message);
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── Get IP lab results ──────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/lab/')) {
    const ipNo = decodeURIComponent(req.url.split('/api/lab/')[1]);
    if (!ipNo) return sendJSON(res, 400, { message: 'Invalid IP number' });
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('ipNo', sql.VarChar, ipNo)
        .query(`
          SELECT IP_No, Pulse, eGFR_mL_min_1_73m2, Sodium, Potassium, Chloride,
            Total_Bilirubin, FreeT3, FreeT4, TSH, Other_Investigations
          FROM dbo.ip_lab_results WHERE IP_No = @ipNo
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

  // ── Get OP lab results ──────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/op-lab/')) {
    const opNo = decodeURIComponent(req.url.split('/api/op-lab/')[1]);
    if (!opNo) return sendJSON(res, 400, { message: 'Invalid OP number' });
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('opNo', sql.VarChar, opNo)
        .query(`
          SELECT OP_No, BP_Systolic, BP_Diastolic, Pulse, Temperature, SpO2,
            Hb, WBC, Platelet_Count, RBS, FBS, PPBS,
            Urea, Creatinine, eGFR_mL_min_1_73m2,
            Sodium, Potassium, Chloride,
            SGOT, SGPT, ALP, Total_Bilirubin,
            Lipid_Profile, ECG, Xray, Ultrasound, CT, MRI,
            FreeT3, FreeT4, TSH, Other_Investigations
          FROM dbo.op_lab_results WHERE OP_No = @opNo
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

  // ── Search drug inventory ───────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/drug-inventory/search')) {
    const rawQ = req.url.split('?q=')[1] || '';
    const q = decodeURIComponent(rawQ.split('&')[0]);
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('q', sql.VarChar, `%${q}%`)
        .query(`
          SELECT TOP 20 ID, Brand_Name, Generic_Name, Strength, Route, Stocks, Cost_Per_30_USD
          FROM dbo.drug_inventory
          WHERE Brand_Name LIKE @q OR Generic_Name LIKE @q
          ORDER BY Generic_Name, Strength ASC
        `);
      sendJSON(res, 200, { drugs: result.recordset });
    } catch (err) {
      console.error('❌ drug search error:', err.message);
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── GET IP prescriptions ────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/ip-prescriptions/')) {
    const ipNo = decodeURIComponent(req.url.split('/api/ip-prescriptions/')[1]);
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('ipNo', sql.VarChar, ipNo)
        .query(`SELECT ID, IP_No, Brand_Name, Generic_Name, Strength, Route, Frequency, Days, Added_On
                FROM dbo.ip_prescriptions WHERE IP_No = @ipNo ORDER BY ID ASC`);
      sendJSON(res, 200, { prescriptions: result.recordset });
    } catch (err) {
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── POST save IP prescription ───────────────────────────────
  if (req.method === 'POST' && req.url === '/api/ip-prescriptions') {
    const { ipNo, brand, generic, strength, route, frequency, days } = await getBody(req);
    if (!ipNo || !generic) return sendJSON(res, 400, { message: 'IP_No and Generic Name required.' });
    try {
      const pool = await patientsPoolPromise;
      await pool.request()
        .input('ipNo',      sql.VarChar, ipNo)
        .input('brand',     sql.VarChar, brand     || '')
        .input('generic',   sql.VarChar, generic)
        .input('strength',  sql.VarChar, strength  || '')
        .input('route',     sql.VarChar, route     || '')
        .input('frequency', sql.VarChar, frequency || '')
        .input('days',      sql.VarChar, days      || '')
        .query(`INSERT INTO dbo.ip_prescriptions (IP_No, Brand_Name, Generic_Name, Strength, Route, Frequency, Days)
                VALUES (@ipNo, @brand, @generic, @strength, @route, @frequency, @days)`);
      sendJSON(res, 201, { message: 'IP prescription saved.' });
    } catch (err) {
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── Update IP prescription ──────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/ip-prescriptions/update') {
    const { id, route, frequency, days } = await getBody(req);
    try {
      const pool = await patientsPoolPromise;
      await pool.request()
        .input('id',        sql.Int,     id)
        .input('route',     sql.VarChar, route     || '')
        .input('frequency', sql.VarChar, frequency || '')
        .input('days',      sql.VarChar, days      || '')
        .query(`UPDATE dbo.ip_prescriptions SET Route=@route, Frequency=@frequency, Days=@days WHERE ID=@id`);
      sendJSON(res, 200, { message: 'Updated.' });
    } catch (err) {
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── DELETE IP prescription ──────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/ip-prescriptions/delete') {
    const { id } = await getBody(req);
    try {
      const pool = await patientsPoolPromise;
      await pool.request()
        .input('id', sql.Int, id)
        .query(`DELETE FROM dbo.ip_prescriptions WHERE ID = @id`);
      sendJSON(res, 200, { message: 'Deleted.' });
    } catch (err) {
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── GET OP prescriptions ────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/op-prescriptions/')) {
    const opNo = decodeURIComponent(req.url.split('/api/op-prescriptions/')[1]);
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('opNo', sql.VarChar, opNo)
        .query(`SELECT ID, OP_No, Brand_Name, Generic_Name, Strength, Route, Frequency, Days, Added_On
                FROM dbo.op_prescriptions WHERE OP_No = @opNo ORDER BY ID ASC`);
      sendJSON(res, 200, { prescriptions: result.recordset });
    } catch (err) {
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── POST save OP prescription ───────────────────────────────
  if (req.method === 'POST' && req.url === '/api/op-prescriptions') {
    const { opNo, brand, generic, strength, route, frequency, days } = await getBody(req);
    if (!opNo || !generic) return sendJSON(res, 400, { message: 'OP_No and Generic Name required.' });
    try {
      const pool = await patientsPoolPromise;
      await pool.request()
        .input('opNo',      sql.VarChar, opNo)
        .input('brand',     sql.VarChar, brand     || '')
        .input('generic',   sql.VarChar, generic)
        .input('strength',  sql.VarChar, strength  || '')
        .input('route',     sql.VarChar, route     || '')
        .input('frequency', sql.VarChar, frequency || '')
        .input('days',      sql.VarChar, days      || '')
        .query(`INSERT INTO dbo.op_prescriptions (OP_No, Brand_Name, Generic_Name, Strength, Route, Frequency, Days)
                VALUES (@opNo, @brand, @generic, @strength, @route, @frequency, @days)`);
      sendJSON(res, 201, { message: 'OP prescription saved.' });
    } catch (err) {
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── Update OP prescription ──────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/op-prescriptions/update') {
    const { id, route, frequency, days } = await getBody(req);
    try {
      const pool = await patientsPoolPromise;
      await pool.request()
        .input('id',        sql.Int,     id)
        .input('route',     sql.VarChar, route     || '')
        .input('frequency', sql.VarChar, frequency || '')
        .input('days',      sql.VarChar, days      || '')
        .query(`UPDATE dbo.op_prescriptions SET Route=@route, Frequency=@frequency, Days=@days WHERE ID=@id`);
      sendJSON(res, 200, { message: 'Updated.' });
    } catch (err) {
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── DELETE OP prescription ──────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/op-prescriptions/delete') {
    const { id } = await getBody(req);
    try {
      const pool = await patientsPoolPromise;
      await pool.request()
        .input('id', sql.Int, id)
        .query(`DELETE FROM dbo.op_prescriptions WHERE ID = @id`);
      sendJSON(res, 200, { message: 'Deleted.' });
    } catch (err) {
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── GET IP prescription notes ───────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/ip-prescription-notes/')) {
    const ipNo = decodeURIComponent(req.url.split('/api/ip-prescription-notes/')[1]);
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('ipNo', sql.VarChar, ipNo)
        .query(`SELECT ID, IP_No, Notes, Added_On
                FROM dbo.ip_prescription_notes
                WHERE IP_No = @ipNo ORDER BY Added_On DESC`);
      sendJSON(res, 200, { notes: result.recordset });
    } catch (err) {
      console.error('❌ ip-prescription-notes fetch error:', err.message);
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── POST save IP prescription note ──────────────────────────
  if (req.method === 'POST' && req.url === '/api/ip-prescription-notes') {
    const { ipNo, notes } = await getBody(req);
    if (!ipNo || !notes) return sendJSON(res, 400, { message: 'IP_No and notes required.' });
    try {
      const pool = await patientsPoolPromise;
      await pool.request()
        .input('ipNo',  sql.VarChar,  ipNo)
        .input('notes', sql.NVarChar, notes)
        .query(`INSERT INTO dbo.ip_prescription_notes (IP_No, Notes) VALUES (@ipNo, @notes)`);
      sendJSON(res, 201, { message: 'IP note saved.' });
    } catch (err) {
      console.error('❌ ip-prescription-notes save error:', err.message);
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── GET OP prescription notes ───────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/op-prescription-notes/')) {
    const opNo = decodeURIComponent(req.url.split('/api/op-prescription-notes/')[1]);
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request()
        .input('opNo', sql.VarChar, opNo)
        .query(`SELECT ID, OP_No, Notes, Added_On
                FROM dbo.op_prescription_notes
                WHERE OP_No = @opNo ORDER BY Added_On DESC`);
      sendJSON(res, 200, { notes: result.recordset });
    } catch (err) {
      console.error('❌ op-prescription-notes fetch error:', err.message);
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── POST save OP prescription note ──────────────────────────
  if (req.method === 'POST' && req.url === '/api/op-prescription-notes') {
    const { opNo, notes } = await getBody(req);
    if (!opNo || !notes) return sendJSON(res, 400, { message: 'OP_No and notes required.' });
    try {
      const pool = await patientsPoolPromise;
      await pool.request()
        .input('opNo',  sql.VarChar,  opNo)
        .input('notes', sql.NVarChar, notes)
        .query(`INSERT INTO dbo.op_prescription_notes (OP_No, Notes) VALUES (@opNo, @notes)`);
      sendJSON(res, 201, { message: 'OP note saved.' });
    } catch (err) {
      console.error('❌ op-prescription-notes save error:', err.message);
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── UPDATE IP prescription note ─────────────────────────────
  if (req.method === 'POST' && req.url === '/api/ip-prescription-notes/update') {
    const { id, notes } = await getBody(req);
    if (!id || !notes) return sendJSON(res, 400, { message: 'ID and notes required.' });
    try {
      const pool = await patientsPoolPromise;
      await pool.request()
        .input('id',    sql.Int,      id)
        .input('notes', sql.NVarChar, notes)
        .query(`UPDATE dbo.ip_prescription_notes SET Notes=@notes WHERE ID=@id`);
      sendJSON(res, 200, { message: 'IP note updated.' });
    } catch (err) {
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── DELETE IP prescription note ─────────────────────────────
  if (req.method === 'POST' && req.url === '/api/ip-prescription-notes/delete') {
    const { id } = await getBody(req);
    try {
      const pool = await patientsPoolPromise;
      await pool.request()
        .input('id', sql.Int, id)
        .query(`DELETE FROM dbo.ip_prescription_notes WHERE ID=@id`);
      sendJSON(res, 200, { message: 'IP note deleted.' });
    } catch (err) {
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── UPDATE OP prescription note ─────────────────────────────
  if (req.method === 'POST' && req.url === '/api/op-prescription-notes/update') {
    const { id, notes } = await getBody(req);
    if (!id || !notes) return sendJSON(res, 400, { message: 'ID and notes required.' });
    try {
      const pool = await patientsPoolPromise;
      await pool.request()
        .input('id',    sql.Int,      id)
        .input('notes', sql.NVarChar, notes)
        .query(`UPDATE dbo.op_prescription_notes SET Notes=@notes WHERE ID=@id`);
      sendJSON(res, 200, { message: 'OP note updated.' });
    } catch (err) {
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── DELETE OP prescription note ─────────────────────────────
  if (req.method === 'POST' && req.url === '/api/op-prescription-notes/delete') {
    const { id } = await getBody(req);
    try {
      const pool = await patientsPoolPromise;
      await pool.request()
        .input('id', sql.Int, id)
        .query(`DELETE FROM dbo.op_prescription_notes WHERE ID=@id`);
      sendJSON(res, 200, { message: 'OP note deleted.' });
    } catch (err) {
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── 404 ─────────────────────────────────────────────────────
  sendJSON(res, 404, { message: 'Route not found' });
});

server.listen(8080, () => console.log('🚀 Server running on http://localhost:8080'));