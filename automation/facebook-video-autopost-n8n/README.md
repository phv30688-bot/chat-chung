# Hệ thống tự động dựng video từ ảnh sản phẩm + đăng Facebook — V&T Gold / ACT Gold

Workflow n8n này nối tiếp workflow viết content (`../facebook-autopost-n8n`). Mỗi ngày,
hệ thống tự lấy ảnh của 1 sản phẩm quà tặng dát vàng, dựng thành video slideshow có chữ
overlay, rồi tự đăng lên fanpage — **không cần bạn động tay** ngoài việc chuẩn bị dữ liệu
ban đầu và duyệt bài nháp (tuỳ chọn) trước khi nó tự công khai.

## Vì sao dùng dịch vụ dựng video ngoài (Creatomate) thay vì FFmpeg trong n8n?

n8n (kể cả bản cloud) không có sẵn công cụ dựng video timeline (ghép ảnh, hiệu ứng
Ken Burns, chèn chữ, xuất mp4). Cách khả thi và ổn định nhất khi muốn "hoàn toàn tự động,
không code" là gọi một **Video Rendering API** — dịch vụ nhận vào ảnh + text theo template
dựng sẵn, trả về file video. Workflow này dùng **Creatomate** làm ví dụ mặc định vì:

- Có giao diện kéo-thả để tạo template 1 lần (không cần biết lập trình dựng video).
- API đơn giản: gửi `template_id` + danh sách ảnh/chữ cần thay → nhận video.
- Hỗ trợ **webhook callback** khi video dựng xong, nên không cần n8n polling liên tục.

Bạn hoàn toàn có thể thay bằng dịch vụ khác (Shotstack, JSON2Video, Bannerbear Video...) —
chỉ cần sửa lại node **"Gửi yêu cầu dựng video (Creatomate)"** và node
**"Đọc dữ liệu webhook Creatomate"** cho đúng format của dịch vụ đó, phần còn lại của
workflow giữ nguyên.

> Lưu ý: tôi mô tả các field API (`template_id`, `modifications`, `webhook_url`, `metadata`,
> trạng thái `succeeded`/`failed`...) dựa theo tài liệu Creatomate tại thời điểm viết
> workflow này. Trước khi chạy thật, hãy đối chiếu nhanh với tài liệu API mới nhất của họ
> (creatomate.com/docs/api) phòng khi họ đổi tên field.

## Luồng hoạt động (2 nhánh, giống cấu trúc workflow viết content)

```
NHÁNH A — Tạo yêu cầu dựng video (chạy theo lịch mỗi ngày)
Lịch tạo video hằng ngày (8h)
  → Đọc danh sách sản phẩm chờ làm video (Google Sheet "San_Pham_Video")
  → Chọn sản phẩm tiếp theo (dòng đầu tiên chưa có Trạng thái)
  → AI viết overlay_text (chữ đè trên video) + caption (chú thích Facebook)
  → Chuẩn bị dữ liệu & gửi yêu cầu dựng video tới Creatomate (kèm webhook_url + metadata)
  → Đánh dấu "đang dựng video" trong Sheet

NHÁNH B — Nhận video đã dựng xong (Creatomate tự gọi webhook khi xong)
Webhook nhận kết quả dựng video
  → Đọc metadata (biết video này thuộc sản phẩm nào)
  → Dựng thành công?
       ✔ Đăng video lên Fanpage (nháp, hẹn giờ 30 phút) → cập nhật Sheet "Đã đăng" → email báo
       ✘ Đánh dấu "lỗi dựng video" trong Sheet → email báo lỗi
```

## 1. Chuẩn bị Google Sheet

Thêm 1 tab mới **`San_Pham_Video`** vào cùng Google Sheet đang dùng cho workflow viết content
(hoặc tạo Sheet riêng, tuỳ bạn), với các cột:

| Tên sản phẩm | Link sản phẩm | Ảnh 1 | Ảnh 2 | Ảnh 3 | Ảnh 4 | Ảnh 5 | Trạng thái | Ngày đăng | Link video |
|---|---|---|---|---|---|---|---|---|---|

- **Link sản phẩm**: dùng làm khoá để hệ thống cập nhật đúng dòng — mỗi sản phẩm cần
  link duy nhất (copy link trang sản phẩm trên quatangdatvang.com).
- **Ảnh 1..5**: dán link ảnh sản phẩm (URL ảnh public, ví dụ copy trực tiếp từ trang sản
  phẩm trên Haravan — chuột phải ảnh → "Copy image address"). Cần ít nhất 1 ảnh, tối đa 5.
- **Trạng thái**: để trống với sản phẩm chưa làm video. Hệ thống sẽ tự điền
  `Đang dựng video` → `Đã đăng` (hoặc `Lỗi dựng video` nếu có sự cố).
- Bạn chỉ cần **điền trước danh sách sản phẩm** (tên, link, ảnh) một lần — mỗi ngày cron
  tự nhặt đúng 1 dòng chưa làm để xử lý, không lặp lại sản phẩm đã đăng.

## 2. Tạo template video trên Creatomate

1. Đăng ký tài khoản tại creatomate.com (có gói miễn phí đủ dùng cho ~1 video/ngày).
2. Vào trình chỉnh sửa (Template Editor), tạo 1 template dạng **slideshow dọc 9:16**
   (chuẩn Reels/Story), gồm:
   - Tối đa 5 khung ảnh, đặt tên lần lượt **`Image-1` → `Image-5`** (hiệu ứng Ken Burns
     zoom/pan có sẵn trong thư viện hiệu ứng của Creatomate).
   - 1 lớp chữ tên **`Text-ProductName`** hiển thị tên sản phẩm.
   - 1 lớp chữ tên **`Text-Overlay`** hiển thị câu ấn tượng do AI viết.
   - 1 lớp chữ tên **`Text-CTA`** ở cuối video (dòng kêu gọi hành động/tên thương hiệu).
   - Nhạc nền: chèn sẵn 1 track nhạc bản quyền tự do trong chính template (không cần n8n
     xử lý nhạc) — Creatomate có thư viện nhạc miễn phí sẵn trong trình chỉnh sửa.
   - Nếu sản phẩm có ít hơn 5 ảnh, các khung ảnh dư sẽ không được gán nội dung mới —
     nên đặt độ dài mỗi khung ảnh vừa phải và cân nhắc ẩn khung thừa bằng logic template,
     hoặc luôn chuẩn bị đúng 5 ảnh mỗi sản phẩm để đơn giản nhất.
3. Lưu template, copy **Template ID** → dán vào node "Chuẩn bị dữ liệu gửi Creatomate"
   (thay `YOUR_CREATOMATE_TEMPLATE_ID`).
4. Lấy **API Key** tại Settings → API Keys → tạo credential "Header Auth" trong n8n:
   header `Authorization`, value `Bearer <API key của bạn>`, đặt tên `Creatomate API Key`.

## 3. Cấu hình webhook nhận video hoàn tất

1. Sau khi import workflow và **kích hoạt (Active)**, mở node "Nhận kết quả dựng video
   (Creatomate)" để lấy **Production URL** của webhook (n8n tự sinh, dạng
   `https://<domain-n8n-của-bạn>/webhook/creatomate-video-done`).
2. Dán đúng URL này vào node "Chuẩn bị dữ liệu gửi Creatomate" (thay
   `https://YOUR_N8N_DOMAIN/webhook/creatomate-video-done`).
3. Nếu n8n của bạn chạy local/không có domain public, cần một địa chỉ có thể truy cập từ
   Internet (n8n cloud, hoặc self-host có domain/HTTPS, hoặc dùng tunnel như ngrok khi test).

## 4. Các credential/placeholder cần thay khi import

| Placeholder | Ý nghĩa |
|---|---|
| `YOUR_GOOGLE_SHEET_ID` | ID Google Sheet chứa tab `San_Pham_Video` |
| `YOUR_CREATOMATE_TEMPLATE_ID` | Template ID lấy ở bước 2 |
| `https://YOUR_N8N_DOMAIN/webhook/creatomate-video-done` | Webhook URL thật lấy ở bước 3 |
| `YOUR_FACEBOOK_PAGE_ID` | Page ID dạng số của fanpage (giống workflow viết content) |
| Email trong node thông báo | Mặc định `phv30688@gmail.com`, đổi nếu cần |

Và gắn lại các credential: `Google Sheets - VTGold`, `Gemini API - VTGold`,
`Creatomate API Key`, `Facebook Graph API - VTGold Page`, `Gmail - VTGold` (có thể **dùng
chung** credential Google Sheets / Facebook / Gmail đã tạo ở workflow viết content, không
cần tạo lại).

## 5. Vận hành

- Bạn chỉ cần định kỳ (vài phút/tuần) bổ sung thêm sản phẩm mới vào tab `San_Pham_Video`
  — mỗi lần thêm 5-10 dòng là đủ chạy tự động nhiều ngày.
- Mỗi ngày 8h sáng, hệ thống tự: chọn sản phẩm → viết chữ/caption bằng AI → dựng video →
  đăng nháp lên fanpage, hẹn 30 phút sau tự công khai.
- Email thông báo giúp bạn kiểm tra/sửa video trong 30 phút đó nếu cần; nếu không làm gì,
  bài sẽ tự động public.
- Nếu 1 sản phẩm bị lỗi dựng video, dòng đó được đánh dấu `Lỗi dựng video` và có email báo —
  xoá nội dung ô Trạng thái để hệ thống thử lại vào lượt chạy kế tiếp.

## 6. Giới hạn hiện tại / hướng mở rộng

- Video đăng qua edge `/videos` của Graph API (video thường trên Trang) — đây KHÔNG phải
  luồng upload Reels gốc (Reels dùng API upload resumable riêng, nhiều bước hơn). Video
  dọc ngắn vẫn hiển thị tốt trên Trang/Feed; nếu bạn cần chắc chắn video lên mục Reels,
  đây là phần nên làm thêm sau.
- Hiện chọn tuần tự 1 sản phẩm/ngày theo thứ tự trong Sheet; có thể đổi logic ở node
  "Chọn sản phẩm tiếp theo" để chọn ngẫu nhiên, ưu tiên theo mùa vụ (Tết, khai trương...),
  hoặc đọc trực tiếp từ danh mục sản phẩm Haravan qua Admin API thay vì nhập tay vào Sheet.
- Có thể thêm bước đăng đồng thời Instagram/TikTok bằng cách nhân bản nhánh sau khi có
  `url` video từ Creatomate, gọi API tương ứng của từng nền tảng.
