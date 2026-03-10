
require('dotenv').config();
const { SecretClient } = require('@azure/keyvault-secrets');
const { DefaultAzureCredential } = require('@azure/identity');

const KEY_VAULT_URL = process.env.KEY_VAULT_URL || 'https://vabgenrx-frontend.vault.azure.net/';


const SECRET_MAP = {
  DB_SERVER:                        'DB-SERVER',
  DB_DATABASE:                      'DB-DATABASE',
  DB_USER:                          'DB-USER',
  DB_PASSWORD:                      'DB-PASSWORD',
  DB_PORT:                          'DB-PORT',
  PORT:                             'PORT',
  AZURE_STORAGE_CONNECTION_STRING:  'AZURE-STORAGE-CONNECTION-STRING',
  AZURE_CONTAINER_NAME:             'AZURE-CONTAINER-NAME',
  SMTP_EMAIL:                       'VAB-MAIL',
  SMTP_PASSWORD:                    'VAB-PASSWORD',
};

async function loadSecrets() {
  console.log('🔐 Loading secrets from Azure Key Vault...');
  try {
    const credential = new DefaultAzureCredential();
    const client = new SecretClient(KEY_VAULT_URL, credential);

    for (const [envKey, vaultKey] of Object.entries(SECRET_MAP)) {
      try {
        const secret = await client.getSecret(vaultKey);
        process.env[envKey] = secret.value;
        console.log(`  ✅ Loaded: ${vaultKey}`);
      } catch (err) {
        
        if (process.env[envKey]) {
          console.warn(`  ⚠️  Key Vault miss for '${vaultKey}' — using .env value`);
        } else {
          console.error(`  ❌ Secret '${vaultKey}' not found in Key Vault or .env!`);
        }
      }
    }

    console.log('✅ Secrets loaded successfully.\n');
  } catch (err) {
    console.error('❌ Could not connect to Key Vault:', err.message);
    console.warn('⚠️  Falling back entirely to .env file\n');
  }
}

module.exports = { loadSecrets };