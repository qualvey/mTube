[x] 视频流功能
------------------------
=====================|
视频区域              |
                      |
                      |
=====================|

=====================|
视频区域              |
                      |
                      |
=====================|

....
-------------------------
中间的视频区域展示视频，类似youtube,视频由后台控制

[] 带请求头拉流


```shell
PS C:\Users\Ryu> curl.exe -i `
>>   -H "Referer: https://missav.ws/cn/hikb-020-uncensored-leak" `
>>   -H "User-Agent: Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36" `
>>   "https://surrit.com/b3bca8b7-9e26-4d5e-a9ea-dd16061be4a3/360p/video.m3u8"
HTTP/1.1 200 OK
Date: Wed, 29 Jul 2026 13:25:06 GMT
Content-Type: application/vnd.apple.mpegurl
Content-Length: 101366
Connection: keep-alive
CF-Ray: a22c729cc950f076-DFW
CF-Cache-Status: HIT
Age: 138089
Cache-Control: max-age=31536000
ETag: "65097D08F7E90F538512ED50915A283C"
Last-Modified: Mon, 27 Jul 2026 22:39:03 GMT
Server: cloudflare
Timing-Allow-Origin: *
X-Bdcdn-Cache-Status: TCP_MISS,TCP_MISS
X-Request-Id: ccb7eb0a8a11462c7298597326243c01
X-Request-Ip: 172.69.150.169
X-Response-Cache: miss
X-Response-Cinfo: 172.69.150.169
X-Tt-Trace-Tag: id=5
set-cookie: __cf_bm=placeholder_cookie_string; HttpOnly; SameSite=None; Secure; Path=/; Domain=surrit.com;
alt-svc: h3=":443"; ma=86400

#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:4
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-TOKEN=gN3AjZwUTOjNWOyczYyITY8hTMwcDfyITYhpjMiVmZ6YmZxEjO0ITZipTMyUzN6AjZxIjOwAzNxoDMwYjM
#EXTINF:4.000000,
video0.jpeg
#EXTINF:4.000000,
video1.jpeg
#EXTINF:4.000000,
video2.jpeg
#EXTINF:4.000000,
video3.jpeg
#EXTINF:4.000000,
video4.jpeg
#EXTINF:4.000000,
video5.jpeg
#EXTINF:4.000000,
video6.jpeg
#EXTINF:4.000000,
video7.jpeg
#EXTINF:4.000000,
video8.jpeg
#EXTINF:4.000000,
video9.jpeg
#EXTINF:4.000000,
video10.jpeg
#EXTINF:4.000000,
video11.jpeg
#EXTINF:4.000000,
video12.jpeg
#EXTINF:4.000000,
```
成功获取视频分片列表
```
PS C:\Users\Ryu> curl.exe -I `
>>   -H "Referer: https://missav.ws/cn/hikb-020-uncensored-leak" `
>>   -H "User-Agent: Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36" `
>>   "https://surrit.com/b3bca8b7-9e26-4d5e-a9ea-dd16061be4a3/360p/video0.jpeg"
```
分片成功读取，保存为文件可以播放
