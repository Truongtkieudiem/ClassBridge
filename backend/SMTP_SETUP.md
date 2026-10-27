# Cấu hình email xác minh

ClassBridge gửi email xác minh từ một tài khoản SMTP của ứng dụng tới địa chỉ email mà mỗi người đăng ký nhập. Người nhận không cần dùng cùng nhà cung cấp với tài khoản gửi.

## Thiết lập với Gmail

1. Chọn một tài khoản Gmail dùng làm địa chỉ gửi chung cho ClassBridge. Nên dùng tài khoản riêng cho ứng dụng.
2. Đăng nhập tài khoản đó và bật Xác minh 2 bước trong phần Bảo mật của Tài khoản Google.
3. Tạo Mật khẩu ứng dụng (App Password) trong phần Bảo mật. Nếu Google không hiển thị mục này, kiểm tra điều kiện hỗ trợ App Password trên tài khoản.
4. Sao chép `backend/.env.email.example` thành `backend/.env.email`.
5. Điền cấu hình Gmail:

   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USERNAME=dia-chi-gmail-gui-thu@gmail.com
   SMTP_PASSWORD=mat-khau-ung-dung-16-ky-tu
   SMTP_FROM=dia-chi-gmail-gui-thu@gmail.com
   SMTP_USE_TLS=true
   ```

   Dùng App Password, không dùng mật khẩu đăng nhập Gmail. `SMTP_FROM` nên là địa chỉ gửi ở `SMTP_USERNAME`.
6. Lưu file và khởi động lại backend.
7. Thử đăng ký bằng một email bạn có thể truy cập. Kiểm tra cả thư mục Spam/Junk nếu chưa thấy thư.

## Nhà cung cấp SMTP khác

Lấy từ trang quản trị nhà cung cấp các giá trị máy chủ SMTP, cổng, tên đăng nhập, mật khẩu SMTP và địa chỉ người gửi đã xác thực. Điền vào các biến tương ứng trong `backend/.env.email`. Cổng 587 thường dùng STARTTLS (`SMTP_USE_TLS=true`); nếu nhà cung cấp yêu cầu SSL trực tiếp cổng 465, đặt `SMTP_PORT=465` và `SMTP_USE_TLS=false`.

Không đưa `backend/.env.email` lên Git hoặc gửi mật khẩu đăng nhập tài khoản chính. File này đã được loại khỏi Git bằng `.gitignore`.
