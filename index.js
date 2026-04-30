import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// 提供前端页面
app.use(express.static('public'));

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

// 内存存储视频元数据
const videos = [];

// 第一步：获取直传链接
app.post('/api/upload-url', async (req, res) => {
  try {
    const { filename, contentType, title, size } = req.body;
    const key = `videos/${Date.now()}-${filename}`;
    const id = Date.now().toString();

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 3600 }
    );

    // 先保存元数据
    const video = {
      id,
      title: title || filename,
      key,
      size: size || 0,
      date: new Date().toISOString(),
      views: 0,
    };
    videos.push(video);

    res.json({ uploadUrl, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取视频列表
app.get('/api/videos', (req, res) => {
  res.json(videos);
});

// 获取视频播放链接
app.get('/api/video/:id/url', async (req, res) => {
  try {
    const video = videos.find(v => v.id === req.params.id);
    if (!video) return res.status(404).json({ error: '找不到视频' });

    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: BUCKET, Key: video.key }),
      { expiresIn: 3600 }
    );
    video.views++;
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('服务器运行中'));
