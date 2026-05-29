// Object layer cho file đính kèm — filesystem-backed, CHỈ runtime Node.
// File thật = UPLOAD_DIR/<uuid>; tên = UUID nên không có path do user kiểm soát.
// Chỉ import từ src/lib/node-env.ts để node:fs/crypto KHÔNG lọt vào bundle Workers.

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import type { FileStore } from '../types';

// Phòng thủ: storage_key luôn là UUID do server sinh, nhưng chặn cứng mọi ký tự path
// để dù key có bị bẩn cũng không thoát khỏi thư mục lưu trữ.
function safeKey(key: string): string {
  if (!/^[0-9a-fA-F-]{36}$/.test(key)) throw new Error('storage key không hợp lệ');
  return key;
}

export function createFileStore(dir: string): FileStore {
  let ensured = false;
  const ensureDir = async (): Promise<void> => {
    if (!ensured) {
      await mkdir(dir, { recursive: true });
      ensured = true;
    }
  };
  return {
    async put(bytes) {
      await ensureDir();
      const key = randomUUID();
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      await writeFile(join(dir, key), bytes, { flag: 'wx' });
      return { key, sha256, size: bytes.byteLength };
    },
    async get(key) {
      try {
        return await readFile(join(dir, safeKey(key)));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw e;
      }
    },
    async delete(key) {
      try {
        await unlink(join(dir, safeKey(key)));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    },
  };
}
