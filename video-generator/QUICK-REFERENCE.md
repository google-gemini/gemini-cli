# Quick Reference Card

## 🚀 Essential Commands

```bash
# Generate video
npm run generate

# Add audio
npm run add-audio voiceover.mp3 music.mp3

# Create social media formats
npm run create-formats

# Clean output
npm run clean
```

## 📁 Key Files

| File | Purpose |
|------|---------|
| `output/acupuncture-ad-final.mp4` | Main video (9.4 MB) |
| `voiceover-script.txt` | Hindi script with timing |
| `subtitles.srt` | Subtitle file |
| `GUIDE.md` | Complete documentation |

## 🎬 Video Scenes

| Time | Scene | Content |
|------|-------|---------|
| 0-20s | Problem | "PARALYSIS? TIME IS MUSCLE" |
| 20-40s | Solution | "Start Acupuncture IMMEDIATELY" |
| 40-60s | Recovery | "Faster Recovery with Early Treatment" |
| 60-80s | Contact | Amit Sakpal - 7506 95 2513 |

## 📞 Contact Info in Video

- **Name:** Amit Sakpal
- **Clinic:** DR. SUBODH MEHTA MEDICAL CENTRE
- **Location:** Khar West, Mumbai
- **Phone:** 7506 95 2513

## 🎙️ Voiceover Options

### Text-to-Speech
- Google Cloud TTS (hi-IN)
- Amazon Polly (Aditi voice)
- Azure TTS (hi-IN-SwaraNeural)

### Professional Recording
- Fiverr.com
- Upwork.com
- Voices.com

## 🎵 Music Sources

### Free
- YouTube Audio Library
- Free Music Archive
- Incompetech

### Premium
- Epidemic Sound
- Artlist
- AudioJungle

## 📱 Social Media Formats

| Platform | Resolution | Aspect Ratio |
|----------|-----------|--------------|
| YouTube | 1920x1080 | 16:9 |
| Instagram Stories | 1080x1920 | 9:16 |
| Instagram Feed | 1080x1080 | 1:1 |
| Twitter/X | 1280x720 | 16:9 |

## 🎨 Customization

### Change Duration
Edit `index.js` line 45:
```javascript
sceneDuration: 20  // Change to 15 or 25
```

### Change Text
Edit `scene-generator.js`:
- Scene 1: Lines 60-65
- Scene 2: Lines 120-125
- Scene 3: Lines 180-185
- Scene 4: Lines 260-280

### Change Colors
Edit `scene-generator.js`:
- Scene 1: Lines 40-45
- Scene 2: Lines 100-105
- Scene 3: Lines 160-165
- Scene 4: Lines 220-225

## 📊 Video Specs

- **Resolution:** 1920x1080 (Full HD)
- **Duration:** 80 seconds
- **Frame Rate:** 30 fps
- **Format:** MP4 (H.264)
- **Size:** 9.4 MB

## 🎯 Marketing Hashtags

```
#Paralysis #Acupuncture #Recovery #Mumbai
#AlternativeMedicine #Healthcare #Wellness
#ParalysisTreatment #AcupunctureTherapy
```

## 🔧 Troubleshooting

### Video won't generate
```bash
npm install canvas --build-from-source
```

### Audio not syncing
```bash
# Ensure audio is 80 seconds or use -shortest flag
```

### File too large
```javascript
// Reduce bitrate in index.js
videoBitrate: '3000k'
```

## 📚 Documentation

- `README.md` - Quick start
- `GUIDE.md` - Complete guide
- `PROJECT-SUMMARY.md` - Overview
- `QUICK-REFERENCE.md` - This file

## ✅ Checklist

- [ ] Generate base video
- [ ] Record Hindi voiceover
- [ ] Find background music
- [ ] Add audio to video
- [ ] Create social media formats
- [ ] Upload to platforms
- [ ] Add subtitles
- [ ] Monitor engagement

## 🎓 Next Steps

1. **Record voiceover** using `voiceover-script.txt`
2. **Find music** (emotional, professional)
3. **Combine audio** with `npm run add-audio`
4. **Create formats** with `npm run create-formats`
5. **Upload** to YouTube, Facebook, Instagram
6. **Promote** with hashtags and paid ads

---

**Need Help?** Check `GUIDE.md` for detailed instructions.

**Status:** ✅ Video generated successfully!

**Output:** `output/acupuncture-ad-final.mp4` (9.4 MB)
