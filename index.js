import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// 连接 Cloudflare R2
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME;

// 内存存储视频元数据（生产环境换成数据库）
const videos = [];

// 上传接口（支持大文件）
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

app.post('/api/upload', upload.single('video'), async (req, res) => {
  const file = req.file;
  const title = req.body.title || file.originalname;
  const key = `videos/${Date.now()}-${file.originalname}`;

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  }));

  const video = { id: Date.now().toString(), title, key, size: file.size, date: new Date().toISOString(), views: 0 };
  videos.push(video);
  res.json({ success: true, video });
});

// 获取视频列表
app.get('/api/videos', (req, res) => res.json(videos));

// 获取视频播放链接（有效期 1 小时）
app.get('/api/video/:id/url', async (req, res) => {
  const video = videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: '找不到视频' });
  
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: video.key }), { expiresIn: 3600 });
  video.views++;
  res.json({ url });
});

app.listen(3000, () => console.log('服务器运行在 http://localhost:3000'));