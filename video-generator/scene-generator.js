import { createCanvas, loadImage, registerFont } from 'canvas';
import fs from 'fs';
import path from 'path';

const WIDTH = 1920;
const HEIGHT = 1080;

// Helper function to wrap text
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + ' ' + word).width;
    if (width < maxWidth) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}

// Helper function to draw text with shadow
function drawTextWithShadow(ctx, text, x, y, fontSize, fontWeight = 'bold', color = '#FFFFFF') {
  ctx.font = `${fontWeight} ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 15;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;
  
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  
  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

// Scene 1: The Problem - Patient struggling with paralysis
export async function generateScene1(outputPath) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Dark gradient background
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(1, '#16213e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Add vignette effect
  const vignette = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 200, WIDTH / 2, HEIGHT / 2, 1000);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Draw wheelchair icon (simplified)
  ctx.strokeStyle = '#888888';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(WIDTH / 2 - 100, HEIGHT / 2 + 50, 80, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.arc(WIDTH / 2 + 100, HEIGHT / 2 + 50, 80, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.strokeStyle = '#666666';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 - 100, HEIGHT / 2 + 50);
  ctx.lineTo(WIDTH / 2 + 100, HEIGHT / 2 + 50);
  ctx.stroke();

  // Main text
  drawTextWithShadow(ctx, 'PARALYSIS?', WIDTH / 2, HEIGHT / 2 - 200, 120, 'bold', '#FF6B6B');
  
  // Subtitle with urgency
  drawTextWithShadow(ctx, 'TIME IS MUSCLE', WIDTH / 2, HEIGHT / 2 - 80, 90, 'bold', '#FFD93D');

  // Bottom text
  ctx.font = 'italic 40px Arial';
  ctx.fillStyle = '#CCCCCC';
  ctx.textAlign = 'center';
  ctx.fillText('Every moment counts in recovery...', WIDTH / 2, HEIGHT - 100);

  // Save
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`✓ Scene 1 generated: ${outputPath}`);
}

// Scene 2: The Solution - Acupuncture treatment
export async function generateScene2(outputPath) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Teal gradient background (clinic branding)
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, '#0d7377');
  gradient.addColorStop(0.5, '#14FFEC');
  gradient.addColorStop(1, '#0d7377');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Add overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Draw acupuncture needles (simplified representation)
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 4;
  
  const needlePositions = [
    [WIDTH / 2 - 200, HEIGHT / 2 - 100],
    [WIDTH / 2 - 100, HEIGHT / 2 - 50],
    [WIDTH / 2, HEIGHT / 2],
    [WIDTH / 2 + 100, HEIGHT / 2 - 50],
    [WIDTH / 2 + 200, HEIGHT / 2 - 100]
  ];

  needlePositions.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 150);
    ctx.stroke();
    
    // Needle head
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
  });

  // Healing hands illustration
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(WIDTH / 2 - 150, HEIGHT / 2 + 200, 60, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.arc(WIDTH / 2 + 150, HEIGHT / 2 + 200, 60, 0, Math.PI * 2);
  ctx.stroke();

  // Main text
  drawTextWithShadow(ctx, 'THE SOLUTION', WIDTH / 2, 150, 70, 'bold', '#FFFFFF');
  drawTextWithShadow(ctx, 'Start Acupuncture', WIDTH / 2, HEIGHT / 2 - 250, 100, 'bold', '#FFD93D');
  drawTextWithShadow(ctx, 'IMMEDIATELY', WIDTH / 2, HEIGHT / 2 - 150, 100, 'bold', '#FFD93D');

  // Bottom text
  ctx.font = 'bold 45px Arial';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText('Proven. Effective. Life-Changing.', WIDTH / 2, HEIGHT - 100);

  // Save
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`✓ Scene 2 generated: ${outputPath}`);
}

// Scene 3: Recovery - Patient improving
export async function generateScene3(outputPath) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Bright, hopeful gradient
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, '#56ab2f');
  gradient.addColorStop(1, '#a8e063');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Add light overlay
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Draw rising person (simplified stick figure improving)
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 12;
  
  // Head
  ctx.beginPath();
  ctx.arc(WIDTH / 2, HEIGHT / 2 - 150, 60, 0, Math.PI * 2);
  ctx.stroke();
  
  // Body
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2, HEIGHT / 2 - 90);
  ctx.lineTo(WIDTH / 2, HEIGHT / 2 + 100);
  ctx.stroke();
  
  // Arms (raised in victory)
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2, HEIGHT / 2 - 50);
  ctx.lineTo(WIDTH / 2 - 120, HEIGHT / 2 - 150);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2, HEIGHT / 2 - 50);
  ctx.lineTo(WIDTH / 2 + 120, HEIGHT / 2 - 150);
  ctx.stroke();
  
  // Legs
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2, HEIGHT / 2 + 100);
  ctx.lineTo(WIDTH / 2 - 80, HEIGHT / 2 + 250);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2, HEIGHT / 2 + 100);
  ctx.lineTo(WIDTH / 2 + 80, HEIGHT / 2 + 250);
  ctx.stroke();

  // Success stars
  for (let i = 0; i < 8; i++) {
    const x = 200 + Math.random() * (WIDTH - 400);
    const y = 100 + Math.random() * 300;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 60px Arial';
    ctx.fillText('★', x, y);
  }

  // Main text
  drawTextWithShadow(ctx, 'RECOVERY', WIDTH / 2, 150, 90, 'bold', '#FFFFFF');
  drawTextWithShadow(ctx, 'Faster Recovery with', WIDTH / 2, HEIGHT - 250, 70, 'bold', '#FFFFFF');
  drawTextWithShadow(ctx, 'Early Treatment', WIDTH / 2, HEIGHT - 150, 80, 'bold', '#FFD93D');

  // Save
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`✓ Scene 3 generated: ${outputPath}`);
}

// Scene 4: Call to Action - Contact details
export async function generateScene4(outputPath) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Professional teal background
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, '#0d7377');
  gradient.addColorStop(1, '#323232');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Card background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 10;
  
  const cardX = WIDTH / 2 - 700;
  const cardY = HEIGHT / 2 - 400;
  const cardWidth = 1400;
  const cardHeight = 800;
  
  ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 20);
  ctx.fill();
  
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // SAA Logo circle
  ctx.fillStyle = '#FFB800';
  ctx.beginPath();
  ctx.arc(WIDTH / 2, cardY + 150, 100, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 80px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('SAA', WIDTH / 2, cardY + 170);

  // Title
  ctx.fillStyle = '#0d7377';
  ctx.font = 'bold 60px Arial';
  ctx.fillText('Contact Us Today', WIDTH / 2, cardY + 300);

  // Therapist name
  ctx.fillStyle = '#323232';
  ctx.font = 'bold 70px Arial';
  ctx.fillText('Amit Sakpal', WIDTH / 2, cardY + 400);
  
  ctx.font = '45px Arial';
  ctx.fillStyle = '#666666';
  ctx.fillText('Acupuncture Therapist', WIDTH / 2, cardY + 460);

  // Clinic name
  ctx.font = 'bold 50px Arial';
  ctx.fillStyle = '#0d7377';
  ctx.fillText('DR. SUBODH MEHTA MEDICAL CENTRE', WIDTH / 2, cardY + 550);
  
  ctx.font = '40px Arial';
  ctx.fillStyle = '#666666';
  ctx.fillText('Khar West, Mumbai', WIDTH / 2, cardY + 610);

  // Phone number (highlighted)
  ctx.fillStyle = '#FF6B6B';
  ctx.fillRect(WIDTH / 2 - 300, cardY + 650, 600, 100);
  
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 70px Arial';
  ctx.fillText('7506 95 2513', WIDTH / 2, cardY + 710);

  // Bottom tagline
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'italic 50px Arial';
  ctx.fillText('Your Journey to Recovery Starts Here', WIDTH / 2, HEIGHT - 80);

  // Save
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`✓ Scene 4 generated: ${outputPath}`);
}

// Generate all scenes
export async function generateAllScenes(outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  await generateScene1(path.join(outputDir, 'scene1.png'));
  await generateScene2(path.join(outputDir, 'scene2.png'));
  await generateScene3(path.join(outputDir, 'scene3.png'));
  await generateScene4(path.join(outputDir, 'scene4.png'));

  console.log('\n✓ All scenes generated successfully!');
}
