# Complete Guide: Acupuncture Clinic Video Advertisement

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Video Content](#video-content)
3. [Adding Voiceover](#adding-voiceover)
4. [Adding Background Music](#adding-background-music)
5. [Creating Social Media Formats](#creating-social-media-formats)
6. [Adding Subtitles](#adding-subtitles)
7. [Customization](#customization)
8. [Troubleshooting](#troubleshooting)

---

## 🚀 Quick Start

### Generate the Base Video

```bash
cd video-generator
npm run generate
```

This creates:
- ✅ 4 professional scene images
- ✅ 80-second video with fade transitions
- ✅ Full HD 1920x1080 MP4 file
- ✅ 9.4 MB output file

**Output:** `output/acupuncture-ad-final.mp4`

---

## 🎬 Video Content

### Scene Breakdown

#### Scene 1: The Problem (0-20 seconds)
- **Visual**: Dark background with wheelchair icon
- **Text**: "PARALYSIS?" and "TIME IS MUSCLE"
- **Message**: Urgency of paralysis treatment
- **Color**: Dark blue/gray with red accent

#### Scene 2: The Solution (20-40 seconds)
- **Visual**: Teal gradient with acupuncture needles
- **Text**: "THE SOLUTION" and "Start Acupuncture IMMEDIATELY"
- **Message**: Acupuncture as effective treatment
- **Color**: Teal/turquoise (clinic branding)

#### Scene 3: Recovery (40-60 seconds)
- **Visual**: Green gradient with rising figure
- **Text**: "RECOVERY" and "Faster Recovery with Early Treatment"
- **Message**: Hope and positive outcomes
- **Color**: Bright green with gold stars

#### Scene 4: Call to Action (60-80 seconds)
- **Visual**: Professional contact card
- **Text**: 
  - Amit Sakpal (Acupuncture Therapist)
  - DR. SUBODH MEHTA MEDICAL CENTRE
  - Khar West, Mumbai
  - **Phone: 7506 95 2513**
- **Message**: Clear call to action
- **Color**: Teal and white professional design

---

## 🎙️ Adding Voiceover

### Step 1: Prepare the Script

The Hindi voiceover script is in `voiceover-script.txt` with:
- ✅ Complete Hindi script (transliterated)
- ✅ Timing markers for each scene
- ✅ Pronunciation guide
- ✅ Voice direction notes

### Step 2: Record or Generate Audio

#### Option A: Text-to-Speech Services

**Google Cloud Text-to-Speech** (Recommended)
```bash
# Install Google Cloud SDK
# https://cloud.google.com/text-to-speech

# Generate Hindi voiceover
gcloud text-to-speech synthesize-speech \
  --text-file=voiceover-script.txt \
  --output-file=voiceover.mp3 \
  --language-code=hi-IN \
  --voice-name=hi-IN-Wavenet-A
```

**Amazon Polly**
```python
import boto3

polly = boto3.client('polly')
response = polly.synthesize_speech(
    Text='Your Hindi script here',
    OutputFormat='mp3',
    VoiceId='Aditi',  # Hindi voice
    LanguageCode='hi-IN'
)

with open('voiceover.mp3', 'wb') as file:
    file.write(response['AudioStream'].read())
```

**Microsoft Azure TTS**
```bash
# Install Azure Speech SDK
# https://azure.microsoft.com/en-us/services/cognitive-services/text-to-speech/

az cognitiveservices speech synthesize \
  --text-file voiceover-script.txt \
  --output voiceover.mp3 \
  --voice hi-IN-SwaraNeural
```

#### Option B: Professional Recording

1. Hire a Hindi voice artist on:
   - Fiverr: https://www.fiverr.com/
   - Upwork: https://www.upwork.com/
   - Voices.com: https://www.voices.com/

2. Provide them with:
   - `voiceover-script.txt`
   - Voice direction: Deep, empathetic, professional male voice
   - Duration: ~80 seconds
   - Format: MP3 or WAV

### Step 3: Add Voiceover to Video

```bash
# Just voiceover
npm run add-audio voiceover.mp3

# Voiceover + background music
npm run add-audio voiceover.mp3 background-music.mp3
```

**Output:** `output/acupuncture-ad-with-audio.mp4`

---

## 🎵 Adding Background Music

### Finding Royalty-Free Music

**Free Sources:**
- YouTube Audio Library: https://www.youtube.com/audiolibrary
- Free Music Archive: https://freemusicarchive.org/
- Incompetech: https://incompetech.com/

**Premium Sources:**
- Epidemic Sound: https://www.epidemicsound.com/
- Artlist: https://artlist.io/
- AudioJungle: https://audiojungle.net/

### Music Recommendations

**Genre:** Emotional, Inspirational, Cinematic
**Mood:** Hopeful, Professional, Caring
**Instruments:** Piano, Strings, Soft Pads

**Search Terms:**
- "Emotional piano background"
- "Medical documentary music"
- "Inspirational corporate"
- "Healing meditation music"

### Add Music to Video

```bash
# With voiceover
npm run add-audio voiceover.mp3 music.mp3

# Music only (no voiceover yet)
node add-audio.js placeholder-silence.mp3 music.mp3
```

The script automatically:
- ✅ Sets voiceover to 100% volume
- ✅ Sets music to 20% volume (background)
- ✅ Loops music to match video length
- ✅ Mixes both audio tracks

---

## 📱 Creating Social Media Formats

### Generate All Formats

```bash
npm run create-formats
```

This creates 4 optimized versions:

#### 1. YouTube / Facebook (Landscape)
- **Resolution:** 1920x1080 (Full HD)
- **Aspect Ratio:** 16:9
- **Best For:** YouTube, Facebook posts, LinkedIn
- **File:** `output/formats/youtube-facebook.mp4`

#### 2. Instagram Stories / Reels (Portrait)
- **Resolution:** 1080x1920
- **Aspect Ratio:** 9:16
- **Best For:** Instagram Stories, Reels, TikTok
- **File:** `output/formats/instagram-stories.mp4`

#### 3. Instagram Feed (Square)
- **Resolution:** 1080x1080
- **Aspect Ratio:** 1:1
- **Best For:** Instagram feed posts, Facebook posts
- **File:** `output/formats/instagram-feed.mp4`

#### 4. Twitter / X
- **Resolution:** 1280x720 (HD)
- **Aspect Ratio:** 16:9
- **Best For:** Twitter/X posts
- **File:** `output/formats/twitter.mp4`

---

## 📝 Adding Subtitles

### Using the Provided SRT File

The `subtitles.srt` file contains Hindi subtitles with proper timing.

#### Method 1: Burn Subtitles into Video

```bash
ffmpeg -i output/acupuncture-ad-with-audio.mp4 \
  -vf "subtitles=subtitles.srt:force_style='FontName=Arial,FontSize=24,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,Outline=2,Bold=1'" \
  output/acupuncture-ad-final-with-subs.mp4
```

#### Method 2: Upload Separate SRT File

Most platforms (YouTube, Facebook, Instagram) allow uploading SRT files separately:

1. Upload your video
2. Go to captions/subtitles settings
3. Upload `subtitles.srt`
4. Platform will sync automatically

### Editing Subtitles

Edit `subtitles.srt` in any text editor:

```srt
1
00:00:00,000 --> 00:00:12,000
Your subtitle text here

2
00:00:12,000 --> 00:00:20,000
Next subtitle text
```

**Format:**
- Subtitle number
- Start time --> End time
- Text (can be multiple lines)
- Blank line separator

---

## 🎨 Customization

### Change Scene Duration

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

### Modify Scene Content

Edit `scene-generator.js`:

#### Change Text
```javascript
drawTextWithShadow(ctx, 'YOUR NEW TEXT', WIDTH / 2, HEIGHT / 2, 100, 'bold', '#FFD93D');
```

#### Change Colors
```javascript
// Gradient background
const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
gradient.addColorStop(0, '#YOUR_COLOR_1');
gradient.addColorStop(1, '#YOUR_COLOR_2');
```

#### Change Contact Information (Scene 4)

```javascript
// In generateScene4() function
ctx.fillText('YOUR THERAPIST NAME', WIDTH / 2, cardY + 400);
ctx.fillText('YOUR CLINIC NAME', WIDTH / 2, cardY + 550);
ctx.fillText('YOUR PHONE NUMBER', WIDTH / 2, cardY + 710);
```

### Change Video Resolution

#### For Portrait (Instagram Stories)
```javascript
const WIDTH = 1080;
const HEIGHT = 1920;
```

#### For Square (Instagram Feed)
```javascript
const WIDTH = 1080;
const HEIGHT = 1080;
```

---

## 🔧 Troubleshooting

### Video Generation Issues

**Problem:** Canvas errors
```
Solution: Ensure canvas package is installed correctly
npm install canvas --build-from-source
```

**Problem:** FFmpeg not found
```
Solution: FFmpeg is bundled with @ffmpeg-installer/ffmpeg
npm install @ffmpeg-installer/ffmpeg
```

### Audio Issues

**Problem:** Audio not syncing
```
Solution: Check audio file duration matches video (80 seconds)
Use -shortest flag in FFmpeg command
```

**Problem:** Audio quality poor
```
Solution: Increase audio bitrate
-b:a 256k  (instead of 192k)
```

### File Size Issues

**Problem:** Video file too large
```
Solution: Reduce bitrate
videoBitrate: '3000k'  (instead of 5000k)
```

**Problem:** Video quality poor
```
Solution: Increase bitrate
videoBitrate: '8000k'  (instead of 5000k)
```

### Platform-Specific Issues

**Instagram:**
- Max file size: 100 MB
- Max duration: 60 seconds (Feed), 90 seconds (Stories)
- Solution: Trim video or reduce quality

**Facebook:**
- Recommended: H.264 codec, AAC audio
- Max file size: 4 GB
- Solution: Already optimized

**YouTube:**
- Recommended: 1080p or higher
- Max file size: 256 GB
- Solution: Already optimized

---

## 📊 Video Specifications

### Current Output

| Property | Value |
|----------|-------|
| Resolution | 1920x1080 (Full HD) |
| Frame Rate | 30 fps |
| Duration | 80 seconds |
| Video Codec | H.264 |
| Audio Codec | AAC (when audio added) |
| Bitrate | 5000k |
| File Size | ~9.4 MB (video only) |
| Format | MP4 |

### Recommended Specifications by Platform

| Platform | Resolution | Aspect Ratio | Max Size | Max Duration |
|----------|-----------|--------------|----------|--------------|
| YouTube | 1920x1080 | 16:9 | 256 GB | Unlimited |
| Facebook | 1920x1080 | 16:9 | 4 GB | 240 min |
| Instagram Feed | 1080x1080 | 1:1 | 100 MB | 60 sec |
| Instagram Stories | 1080x1920 | 9:16 | 100 MB | 90 sec |
| Twitter/X | 1280x720 | 16:9 | 512 MB | 140 sec |
| TikTok | 1080x1920 | 9:16 | 287.6 MB | 10 min |

---

## 🎯 Marketing Tips

### Posting Strategy

**Week 1: Awareness**
- Post on all platforms
- Use hashtags: #Paralysis #Acupuncture #Recovery #Mumbai
- Boost post with paid ads

**Week 2-4: Engagement**
- Share patient testimonials
- Post behind-the-scenes content
- Answer questions in comments

### Caption Templates

**Instagram:**
```
🌟 PARALYSIS? TIME IS MUSCLE! ⏰

Early acupuncture treatment can make ALL the difference in recovery. 
Don't wait—every moment counts! 💪

📞 Call now: 7506 95 2513
📍 Dr. Subodh Mehta Medical Centre, Khar West, Mumbai

#Paralysis #Acupuncture #Recovery #Mumbai #Healthcare #AlternativeMedicine
```

**Facebook:**
```
Important Message for Paralysis Patients and Their Families

Did you know that starting acupuncture treatment immediately after a paralysis attack can significantly improve recovery outcomes?

At Dr. Subodh Mehta Medical Centre, Amit Sakpal (Acupuncture Therapist) specializes in paralysis treatment using proven acupuncture techniques.

Don't let time slip away—contact us today!

📞 7506 95 2513
📍 Khar West, Mumbai

[Watch our video to learn more]
```

**YouTube:**
```
Title: Paralysis Treatment with Acupuncture | Fast Recovery | Mumbai

Description:
Paralysis or stroke affecting your life or a loved one's? Time is the most critical factor in recovery.

Learn how acupuncture can help:
✅ Awaken dormant nerves
✅ Restore body strength
✅ Accelerate recovery

Contact Amit Sakpal, Acupuncture Therapist
Dr. Subodh Mehta Medical Centre
Khar West, Mumbai
Phone: 7506 95 2513

Timestamps:
0:00 - The Problem
0:20 - The Solution
0:40 - Recovery
1:00 - Contact Information
```

---

## 📞 Support

For technical issues or customization requests, refer to:
- `README.md` - Project overview
- `scene-generator.js` - Scene customization
- `video-assembler.js` - Video processing
- `voiceover-script.txt` - Script and timing

---

**Generated with ❤️ for Acupuncture Clinic**
*Helping patients recover faster through awareness and education*
