# Hệ thống tự động viết content + tạo ảnh + đăng Facebook — V&T Gold / ACT Gold

Workflow n8n này được xây dựa theo cấu trúc của workflow mẫu `ai5phut_autopost_DEMO`
(theo hướng dẫn YouTube: hIO-Okhbhzo), tùy biến riêng cho fanpage
**Quà tặng dát vàng V&T Gold / ACT Gold** (quatangdatvang.com).

## Luồng hoạt động

```
Trigger (2 nguồn)
 ├─ Lịch đăng tự động (cron hằng ngày) → đọc Google Sheet "Lich_Dang" theo Ngày/Giờ hiện tại
 └─ Form nhập nội dung thủ công → lưu vào Google Sheet "Dang_Ngay"
        ↓
Có nội dung hợp lệ? (IF)
        ↓
AI (Gemini) phân tích nội dung → trả JSON { prompt_image, content }
        ↓
Tách JSON từ AI (Code)
        ├─→ Viết bài đầy đủ (Gemini, 200-350 từ, văn phong thân thiện, emoji, không hashtag)
        │        ↓
        │   Lưu nhật ký bài đăng (Google Sheet "Nhat_Ky_Tu_Dong")
        │        ↓
        │   Làm sạch định dạng (bỏ markdown #, *)
        │
        └─→ Có prompt ảnh AI?
             ├─ Có → Tạo ảnh AI (Hugging Face FLUX.1-schnell) → upload lên Facebook (chưa publish)
             └─ Không → lấy ảnh có sẵn mới nhất trong thư mục Google Drive → upload lên Facebook

Merge (ảnh + nội dung) → Đăng bài lên Fanpage
   - published=false, scheduled_publish_time = now + 30 phút
   - tức là bài được tạo ở dạng NHÁP + hẹn giờ, có 30 phút để bạn kiểm tra/sửa trước khi tự động public

→ Đăng thành công? (IF) → Gửi email thông báo (kèm link xem trước bài nháp)
```

## 1. Chuẩn bị tài khoản / API

| Dịch vụ | Dùng để làm gì | Ghi chú |
|---|---|---|
| Google Sheets (OAuth2) | Lưu lịch đăng, nội dung form, nhật ký bài đăng | Tạo 1 Google Sheet với 3 tab, xem mục 2 |
| Google Drive (OAuth2) | Lấy ảnh sản phẩm thật khi không dùng ảnh AI | Tạo 1 thư mục chứa ảnh sản phẩm đã chụp |
| Gemini API (Google AI Studio) | Viết/nâng cấp nội dung | Lấy key tại aistudio.google.com |
| Hugging Face API token | Tạo ảnh AI bằng FLUX.1-schnell | Tạo tại huggingface.co/settings/tokens |
| Facebook Graph API | Đăng ảnh + bài lên fanpage | Cần Facebook App + Page Access Token dài hạn với quyền `pages_manage_posts`, `pages_read_engagement`, `pages_show_list` |
| Gmail (OAuth2) | Gửi email thông báo khi có bài nháp | Có thể thay bằng node gửi thông báo khác (Telegram, Slack...) nếu muốn |

⚠️ **Bảo mật:** File `workflow.json` này **không chứa bất kỳ API key/token thật nào** —
tất cả đều dùng Credentials của n8n (n8n tự mã hoá và lưu riêng). Khi import, n8n sẽ hỏi bạn
gắn credential thật cho từng node. Tuyệt đối không dán token thẳng vào node như file
demo gốc đã làm (file đó có lộ 1 token Hugging Face ở dạng chữ thường — nếu đó là token
thật đang dùng, bạn nên thu hồi/đổi ngay trên Hugging Face).

## 2. Cấu trúc Google Sheet cần tạo trước

Tạo 1 Google Sheet mới, đặt 3 tab với đúng tên và cột sau:

**Tab `Lich_Dang`** (kế hoạch đăng bài định kỳ — bạn tự điền trước)
| Ngày | Giờ | Nội dung |
|---|---|---|
| 17/08/2026 | 09 | Giới thiệu bộ tranh dát vàng 24K... |

**Tab `Dang_Ngay`** (n8n tự ghi khi có người gửi form)
| Ngày | Giờ | Nội dung |

**Tab `Nhat_Ky_Tu_Dong`** (n8n tự ghi log sau khi AI viết bài)
| Ngày | Nội dung ngắn | Nội dung đầy đủ |

## 3. Import vào n8n

1. Mở n8n → **Import from File** → chọn `workflow.json`.
2. Vào từng node có icon "credential chưa gắn" (màu đỏ/vàng) và chọn/tạo credential tương ứng:
   - `Google Sheets - VTGold` (2 node đọc/ghi Sheet + node log)
   - `Google Drive - VTGold`
   - `Gemini API - VTGold` (2 node model Gemini)
   - `Hugging Face API Key` (dạng **Header Auth**: header `Authorization`, value `Bearer <token của bạn>`)
   - `Facebook Graph API - VTGold Page`
   - `Gmail - VTGold`
3. Thay các placeholder trong node bằng giá trị thật:
   - `YOUR_GOOGLE_SHEET_ID` → ID của Google Sheet (lấy trong URL Sheet)
   - `YOUR_DRIVE_FOLDER_ID` → ID thư mục Drive chứa ảnh sản phẩm
   - `YOUR_FACEBOOK_PAGE_ID` → **Page ID dạng số** của fanpage (không phải username `quatangdatvangVTGold` — gọi `GET /me?fields=id` bằng Page Access Token để lấy)
   - Email nhận thông báo trong node "Gửi email thông báo" (mặc định đang để `phv30688@gmail.com`, đổi nếu cần)
4. Chỉnh giờ chạy cron ở node "Lịch đăng tự động" (`0 9 * * *` = 9h sáng mỗi ngày) theo lịch bạn muốn.
5. Kích hoạt (Active) workflow.

## 4. Vận hành hằng ngày

- **Cách 1 — Có lịch sẵn:** điền trước nội dung/ý tưởng vào tab `Lich_Dang` theo đúng Ngày + Giờ
  muốn đăng, cron sẽ tự động nhặt đúng dòng khớp ngày giờ hiện tại để xử lý.
- **Cách 2 — Đăng ngay theo yêu cầu:** mở link Form (n8n cung cấp sau khi Active), nhập ý
  tưởng, hệ thống xử lý ngay lập tức.
- Sau khi AI viết bài + tạo/chọn ảnh xong, bài được đăng ở **chế độ nháp, hẹn giờ 30 phút**.
  Bạn nhận email có link xem trước — có thể vào Meta Business Suite / Trình quản lý trang để
  sửa hoặc huỷ trước khi bài tự động công khai.

## 5. Gợi ý mở rộng

- Đổi node "Tạo ảnh AI (FLUX)" sang dịch vụ khác (OpenAI Images, Ideogram, Google Imagen...)
  nếu muốn chất lượng ảnh sản phẩm dát vàng chân thực hơn — chỉ cần sửa node HTTP Request
  hoặc thay bằng node có sẵn tương ứng, giữ nguyên output là ảnh nhị phân/base64.
- Muốn đăng đồng thời Instagram: nhân bản nhánh "Đăng bài lên Fanpage" và trỏ sang node/edge
  Instagram Graph API tương ứng (dùng chung `attached_media`/ảnh đã upload).
- Muốn duyệt nội dung trước khi tạo ảnh: thêm bước gửi Gmail/Telegram xin duyệt ngay sau
  node "Tách JSON từ AI", chờ phản hồi rồi mới đi tiếp.
