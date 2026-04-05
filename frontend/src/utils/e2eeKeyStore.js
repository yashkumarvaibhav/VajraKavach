const DB_NAME = 'vajrakavach_secure_storage';
const STORE_NAME = 'e2ee_keys';
const DB_VERSION = 1;
const PBKDF2_ITERATIONS = 250000;
const SESSION_PREFIX = 'vajrakavach_session_e2ee_';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function formatPem(label, buffer) {
  const base64 = arrayBufferToBase64(buffer);
  const lines = base64.match(/.{1,64}/g) || [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

async function openKeyStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'email' });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore(mode, executor) {
  const db = await openKeyStore();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    executor(store, resolve, reject);
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => db.close();
  });
}

async function deriveEncryptionKey(password, salt) {
  const passwordBytes = new TextEncoder().encode(password);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptPrivateKey(privateKeyPem, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveEncryptionKey(password, salt);
  const plaintext = new TextEncoder().encode(privateKeyPem);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  return {
    version: 1,
    salt: arrayBufferToBase64(salt.buffer),
    iv: arrayBufferToBase64(iv.buffer),
    ciphertext: arrayBufferToBase64(ciphertext),
  };
}

async function decryptPrivateKey(record, password) {
  const salt = new Uint8Array(base64ToArrayBuffer(record.salt));
  const iv = new Uint8Array(base64ToArrayBuffer(record.iv));
  const ciphertext = base64ToArrayBuffer(record.ciphertext);
  const key = await deriveEncryptionKey(password, salt);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

function sessionKey(email) {
  return `${SESSION_PREFIX}${normalizeEmail(email)}`;
}

export async function generateRsaKeyPairPem() {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );

  const [publicKey, privateKey] = await Promise.all([
    crypto.subtle.exportKey('spki', keyPair.publicKey),
    crypto.subtle.exportKey('pkcs8', keyPair.privateKey),
  ]);

  return {
    publicKeyPem: formatPem('PUBLIC KEY', publicKey),
    privateKeyPem: formatPem('PRIVATE KEY', privateKey),
  };
}

export async function storeLocalE2EEKeyPair(email, publicKeyPem, privateKeyPem, password) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !publicKeyPem || !privateKeyPem || !password) {
    throw new Error('Email, password, and E2EE key pair are required');
  }

  const encryptedPrivateKey = await encryptPrivateKey(privateKeyPem, password);
  await withStore('readwrite', (store, resolve, reject) => {
    const request = store.put({
      email: normalizedEmail,
      publicKeyPem,
      encryptedPrivateKey,
    });
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

export async function loadLocalE2EEKeyPair(email, password) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) {
    return null;
  }

  const record = await withStore('readonly', (store, resolve, reject) => {
    const request = store.get(normalizedEmail);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });

  if (!record?.encryptedPrivateKey) {
    return null;
  }

  const privateKeyPem = await decryptPrivateKey(record.encryptedPrivateKey, password);
  return {
    publicKeyPem: record.publicKeyPem || null,
    privateKeyPem,
  };
}

export async function deleteLocalE2EEKeyPair(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return;
  }

  await withStore('readwrite', (store, resolve, reject) => {
    const request = store.delete(normalizedEmail);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

export function setSessionE2EEKeyPair(email, keyPair) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !keyPair?.privateKeyPem) {
    return;
  }
  sessionStorage.setItem(sessionKey(normalizedEmail), JSON.stringify(keyPair));
}

export function getSessionE2EEKeyPair(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const raw = sessionStorage.getItem(sessionKey(normalizedEmail));
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSessionE2EEKeyPair(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return;
  }
  sessionStorage.removeItem(sessionKey(normalizedEmail));
}

/**
 * Export the current key pair as a downloadable .vkkey JSON file.
 * The file is NOT password-protected — the user should keep it safe.
 */
export function exportKeyPairToFile(email) {
  const keyPair = getSessionE2EEKeyPair(email);
  if (!keyPair?.privateKeyPem) {
    throw new Error('No decrypted key pair available in this session. Sign in first.');
  }

  const payload = {
    version: 1,
    format: 'vajrakavach-e2ee-keypair',
    email: normalizeEmail(email),
    publicKeyPem: keyPair.publicKeyPem,
    privateKeyPem: keyPair.privateKeyPem,
    exportedAt: new Date().toISOString(),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vajrakavach-keys-${normalizeEmail(email).replace(/[@.]/g, '_')}.vkkey`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import a key pair from a .vkkey file and store it locally.
 * Returns the imported key pair on success.
 */
export async function importKeyPairFromFile(file, email, password) {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('Invalid key file — could not parse JSON.');
  }

  if (payload.format !== 'vajrakavach-e2ee-keypair' || !payload.privateKeyPem || !payload.publicKeyPem) {
    throw new Error('Invalid key file format. Please select a valid .vkkey file.');
  }

  // Validate the PEM structure
  if (!payload.privateKeyPem.includes('-----BEGIN PRIVATE KEY-----') ||
      !payload.publicKeyPem.includes('-----BEGIN PUBLIC KEY-----')) {
    throw new Error('Key file contains invalid key data.');
  }

  const normalizedEmail = normalizeEmail(email);

  // Store in IndexedDB (encrypted with user's password)
  await storeLocalE2EEKeyPair(normalizedEmail, payload.publicKeyPem, payload.privateKeyPem, password);

  // Also set in session for immediate use
  const keyPair = { publicKeyPem: payload.publicKeyPem, privateKeyPem: payload.privateKeyPem };
  setSessionE2EEKeyPair(normalizedEmail, keyPair);

  return keyPair;
}
