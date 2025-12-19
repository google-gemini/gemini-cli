#!/usr/bin/env node

import { generateAllScenes } from './scene-generator.js';
import { assembleVideo, getVideoInfo } from './video-assembler.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, 'output');
const SCENES_DIR = path.join(OUTPUT_DIR, 'scenes');
const FINAL_VIDEO = path.join(OUTPUT_DIR, 'acupuncture-ad-final.mp4');

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   ACUPUNCTURE CLINIC - MEDICAL ADVERTISEMENT GENERATOR     ║');
  console.log('║   Paralysis Treatment Awareness Video                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Create output directories
    console.log('📁 Creating output directories...');
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    if (!fs.existsSync(SCENES_DIR)) {
      fs.mkdirSync(SCENES_DIR, { recursive: true });
    }
    console.log('✓ Directories created\n');

    // Step 2: Generate all scene images
    console.log('🎨 Generating scene images...');
    console.log('─────────────────────────────────────────────────────────────');
    await generateAllScenes(SCENES_DIR);
    console.log('─────────────────────────────────────────────────────────────\n');

    // Step 3: Assemble video from scenes
    console.log('🎬 Assembling video with transitions...');
    console.log('─────────────────────────────────────────────────────────────');
    await assembleVideo(SCENES_DIR, FINAL_VIDEO, {
      sceneDuration: 20,      // 20 seconds per scene
      transitionDuration: 1,  // 1 second fade transition
      fps: 30,
      resolution: '1920x1080',
      videoBitrate: '5000k'
    });
    console.log('─────────────────────────────────────────────────────────────\n');

    // Step 4: Get video information
    console.log('📊 Video Information:');
    console.log('─────────────────────────────────────────────────────────────');
    try {
      const videoInfo = await getVideoInfo(FINAL_VIDEO);
      const videoStream = videoInfo.streams.find(s => s.codec_type === 'video');
      
      if (videoStream) {
        console.log(`Resolution: ${videoStream.width}x${videoStream.height}`);
        console.log(`Duration: ${Math.round(videoInfo.format.duration)}s`);
        console.log(`Frame Rate: ${eval(videoStream.r_frame_rate)} fps`);
        console.log(`Bitrate: ${Math.round(videoInfo.format.bit_rate / 1000)}k`);
        console.log(`Size: ${(videoInfo.format.size / (1024 * 1024)).toFixed(2)} MB`);
      }
    } catch (err) {
      // Get file size manually
      const stats = fs.statSync(FINAL_VIDEO);
      console.log(`Resolution: 1920x1080 (Full HD)`);
      console.log(`Duration: ~80s (4 scenes × 20s)`);
      console.log(`Frame Rate: 30 fps`);
      console.log(`Size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
    }
    console.log('─────────────────────────────────────────────────────────────\n');

    // Step 5: Success message
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    ✓ SUCCESS!                              ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    
    console.log('📹 Video generated successfully!');
    console.log(`📂 Output location: ${FINAL_VIDEO}\n`);
    
    console.log('📝 Additional files created:');
    console.log(`   • Scene images: ${SCENES_DIR}/`);
    console.log(`   • Voiceover script: ${path.join(__dirname, 'voiceover-script.txt')}`);
    console.log(`   • Subtitles: ${path.join(__dirname, 'subtitles.srt')}\n`);
    
    console.log('🎙️  NEXT STEPS:');
    console.log('─────────────────────────────────────────────────────────────');
    console.log('1. Record Hindi voiceover using the script in voiceover-script.txt');
    console.log('2. Use a text-to-speech service (Google TTS, Amazon Polly, etc.)');
    console.log('3. Add background music (soft, emotional, professional)');
    console.log('4. Merge audio with video using FFmpeg or video editing software');
    console.log('5. Optional: Add the subtitles.srt file for accessibility\n');
    
    console.log('💡 TIP: The video is currently silent. Add voiceover and music');
    console.log('   to complete the advertisement.\n');

    console.log('🎯 VIDEO DETAILS:');
    console.log('─────────────────────────────────────────────────────────────');
    console.log('Scene 1 (0-20s):  The Problem - Paralysis urgency');
    console.log('Scene 2 (20-40s): The Solution - Acupuncture treatment');
    console.log('Scene 3 (40-60s): Recovery - Patient improvement');
    console.log('Scene 4 (60-80s): Call to Action - Contact details');
    console.log('─────────────────────────────────────────────────────────────\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Run the main function
main();
