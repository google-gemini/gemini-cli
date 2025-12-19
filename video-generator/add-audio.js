#!/usr/bin/env node

import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * Add audio (voiceover and/or background music) to the video
 * 
 * Usage:
 *   node add-audio.js <voiceover.mp3> [background-music.mp3]
 * 
 * Examples:
 *   node add-audio.js voiceover.mp3
 *   node add-audio.js voiceover.mp3 music.mp3
 */

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          ADD AUDIO TO ACUPUNCTURE VIDEO                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log('Usage:');
  console.log('  node add-audio.js <voiceover.mp3> [background-music.mp3]\n');
  console.log('Examples:');
  console.log('  node add-audio.js voiceover.mp3');
  console.log('  node add-audio.js voiceover.mp3 music.mp3\n');
  console.log('📝 Steps to create voiceover:');
  console.log('  1. Use the script in voiceover-script.txt');
  console.log('  2. Record or generate using TTS services:');
  console.log('     • Google Cloud Text-to-Speech (Hindi support)');
  console.log('     • Amazon Polly (Hindi support)');
  console.log('     • Microsoft Azure TTS (Hindi support)\n');
  console.log('🎵 Background music tips:');
  console.log('  • Use soft, emotional, professional music');
  console.log('  • Royalty-free music sources:');
  console.log('     • YouTube Audio Library');
  console.log('     • Epidemic Sound');
  console.log('     • Artlist\n');
  process.exit(0);
}

const videoPath = path.join(__dirname, 'output', 'acupuncture-ad-final.mp4');
const voiceoverPath = args[0];
const musicPath = args[1];
const outputPath = path.join(__dirname, 'output', 'acupuncture-ad-with-audio.mp4');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║          ADDING AUDIO TO VIDEO                             ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

console.log('📹 Input video:', videoPath);
console.log('🎙️  Voiceover:', voiceoverPath);
if (musicPath) {
  console.log('🎵 Background music:', musicPath);
}
console.log('📂 Output:', outputPath);
console.log('\n🎬 Processing...\n');

const command = ffmpeg();

command.input(videoPath);
command.input(voiceoverPath);

if (musicPath) {
  command.input(musicPath);
  
  // Mix voiceover and background music
  command.complexFilter([
    '[1:a]volume=1.0[voice]',           // Voiceover at full volume
    '[2:a]volume=0.2,aloop=loop=-1:size=2e+09[music]',  // Music at 20% volume, looped
    '[voice][music]amix=inputs=2:duration=shortest[aout]'
  ]);
  
  command.outputOptions([
    '-map 0:v',
    '-map [aout]',
    '-c:v copy',
    '-c:a aac',
    '-b:a 192k',
    '-shortest'
  ]);
} else {
  // Just add voiceover
  command.outputOptions([
    '-c:v copy',
    '-c:a aac',
    '-b:a 192k',
    '-shortest'
  ]);
}

command
  .output(outputPath)
  .on('start', (commandLine) => {
    console.log('FFmpeg command:', commandLine, '\n');
  })
  .on('progress', (progress) => {
    if (progress.percent) {
      process.stdout.write(`\rProgress: ${Math.round(progress.percent)}%`);
    }
  })
  .on('end', () => {
    console.log('\n\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    ✓ SUCCESS!                              ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log('✓ Audio added successfully!');
    console.log(`📂 Output: ${outputPath}\n`);
    console.log('🎯 Next steps:');
    console.log('  • Review the video');
    console.log('  • Add subtitles if needed (use subtitles.srt)');
    console.log('  • Export for social media platforms\n');
  })
  .on('error', (err) => {
    console.error('\n\n❌ ERROR:', err.message);
    console.error('\nPlease check:');
    console.error('  • Audio file exists and is valid');
    console.error('  • Audio format is supported (MP3, WAV, AAC, etc.)');
    console.error('  • File paths are correct\n');
    process.exit(1);
  })
  .run();
