// HTTP errors — throw trong route, middleware catch chung.
export class HttpError extends Error {
  override name = 'HttpError';
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const badRequest = (msg: string, code?: string) => new HttpError(400, msg, code);
export const unauthorized = (msg = 'Chưa đăng nhập') => new HttpError(401, msg, 'unauthorized');
export const forbidden = (msg = 'Không có quyền') => new HttpError(403, msg, 'forbidden');
export const notFound = (msg = 'Không tìm thấy') => new HttpError(404, msg, 'not_found');
export const conflict = (msg: string) => new HttpError(409, msg, 'conflict');
export const unprocessable = (msg: string, code?: string) => new HttpError(422, msg, code);
