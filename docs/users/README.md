# Users — Danh sách người duyệt và luồng duyệt

Tạo file `users.md` (hoặc `users.xlsx`) trong folder này với cấu trúc:

## Mẫu

```markdown
## Manager (Quản lý duyệt bước 1)

| Họ tên       | Email M365            | Telegram username | Phòng/ban quản lý |
|--------------|-----------------------|-------------------|--------------------|
| Nguyễn Văn A | a.nguyen@avpg.com     | @anguyen_tg       | Marketing, Sales   |
| Trần Thị B   | b.tran@avpg.com       | @btran_tg         | KSNB               |

## BOD (Ban giám đốc duyệt bước 2)

| Họ tên       | Email M365            | Telegram username | Điều kiện duyệt          |
|--------------|-----------------------|-------------------|---------------------------|
| Lê Văn C     | c.le@avpg.com         | @cle_tg           | Mọi phiếu                 |
| Phạm Văn D   | d.pham@avpg.com       | @dpham_tg         | Phiếu > 50 triệu          |

## KSNB (Người fill thông tin bước cuối)

| Họ tên       | Email M365            | Telegram username |
|--------------|-----------------------|-------------------|
| Phạm Thị E   | e.pham@avpg.com       | @epham_tg         |
```

## Logic phức tạp?

Nếu luồng duyệt có rule đặc biệt (vd: > X triệu thì cần thêm CEO duyệt; phòng ban này gửi qua Manager này...), mô tả bằng văn xuôi trong cùng file.
