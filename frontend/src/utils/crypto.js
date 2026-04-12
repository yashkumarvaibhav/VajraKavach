/**
 * VajraKavach — Client-side E2E Encryption Utilities
 * Uses Web Crypto API for hybrid RSA-OAEP + AES-GCM encryption.
 *
 * Flow:
 *  Encrypt: Generate random AES-256 key → encrypt message with AES-GCM →
 *           encrypt AES key with recipient's RSA public key → combine.
 *  Decrypt: Split combined payload → decrypt AES key with own RSA private key →
 *           decrypt message with AES-GCM.
 */

/**
 * Convert a PEM string to an ArrayBuffer (strips headers, decodes base64).
 */
function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s/g, '');
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

/**
 * Import an RSA public key from PEM for encryption.
 */
async function importPublicKey(pem) {
  const keyData = pemToArrayBuffer(pem);
  return crypto.subtle.importKey(
    'spki',
    keyData,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
}

/**
 * Import an RSA private key from PEM for signing (RSA-PSS).
 */
async function importPrivateKeyForSigning(pem) {
  const keyData = pemToArrayBuffer(pem);
  return crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSA-PSS', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

/**
 * Sign a plaintext message with the sender's RSA private key (RSA-PSS SHA-256).
 * Returns a base64-encoded signature.
 */
export async function signMessage(plaintext, privateKeyPem) {
  const key = await importPrivateKeyForSigning(privateKeyPem);
  const encoded = new TextEncoder().encode(plaintext);
  const sig = await crypto.subtle.sign(
    { name: 'RSA-PSS', saltLength: 32 },
    key,
    encoded
  );
  let binary = '';
  const bytes = new Uint8Array(sig);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Import an RSA private key from PEM for decryption.
 */
async function importPrivateKey(pem) {
  const keyData = pemToArrayBuffer(pem);
  return crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  );
}

/**
 * Encrypt plaintext for a single user using hybrid encryption.
 */
async function encryptForKey(text, pubKeyPem) {
  // 1. Generate random AES-256 key
  const aesKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt']
  );

  // 2. Encrypt plaintext with AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoded
  );

  // 3. Export AES key and encrypt with RSA public key
  const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);
  const rsaKey = await importPublicKey(pubKeyPem);
  const encryptedAesKey = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    rsaKey,
    rawAesKey
  );

  // 4. Combine: [2-byte encryptedKeyLength][encryptedAESKey][12-byte IV][AES ciphertext]
  const keyLenBuf = new Uint8Array(2);
  keyLenBuf[0] = (encryptedAesKey.byteLength >> 8) & 0xff;
  keyLenBuf[1] = encryptedAesKey.byteLength & 0xff;

  const combined = new Uint8Array(
    2 + encryptedAesKey.byteLength + 12 + ciphertext.byteLength
  );
  combined.set(keyLenBuf, 0);
  combined.set(new Uint8Array(encryptedAesKey), 2);
  combined.set(iv, 2 + encryptedAesKey.byteLength);
  combined.set(new Uint8Array(ciphertext), 2 + encryptedAesKey.byteLength + 12);

  let binary = '';
  for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]);
  return btoa(binary);
}

/**
 * Encrypt a plaintext message using hybrid encryption (AES-256-GCM + RSA-OAEP).
 * Encrypts for BOTH sender and recipient so both can decrypt from server.
 *
 * @param {string} plaintext - The message to encrypt
 * @param {string} recipientPublicKeyPem - Recipient's RSA public key in PEM format
 * @param {string} senderPublicKeyPem - Sender's own RSA public key in PEM format
 * @returns {string} JSON payload: E2E:{"s":"<for_sender>","r":"<for_recipient>"}
 */
export async function encryptMessage(plaintext, recipientPublicKeyPem, senderPublicKeyPem) {
  const forRecipient = await encryptForKey(plaintext, recipientPublicKeyPem);
  const forSender = senderPublicKeyPem
    ? await encryptForKey(plaintext, senderPublicKeyPem)
    : null;

  return 'E2E:' + JSON.stringify({ s: forSender, r: forRecipient });
}

/**
 * Encrypt a message for every participant in a small group conversation.
 *
 * @param {string} plaintext
 * @param {Record<string, string>} recipientPublicKeysByUserId - { userId: publicKeyPem }
 * @returns {string} JSON payload: E2EG:{"<user_id>":"<blob>"}
 */
export async function encryptGroupMessage(plaintext, recipientPublicKeysByUserId) {
  const entries = Object.entries(recipientPublicKeysByUserId || {}).filter(([, pubKeyPem]) => !!pubKeyPem);
  if (entries.length === 0) {
    throw new Error('No recipient public keys available for group encryption');
  }

  const encryptedEntries = await Promise.all(
    entries.map(async ([userId, pubKeyPem]) => [userId, await encryptForKey(plaintext, pubKeyPem)])
  );

  return 'E2EG:' + JSON.stringify(Object.fromEntries(encryptedEntries));
}

/**
 * Decrypt a single hybrid-encrypted blob (base64 of [keyLen][encKey][iv][ciphertext]).
 */
async function decryptBlob(base64Payload, privateKeyPem) {
  const binary = atob(base64Payload);
  const data = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);

  const keyLen = (data[0] << 8) | data[1];
  const encryptedAesKey = data.slice(2, 2 + keyLen);
  const iv = data.slice(2 + keyLen, 2 + keyLen + 12);
  const ciphertext = data.slice(2 + keyLen + 12);

  const rsaKey = await importPrivateKey(privateKeyPem);
  const rawAesKey = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    rsaKey,
    encryptedAesKey
  );

  const aesKey = await crypto.subtle.importKey(
    'raw',
    rawAesKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertext
  );

  return new TextDecoder().decode(plainBuf);
}

/**
 * Decrypt an E2E encrypted message.
 *
 * @param {string} payload - The stored ciphertext (E2E:{...} format)
 * @param {string} privateKeyPem - User's RSA private key
 * @param {boolean} isSender - Whether the current user is the sender
 * @param {string} userId - Current user id, required for group payloads
 * @returns {string} Decrypted plaintext
 */
export async function decryptMessage(payload, privateKeyPem, isSender, userId) {
  if (payload.startsWith('E2E:')) {
    const json = JSON.parse(payload.slice(4));
    const blob = isSender ? json.s : json.r;
    if (!blob) throw new Error('No encrypted blob for this role');
    return await decryptBlob(blob, privateKeyPem);
  }
  if (payload.startsWith('E2EG:')) {
    const json = JSON.parse(payload.slice(5));
    const blob = json?.[userId];
    if (!blob) throw new Error('No encrypted blob for this user');
    return await decryptBlob(blob, privateKeyPem);
  }
  // Legacy single-blob format fallback
  return await decryptBlob(payload, privateKeyPem);
}

/**
 * Check if a string is an E2E encrypted payload.
 */
export function isEncryptedPayload(text) {
  if (!text) return false;
  return text.startsWith('E2E:') || text.startsWith('E2EG:');
}
