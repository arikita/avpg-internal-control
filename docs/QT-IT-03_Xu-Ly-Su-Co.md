# QUY TRÌNH XỬ LÝ SỰ CỐ IT

| | |
|---|---|
| **Mã hiệu:** | QT-IT-03 |
| **Lần ban hành/Sửa đổi:** | 00 |
| **Ngày hiệu lực:** | __/__/____ |
| **Tổng số trang:** | 5 |

| Trách nhiệm | Soạn thảo bởi | Kiểm tra bởi | Phê duyệt 1 | Phê duyệt 2 |
|---|---|---|---|---|
| **Chữ ký** | | | | |
| **Họ tên** | | | | |
| **Ngày** | | | | |
| **Chức vụ** | Trưởng phòng IT | Phó phòng KSNB | COO | CEO |

---

## THEO DÕI SỬA ĐỔI TÀI LIỆU

| STT | Mục sửa đổi / Trang sửa | Mô tả nội dung sửa đổi | Lần sửa đổi | Ngày sửa đổi |
|---|---|---|---|---|
| 1 | N/A | Ban hành lần đầu | 00 | __/__/____ |

> *Ghi chú:*
> 1. Cá nhân liên quan phải đọc, hiểu và thực hiện theo đúng quy định của Quy trình này.
> 2. Nội dung trong quy trình này có hiệu lực áp dụng như sự chỉ đạo của Ban lãnh đạo.
> 3. Bộ phận được phân phối chỉ được nhận duy nhất 01 bản (có đóng dấu kiểm soát); các bản sao hoặc bản lỗi thời phải được loại bỏ ngay, tuyệt đối không được sử dụng.

---

## 1. MỤC ĐÍCH

Quy trình này nhằm thiết lập trình tự tiếp nhận, phân loại, xử lý và đóng sự cố IT, đảm bảo sự cố được giải quyết nhanh chóng, đúng mức ưu tiên, hạn chế ảnh hưởng đến hoạt động sản xuất – kinh doanh và xây dựng cơ sở tri thức (knowledge base) cho các sự cố lặp lại.

## 2. PHẠM VI

Áp dụng đối với tất cả các Phòng ban / Bộ phận / Nhà máy của **CÔNG TY TNHH MTV NĂNG LƯỢNG AN VIỆT PHÁT** (AVP GROUP), sau đây gọi tắt là AVP GROUP.

## 3. TÀI LIỆU LIÊN QUAN

| Mã hiệu | Tên tài liệu |
|---|---|
| ISO 9001:2015 | Tiêu chuẩn ISO 9001:2015 |
| ISO 27001 | Hệ thống quản lý an toàn thông tin |
| AVPG-ISO-P1 | Quy trình Kiểm soát Văn bản |
| QT-IT-01 | Quy trình Thay Thế Thiết Bị IT |

## 4. ĐỊNH NGHĨA

### 4.1 Định nghĩa

- **Sự cố IT (Incident):** Bất kỳ sự kiện nào làm gián đoạn hoặc làm giảm chất lượng dịch vụ IT của Công ty.
- **Mức độ ưu tiên (Priority):**
  - **P1 – Critical:** Dịch vụ ngừng hoàn toàn, ảnh hưởng toàn Công ty hoặc hệ thống trọng yếu.
  - **P2 – High:** Ảnh hưởng nhiều người dùng / một phòng ban / dịch vụ quan trọng.
  - **P3 – Medium:** Ảnh hưởng một vài người dùng, có thể chờ xử lý theo lịch.
  - **P4 – Low:** Yêu cầu nhỏ lẻ, không ảnh hưởng vận hành.
- **Level 1:** Hỗ trợ tuyến đầu (tiếp nhận, chẩn đoán cơ bản, xử lý sự cố phổ biến).
- **Level 2:** Hỗ trợ chuyên sâu (cấu hình hệ thống, máy chủ, mạng, phối hợp NCC).
- **Workaround:** Giải pháp tạm thời để khôi phục dịch vụ trong khi tìm giải pháp dứt điểm.

### 4.2 Các từ viết tắt

| Viết tắt | Ý nghĩa |
|---|---|
| IT – *Information Technology* | Phòng Công nghệ Thông tin |
| KSNB / IC – *Internal Control* | Phòng Kiểm soát Nội bộ |
| NCC | Nhà cung cấp |
| SLA – *Service Level Agreement* | Cam kết mức dịch vụ |
| KB – *Knowledge Base* | Cơ sở tri thức |
| L1 / L2 | Level 1 / Level 2 |
| OK / NG | Đạt / Không đạt |

---

## 5. NỘI DUNG

### 5.1 Lưu đồ

| STT | Biểu đồ | Diễn giải | Trách nhiệm | Biểu mẫu |
|---|---|---|---|---|
| 1 | Tiếp nhận thông báo sự cố | 6.1.1 | IT (L1) | Spiceworks |
| 2 | Ghi ticket | 6.1.2 | IT (L1) | Spiceworks |
| 3 | Phân loại mức độ ưu tiên (P1–P4) | 6.1.3 | IT (L1) | Spiceworks |
| 4 | Thông báo Trưởng phòng IT & bên liên quan (nếu P1) | 6.1.4 | IT (L1) | – |
| 5 | Chẩn đoán nguyên nhân ban đầu (L1) | 6.1.5 | IT (L1) | Spiceworks |
| 6 | Xử lý sự cố L1 / Escalate L2 / Liên hệ NCC | 6.1.6 | IT (L1/L2), NCC | Spiceworks |
| 7 | Kiểm tra kết quả sau xử lý | 6.1.7 | IT | Spiceworks |
| 8 | Áp dụng Workaround & lên kế hoạch xử lý dứt điểm | 6.1.8 | IT | DS-IT-02 |
| 9 | Xác nhận với người dùng | 6.1.9 | IT, người dùng | Spiceworks |
| 10 | Đóng ticket – ghi nguyên nhân gốc rễ & cách xử lý | 6.1.10 | IT | Spiceworks |
| 11 | Lưu hồ sơ & cập nhật Knowledge Base | 6.1.11 | IT | KB-IT |

---

## 6. DIỄN GIẢI LƯU ĐỒ

### 6.1.1 Tiếp nhận thông báo sự cố

Sự cố được tiếp nhận từ một trong các nguồn:
- **Người dùng báo:** qua Spiceworks / Telegram / điện thoại.
- **Hệ thống monitoring** tự động cảnh báo.
- **IT tự phát hiện** trong quá trình vận hành.

### 6.1.2 Ghi ticket

L1 mở ticket trên **Spiceworks**, ghi: thời gian, người báo, thiết bị/dịch vụ bị ảnh hưởng, triệu chứng.

### 6.1.3 Phân loại mức độ ưu tiên

L1 phân loại theo bốn mức P1–P4 (xem mục 4.1).

### 6.1.4 Thông báo (nếu P1 Critical)

Nếu sự cố thuộc **P1**, L1 phải **thông báo ngay** Trưởng phòng IT và các bên liên quan (BOD, người dùng đầu mối, KSNB) để phối hợp xử lý.

### 6.1.5 Chẩn đoán nguyên nhân ban đầu (L1)

L1 chẩn đoán nguyên nhân ban đầu dựa trên KB và kinh nghiệm.

### 6.1.6 Xử lý sự cố

Phân nhánh theo năng lực:
- **L1 tự xử lý được:** thực hiện và chuyển bước 6.1.7.
- **Không tự xử lý được & không cần NCC:** **escalate lên L2** lên kế hoạch xử lý nội bộ.
- **Cần hỗ trợ NCC:** liên hệ NCC, **ghi nhận SLA** vào ticket.

### 6.1.7 Kiểm tra kết quả sau xử lý

Kiểm tra dịch vụ đã khôi phục hay chưa.
- **OK:** chuyển 6.1.9.
- **NG & chưa thử hết phương án:** quay lại 6.1.5/6.1.6.
- **NG & đã thử tất cả phương án:** sang 6.1.8.

### 6.1.8 Áp dụng Workaround & lên kế hoạch dứt điểm

Áp dụng **giải pháp tạm thời (Workaround)** để khôi phục dịch vụ; ghi vào **Danh Sách Sự Cố Đang Mở (DS-IT-02)** và lên kế hoạch xử lý dứt điểm.

### 6.1.9 Xác nhận với người dùng

Người dùng xác nhận dịch vụ đã hoạt động bình thường.
- Nếu **NG:** quay lại 6.1.5.
- Nếu **OK:** chuyển 6.1.10.

### 6.1.10 Đóng ticket

Cập nhật ticket Spiceworks – trạng thái **ĐÓNG**, ghi rõ **nguyên nhân gốc rễ** và **cách xử lý**.

### 6.1.11 Lưu hồ sơ & cập nhật Knowledge Base

IT lưu hồ sơ sự cố, cập nhật **Knowledge Base** để các trường hợp tương tự sau xử lý nhanh hơn.

---

## 7. TRÁCH NHIỆM

- Tất cả các cá nhân, phòng ban thuộc AVP GROUP có trách nhiệm thông báo sự cố kịp thời và phối hợp với IT trong quá trình xử lý.
- Trưởng phòng IT chịu trách nhiệm phân công, giám sát và phê duyệt xử lý sự cố P1.
- Trưởng phòng ban hành quy trình có trách nhiệm cập nhật và ban hành quy trình khi cần thiết hoặc có sự thay đổi.

## 8. HIỆU LỰC THỰC HIỆN

Quy trình này có hiệu lực từ ngày ký và thay thế những quy trình đã được ban hành trước đây (nếu có).

---

## 9. PHỤ LỤC

| STT | Ký hiệu | Tên phụ lục |
|---|---|---|
| 1 | DS-IT-02 | Danh Sách Sự Cố Đang Mở |
| 2 | KB-IT | Knowledge Base – Hệ thống Tri thức IT |
| 3 | Spiceworks | Hệ thống quản lý ticket IT |
