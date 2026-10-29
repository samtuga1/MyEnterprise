// Local prototype password comparison only. PHP must replace this with server authentication.
const iterations = 100000;
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const bytes = value => Uint8Array.from(value.match(/.{2}/g), x => parseInt(x, 16));
export function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128)
    throw new Error('Use a password between 8 and 128 characters.');
  return value;
}
async function derive(password, salt, rounds) {
  if (!globalThis.crypto?.subtle) throw new Error('Password sign-in requires a current browser on localhost or HTTPS.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:bytes(salt),iterations:rounds,hash:'SHA-256'},key,256)));
}
export async function createCredential(password) {
  validatePassword(password);
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return {salt, hash:await derive(password,salt,iterations), iterations};
}
export async function verifyPassword(password, credential) {
  if (typeof password !== 'string' || !password.length || password.length > 128 ||
      !credential || !/^[a-f0-9]{32}$/.test(credential.salt) ||
      !/^[a-f0-9]{64}$/.test(credential.hash) || credential.iterations !== iterations) return false;
  return await derive(password,credential.salt,credential.iterations) === credential.hash;
}
