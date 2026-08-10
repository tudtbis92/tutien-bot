# Phase 5: Self-bot Infrastructure & Core Loop

## Core Objective
Xây dựng nền tảng hạ tầng (Infrastructure) cho dịch vụ OwO Farming: một Master-Worker Pool có khả năng quản lý hàng trăm tài khoản self-bot ổn định, đồng thời đảm bảo an toàn tuyệt đối cho token của người dùng thông qua mã hóa và luồng nhập (provisioning) bảo mật.

## Target Requirements
- **FARM-01**: User có thể cung cấp Discord Token để sử dụng dịch vụ self-bot. Token phải được mã hóa an toàn khi lưu trữ.
- **FARM-06**: Hệ thống Batched Worker Pool (Master - Worker) để quản lý hàng trăm process tự động một cách tối ưu.

## Locked Decisions (Gray Areas Resolved)

### 1. Master-Worker Architecture (FARM-06)
- **Phương thức giao tiếp**: Sử dụng native **Node.js IPC (`child_process.fork`)**.
- **Lý do**: Triển khai trên môi trường single-node (Oracle VM) với `discord.js-selfbot-v13`. IPC là giải pháp đơn giản, hiệu năng cao nhất để Master quản lý vòng đời (spawn, kill, restart) và giao tiếp hai chiều với các Worker mà không cần thêm phụ thuộc ngoại vi như Redis Pub/Sub.

### 2. Process Isolation & Batching (FARM-06)
- **Batch Size**: **100 self-bots / Worker Process**.
- **Lý do**: Dựa trên cấu hình server 4 CPUs / 24GB RAM. ~100 tokens tiêu tốn khoảng ~600MB RAM mỗi Worker. Con số này tạo sự cân bằng tối ưu: giảm thiểu memory overhead của V8 engine so với việc chạy quá ít bot/process, đồng thời giới hạn "vùng ảnh hưởng" (blast radius) nếu một Worker bị crash do unhandled exception.

### 3. Token Security & Encryption (FARM-01)
- **Thuật toán**: **AES-256-GCM** (sử dụng `node:crypto`).
- **Quản lý Key & Rotation**: Hỗ trợ Key Rotation (xoay vòng khóa) ngay từ Day 1.
  - Sử dụng biến môi trường lưu trữ nhiều key (VD: `FARM_ENCRYPTION_KEYS='{"1":"key1_hex", "2":"key2_hex"}'`) và chỉ định `ACTIVE_FARM_KEY_VERSION="2"`.
  - Database schema (`farming_accounts`) sẽ có cột `key_version` để biết token đang được mã hóa bằng version nào.
  - Sẽ có logic (script/command) để migrate (decrypt bằng old key -> encrypt bằng active key) khi cần đổi khóa.

### 4. Token Provisioning UX (FARM-01)
Luồng nhập token của người dùng được thiết kế tối ưu qua Message Component và Modal để đảm bảo tính an toàn và tiện lợi:
1. **Admin Trigger**: Admin sử dụng command để spawn một "Service Message" cố định (thường đặt ở channel mua dịch vụ). Message này chứa một nút **"Start"**.
2. **User Interaction**:
   - Khi User click "Start", bot thực hiện chuỗi kiểm tra âm thầm:
     a. Kiểm tra quyền truy cập (User đã đăng ký/thanh toán dịch vụ chưa?).
     b. Kiểm tra sự tồn tại của token trên DB.
     c. Nếu có, kiểm tra trạng thái token (còn live không?).
   - **Nhập Token**: Nếu token chưa có hoặc đã chết, bot sẽ hiển thị một **Discord Modal** an toàn để user dán token mới vào.
   - **Xác nhận**: Bot mã hóa lưu DB và gửi thông báo kết quả (ephemeral) cho user.

## Schema Implications
Phase planning cần thiết kế các bảng sau:
- `farming_accounts`: Lưu trữ user_id, encrypted_token, key_version, status (active, invalid, captcha_waiting), worker_id (để track).
- *Lưu ý*: Mặc dù luồng UX có nhắc đến việc kiểm tra "thanh toán", Phase 5 chỉ cần thiết kế stub hoặc bảng `farming_subscriptions` cơ bản để phục vụ luồng check quyền, chi tiết logic thanh toán sẽ nằm ở Phase 7.

## Out of Scope cho Phase 5
- Logic auto-farm OwO (hunt, battle) và detect Captcha (Sẽ làm ở Phase 6).
- Cổng thanh toán nạp/rút Linh Thạch thực tế (Sẽ làm ở Phase 7).
