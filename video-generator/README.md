# Acupuncture Clinic - Medical Advertisement Video Generator

Professional medical advertisement video generator for paralysis treatment awareness campaign.

## 🎯 Overview

This tool generates a professional 80-second medical advertisement video with 4 distinct scenes:

1. **Scene 1 (0-20s)**: The Problem - Paralysis urgency message
2. **Scene 2 (20-40s)**: The Solution - Acupuncture treatment benefits
3. **Scene 3 (40-60s)**: Recovery - Patient improvement and hope
4. **Scene 4 (60-80s)**: Call to Action - Contact details and clinic information

## 📋 Features

- ✅ Automated scene generation with professional graphics
- ✅ Smooth fade transitions between scenes
- ✅ High-quality 1080p output (1920x1080)
- ✅ Teal/turquoise color scheme matching clinic branding
- ✅ Professional text overlays with shadows
- ✅ Hindi voiceover script with timing markers
- ✅ SRT subtitle file for accessibility
- ✅ Ready for audio integration

## 🚀 Quick Start

### Generate the Video

```bash
cd video-generator
npm run generate
```

This will:
1. Generate 4 scene images in `output/scenes/`
2. Assemble them into a video with transitions
3. Output final video: `output/acupuncture-ad-final.mp4`

### Clean Output

```bash
npm run clean
```

## 📁 Project Structure

```
video-generator/
├── index.js                 # Main entry point
├── scene-generator.js       # Scene image generation
├── video-assembler.js       # FFmpeg video assembly
├── voiceover-script.txt     # Hindi voiceover script with timing
├── subtitles.srt           # SRT subtitle file
├── package.json            # Project configuration
├── README.md               # This file
└── output/                 # Generated files (created on run)
    ├── scenes/             # Individual scene images
    │   ├── scene1.png
    │   ├── scene2.png
    │   ├── scene3.png
    │   └── scene4.png
    └── acupuncture-ad-final.mp4  # Final video
```

## 🎙️ Adding Voiceover

The video is currently **silent**. To add the Hindi voiceover:

### Option 1: Text-to-Speech Services

Use online TTS services with Hindi support:

- **Google Cloud Text-to-Speech**: https://cloud.google.com/text-to-speech
- **Amazon Polly**: https://aws.amazon.com/polly/
- **Microsoft Azure TTS**: https://azure.microsoft.com/en-us/services/cognitive-services/text-to-speech/

### Option 2: Professional Recording

1. Use the script in `voiceover-script.txt`
2. Record with a professional Hindi voice artist
3. Follow the timing markers for each scene

### Option 3: Merge Audio with FFmpeg

Once you have the audio file:

```bash
ffmpeg -i output/acupuncture-ad-final.mp4 -i voiceover.mp3 \
  -c:v copy -c:a aac -b:a 192k -shortest \
  output/acupuncture-ad-with-audio.mp4
```

## 🎵 Adding Background Music

Add soft, emotional background music:

```bash
ffmpeg -i output/acupuncture-ad-final.mp4 -i background-music.mp3 \
  -filter_complex "[1:a]volume=0.3[a1];[a1]aloop=loop=-1:size=2e+09[a2]" \
  -map 0:v -map "[a2]" -c:v copy -c:a aac -shortest \
  output/acupuncture-ad-with-music.mp4
```

## 📝 Adding Subtitles

The `subtitles.srt` file is ready to use:

```bash
ffmpeg -i output/acupuncture-ad-final.mp4 -vf subtitles=subtitles.srt \
  output/acupuncture-ad-with-subtitles.mp4
```

## 🎨 Customization

### Change Video Duration

Edit `index.js`:

```javascript
await assembleVideo(SCENES_DIR, FINAL_VIDEO, {
  sceneDuration: 15,      // Change from 20 to 15 seconds
  transitionDuration: 1,
  fps: 30,
  resolution: '1920x1080',
  videoBitrate: '5000k'
});
```

### Change Resolution

For portrait mode (Instagram/TikTok):

```javascript
resolution: '1080x1920'  // Portrait mode
```

For square (Instagram post):

```javascript
resolution: '1080x1080'  // Square format
```

### Modify Scene Content

Edit `scene-generator.js` to customize:
- Text content
- Colors
- Graphics
- Layout

## 📊 Video Specifications

- **Resolution**: 1920x1080 (Full HD)
- **Frame Rate**: 30 fps
- **Duration**: ~80 seconds (4 scenes × 20s)
- **Bitrate**: 5000k
- **Format**: MP4 (H.264)
- **Color Space**: YUV420P

## 🔧 Technical Details

### Dependencies

- **canvas**: For generating scene images
- **fluent-ffmpeg**: FFmpeg wrapper for Node.js
- **@ffmpeg-installer/ffmpeg**: FFmpeg binary

### Scene Generation

Each scene is generated using HTML5 Canvas API:
- Professional gradients
- Text with shadows
- Simple graphics (icons, shapes)
- Clinic branding colors

### Video Assembly

FFmpeg is used for:
- Scaling and formatting scenes
- Adding fade transitions
- Encoding to H.264
- Optimizing for web playback

## 📞 Contact Information in Video

**Scene 4** displays:
- **Therapist**: Amit Sakpal
- **Clinic**: DR. SUBODH MEHTA MEDICAL CENTRE
- **Location**: Khar West, Mumbai
- **Phone**: 7506 95 2513

## 🎯 Target Audience

- Paralysis patients and their families
- People seeking alternative treatments
- Healthcare professionals
- Social media audiences (Facebook, Instagram, YouTube)

## 📱 Social Media Formats

### YouTube / Facebook (Landscape)
```javascript
resolution: '1920x1080'  // Default
```

### Instagram Stories / Reels (Portrait)
```javascript
resolution: '1080x1920'
```

### Instagram Feed (Square)
```javascript
resolution: '1080x1080'
```

## 🚨 Important Notes

1. **Voiceover Required**: The video needs Hindi voiceover to be complete
2. **Background Music**: Add soft, professional music for emotional impact
3. **Medical Compliance**: Ensure all claims comply with medical advertising regulations
4. **Copyright**: Use royalty-free music and ensure all content is original

## 📄 License

MIT License - Free to use and modify for the clinic's marketing purposes.

## 🤝 Support

For questions or modifications, refer to the code comments in:
- `scene-generator.js` - Scene customization
- `video-assembler.js` - Video processing
- `voiceover-script.txt` - Script and timing

---

**Generated with ❤️ for Acupuncture Clinic - Helping patients recover faster**
