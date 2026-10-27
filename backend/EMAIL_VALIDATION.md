# Kiểm tra email đăng ký

Backend dùng **Email Reputation** trong Abstract Dashboard để kiểm tra email trước khi gửi mã OTP.

1. Trong dashboard Abstract, mở sản phẩm **Email Reputation** và sao chép API key của sản phẩm đó.
2. Thêm key vào `backend/.env.email`:

   ```env
   EMAIL_VALIDATION_API_KEY=your-email-reputation-api-key
   ```

3. Khởi động lại backend.

Backend gọi `https://emailreputation.abstractapi.com/v1/` bằng Bearer token. Chỉ gửi OTP và tự chuyển sang Bước 2 khi API trả `deliverable`, SMTP hợp lệ và không phải miền catch-all. Địa chỉ `undeliverable` báo lỗi ở Bước 1; kết quả `unknown`, catch-all hoặc lỗi API cũng không chuyển bước.

API key chỉ được đọc ở backend. Địa chỉ đăng ký được gửi tới Abstract để kiểm tra. Xem [tài liệu Email Reputation API](https://docs.abstractapi.com/api/email-reputation).
