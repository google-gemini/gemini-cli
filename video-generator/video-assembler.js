import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs from 'fs';
import path from 'path';

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * Create video from scenes with transitions
 * @param {string} scenesDir - Directory containing scene images
 * @param {string} outputPath - Output video file path
 * @param {object} options - Video options
 */
export async function assembleVideo(scenesDir, outputPath, options = {}) {
  const {
    sceneDuration = 20, // seconds per scene
    transitionDuration = 1, // seconds for fade transition
    fps = 30,
    resolution = '1920x1080',
    videoBitrate = '5000k'
  } = options;

  return new Promise((resolve, reject) => {
    console.log('\n🎬 Starting video assembly...\n');

    // Simpler approach: concatenate scenes with fade in/out
    const filterComplex = [
      // Process each scene with fade in/out
      `[0:v]scale=${resolution},setsar=1,fps=${fps},format=yuv420p,fade=t=out:st=${sceneDuration - transitionDuration}:d=${transitionDuration}[v0]`,
      `[1:v]scale=${resolution},setsar=1,fps=${fps},format=yuv420p,fade=t=in:st=0:d=${transitionDuration},fade=t=out:st=${sceneDuration - transitionDuration}:d=${transitionDuration}[v1]`,
      `[2:v]scale=${resolution},setsar=1,fps=${fps},format=yuv420p,fade=t=in:st=0:d=${transitionDuration},fade=t=out:st=${sceneDuration - transitionDuration}:d=${transitionDuration}[v2]`,
      `[3:v]scale=${resolution},setsar=1,fps=${fps},format=yuv420p,fade=t=in:st=0:d=${transitionDuration}[v3]`,
      
      // Concatenate all scenes
      `[v0][v1][v2][v3]concat=n=4:v=1:a=0[outv]`
    ];

    const command = ffmpeg();

    // Add input images (loop each for scene duration)
    for (let i = 1; i <= 4; i++) {
      command.input(path.join(scenesDir, `scene${i}.png`))
        .inputOptions([
          '-loop 1',
          `-t ${sceneDuration}`
        ]);
    }

    command
      .complexFilter(filterComplex.join(';'))
      .outputOptions([
        '-map [outv]',
        `-b:v ${videoBitrate}`,
        '-pix_fmt yuv420p',
        '-movflags +faststart'
      ])
      .output(outputPath)
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          process.stdout.write(`\rProgress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        console.log('\n\n✓ Video assembly completed successfully!');
        console.log(`✓ Output: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err, stdout, stderr) => {
        console.error('\n✗ Error during video assembly:', err.message);
        console.error('FFmpeg stderr:', stderr);
        reject(err);
      })
      .run();
  });
}

/**
 * Add subtitle file to video
 * @param {string} videoPath - Input video path
 * @param {string} subtitlePath - SRT subtitle file path
 * @param {string} outputPath - Output video with subtitles
 */
export async function addSubtitles(videoPath, subtitlePath, outputPath) {
  return new Promise((resolve, reject) => {
    console.log('\n📝 Adding subtitles to video...\n');

    ffmpeg(videoPath)
      .outputOptions([
        `-vf subtitles=${subtitlePath}:force_style='FontName=Arial,FontSize=24,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,Outline=2'`
      ])
      .output(outputPath)
      .on('progress', (progress) => {
        if (progress.percent) {
          process.stdout.write(`\rProgress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        console.log('\n\n✓ Subtitles added successfully!');
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error('\n✗ Error adding subtitles:', err.message);
        reject(err);
      })
      .run();
  });
}

/**
 * Get video information
 * @param {string} videoPath - Video file path
 */
export async function getVideoInfo(videoPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        resolve(metadata);
      }
    });
  });
}

/**
 * Create a simple background music track (sine wave tone)
 * This is a placeholder - in production, use actual music files
 */
export async function createBackgroundMusic(outputPath, duration = 80) {
  return new Promise((resolve, reject) => {
    console.log('\n🎵 Creating background music...\n');

    ffmpeg()
      .input('anullsrc=r=44100:cl=stereo')
      .inputFormat('lavfi')
      .input(`sine=frequency=440:duration=${duration}`)
      .inputFormat('lavfi')
      .complexFilter([
        '[1:a]volume=0.05[a1]'
      ])
      .outputOptions([
        '-map [a1]',
        '-t', duration.toString(),
        '-acodec libmp3lame',
        '-b:a 128k'
      ])
      .output(outputPath)
      .on('end', () => {
        console.log('✓ Background music created');
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error('✗ Error creating background music:', err.message);
        reject(err);
      })
      .run();
  });
}

/**
 * Merge video with audio
 */
export async function mergeVideoAudio(videoPath, audioPath, outputPath) {
  return new Promise((resolve, reject) => {
    console.log('\n🔊 Merging video with audio...\n');

    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions([
        '-c:v copy',
        '-c:a aac',
        '-b:a 192k',
        '-shortest'
      ])
      .output(outputPath)
      .on('progress', (progress) => {
        if (progress.percent) {
          process.stdout.write(`\rProgress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        console.log('\n\n✓ Audio merged successfully!');
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error('\n✗ Error merging audio:', err.message);
        reject(err);
      })
      .run();
  });
}
