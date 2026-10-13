/**
 * MVP：不做额外加密，原样读写（依赖数据库与部署环境隔离）。
 * 字段名仍沿用 *Enc / encrypted*，仅为兼容现有 schema。
 */

export function encrypt(plaintext: string, _keyVersion = 1): string {
  return plaintext;
}

export function decrypt(blob: string): string {
  return blob;
}

export function maskSecret(secret: string): string {
  if (secret.length <= 8) return "****";
  return `${secret.slice(0, 10)}...${secret.slice(-4)}`;
}
