#!/usr/bin/env node

import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * Create different video formats for various social media platforms
 */

const inputVideo = path.join(__dirname, 'output', 'acupuncture-ad-final.mp4');
const outputDir = path.join(__dirname, 'output', 'formats');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║     CREATE SOCIAL MEDIA VIDEO FORMATS                     ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

const formats = [
  {
    name: 'YouTube / Facebook (Landscape)',
    resolution: '1920x1080',
    output: path.join(outputDir, 'youtube-facebook.mp4'),
    description: 'Full HD landscape for YouTube and Facebook'
  },
  {
    name: 'Instagram Stories / Reels (Portrait)',
    resolution: '1080x1920',
    output: path.join(outputDir, 'instagram-stories.mp4'),
    description: 'Vertical format for Instagram Stories and Reels'
  },
  {
    name: 'Instagram Feed (Square)',
    resolution: '1080x1080',
    output: path.join(outputDir, 'instagram-feed.mp4'),
    description: 'Square format for Instagram feed posts'
  },
  {
    name: 'Twitter / X',
    resolution: '1280x720',
    output: path.join(outputDir, 'twitter.mp4'),
    description: 'HD format optimized for Twitter/X'
  }
];

async function convertFormat(format) {
  return new Promise((resolve, reject) => {
    console.log(`\n📹 Creating: ${format.name}`);
    console.log(`   Resolution: ${format.resolution}`);
    console.log(`   Output: ${path.basename(format.output)}`);
    console.log('   ─────────────────────────────────────────────────────────');

    ffmpeg(inputVideo)
      .outputOptions([
        `-vf scale=${format.resolution}:force_original_aspect_ratio=decrease,pad=${format.resolution}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
        '-c:v libx264',
        '-preset medium',
        '-crf 23',
        '-pix_fmt yuv420p',
        '-movflags +faststart'
      ])
      .output(format.output)
      .on('progress', (progress) => {
        if (progress.percent) {
          process.stdout.write(`\r   Progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        const stats = fs.statSync(format.output);
        console.log(`\n   ✓ Complete! Size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB\n`);
        resolve();
      })
      .on('error', (err) => {
        console.error(`\n   ✗ Error: ${err.message}\n`);
        reject(err);
      })
      .run();
  });
}

async function main() {
  try {
    console.log('📂 Input video:', inputVideo);
    console.log('📂 Output directory:', outputDir);
    console.log('\n🎬 Starting conversions...\n');

    for (const format of formats) {
      await convertFormat(format);
    }

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    ✓ ALL FORMATS CREATED!                  ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('📱 Platform-specific videos created:\n');
    formats.forEach(format => {
      console.log(`   • ${format.name}`);
      console.log(`     ${format.description}`);
      console.log(`     File: ${path.basename(format.output)}\n`);
    });

    console.log('💡 Tips for posting:');
    console.log('   • YouTube: Use landscape version with full description');
    console.log('   • Instagram Stories: Use portrait version (9:16 ratio)');
    console.log('   • Instagram Feed: Use square version for better visibility');
    console.log('   • Twitter/X: Use HD version for optimal quality\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    process.exit(1);
  }
}

main();
