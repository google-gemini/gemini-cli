/**
 * Vision Integration - Multi-modal capabilities for screenshot-based instructions
 *
 * Enables AI Builder to understand screenshots, mockups, and visual references
 * for more intuitive page building.
 *
 * @package     AI Builder
 * @version     5.0.0
 * @author      AI Builder Team
 */

(function() {
    'use strict';

    console.log('[Vision Integration] Loading...');

    /**
     * Vision Integration Class
     */
    class VisionIntegration {
        constructor() {
            this.supportedFormats = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
            this.maxFileSize = 5 * 1024 * 1024; // 5MB
            this.uploadedImages = [];

            console.log('[Vision Integration] Initialized');
            console.log('Supported formats:', this.supportedFormats);
        }

        /**
         * Process image with vision-capable LLM
         * @param {File|string} image - Image file or base64 string
         * @param {string} instruction - User's instruction about what to build
         * @returns {Promise<Object>} Analysis and action plan
         */
        async processImageWithInstruction(image, instruction) {
            console.group('🖼️ [Vision Integration] Processing Image');
            console.log('Instruction:', instruction);

            try {
                // Convert image to base64 if needed
                const base64Image = await this.imageToBase64(image);

                // Build vision prompt
                const visionPrompt = this.buildVisionPrompt(instruction);

                // Call vision-capable LLM
                const analysis = await this.callVisionLLM(base64Image, visionPrompt);

                console.log('✅ Vision analysis complete');
                console.groupEnd();

                return {
                    success: true,
                    analysis: analysis,
                    image: base64Image
                };

            } catch (error) {
                console.error('❌ Vision processing failed:', error);
                console.groupEnd();
                throw error;
            }
        }

        /**
         * Analyze page screenshot and suggest improvements
         * @param {string} base64Image - Screenshot of current page
         * @returns {Promise<Object>} Suggestions
         */
        async analyzePageScreenshot(base64Image) {
            console.log('[Vision Integration] Analyzing page screenshot...');

            const prompt = `Analyze this webpage screenshot and provide:
1. What elements are present
2. Layout structure assessment
3. Design quality evaluation (1-10)
4. Specific improvement suggestions
5. Missing elements that should be added

Respond with JSON:
{
  "elements": ["list of detected elements"],
  "layout": "description of layout structure",
  "designScore": 1-10,
  "strengths": ["list of good aspects"],
  "weaknesses": ["list of issues"],
  "suggestions": [
    {
      "type": "add|edit|remove|style",
      "target": "element description",
      "reason": "why this would improve the page",
      "priority": "high|medium|low"
    }
  ]
}`;

            try {
                const analysis = await this.callVisionLLM(base64Image, prompt);
                return JSON.parse(analysis);
            } catch (error) {
                console.error('Screenshot analysis failed:', error);
                throw error;
            }
        }

        /**
         * Compare two screenshots (before/after)
         * @param {string} beforeImage - Screenshot before changes
         * @param {string} afterImage - Screenshot after changes
         * @returns {Promise<Object>} Comparison result
         */
        async compareScreenshots(beforeImage, afterImage) {
            console.log('[Vision Integration] Comparing screenshots...');

            const prompt = `Compare these two webpage screenshots (before and after).
Identify what changed and evaluate if the changes improved the design.

Respond with JSON:
{
  "changes": ["list of detected changes"],
  "improved": true/false,
  "improvements": ["list of improvements"],
  "regressions": ["list of things that got worse"],
  "score": {
    "before": 1-10,
    "after": 1-10
  },
  "feedback": "overall assessment"
}`;

            try {
                const comparison = await this.callVisionLLM(
                    [beforeImage, afterImage],
                    prompt
                );
                return JSON.parse(comparison);
            } catch (error) {
                console.error('Screenshot comparison failed:', error);
                throw error;
            }
        }

        /**
         * Extract design patterns from reference image
         * @param {string} referenceImage - Reference design to replicate
         * @returns {Promise<Object>} Design specifications
         */
        async extractDesignPattern(referenceImage) {
            console.log('[Vision Integration] Extracting design pattern...');

            const prompt = `Analyze this design and extract detailed specifications
that can be used to recreate it using YOOtheme Page Builder.

Identify:
1. Overall layout structure (sections, rows, columns)
2. Element types and their content
3. Color scheme
4. Typography (font sizes, weights)
5. Spacing and alignment
6. Visual hierarchy
7. Interactive elements (buttons, forms, etc.)

Respond with JSON:
{
  "layout": {
    "sections": [
      {
        "type": "hero|content|cta|etc",
        "elements": [
          {
            "type": "headline|text|button|image|etc",
            "content": "text content if visible",
            "style": {
              "fontSize": "size",
              "fontWeight": "weight",
              "color": "#hex",
              "alignment": "left|center|right"
            },
            "position": "relative position"
          }
        ]
      }
    ]
  },
  "colors": {
    "primary": "#hex",
    "secondary": "#hex",
    "accent": "#hex",
    "background": "#hex",
    "text": "#hex"
  },
  "typography": {
    "headingFont": "font name or type",
    "bodyFont": "font name or type",
    "sizes": {
      "h1": "size",
      "h2": "size",
      "body": "size"
    }
  },
  "spacing": {
    "sectionPadding": "size",
    "elementMargin": "size"
  }
}`;

            try {
                const specs = await this.callVisionLLM(referenceImage, prompt);
                return JSON.parse(specs);
            } catch (error) {
                console.error('Design pattern extraction failed:', error);
                throw error;
            }
        }

        /**
         * Take screenshot of current page
         * @returns {Promise<string>} Base64 screenshot
         */
        async captureCurrentPage() {
            console.log('[Vision Integration] Capturing page screenshot...');

            // Try to use native screenshot API
            if ('getDisplayMedia' in navigator.mediaDevices) {
                try {
                    const stream = await navigator.mediaDevices.getDisplayMedia({
                        video: { mediaSource: 'screen' }
                    });

                    const video = document.createElement('video');
                    video.srcObject = stream;
                    await video.play();

                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(video, 0, 0);

                    stream.getTracks().forEach(track => track.stop());

                    return canvas.toDataURL('image/png');

                } catch (error) {
                    console.warn('Native screenshot failed:', error);
                }
            }

            // Fallback: Try html2canvas if available
            if (window.html2canvas) {
                try {
                    const canvas = await html2canvas(document.body);
                    return canvas.toDataURL('image/png');
                } catch (error) {
                    console.error('html2canvas screenshot failed:', error);
                    throw new Error('Screenshot capture failed');
                }
            }

            throw new Error('No screenshot method available. Install html2canvas library.');
        }

        /**
         * Build vision prompt for LLM
         * @param {string} instruction - User instruction
         * @returns {string} Formatted prompt
         */
        buildVisionPrompt(instruction) {
            return `You are an expert web designer analyzing an image to help build a webpage.

USER INSTRUCTION: ${instruction}

Analyze the image and generate a detailed action plan to create this design using YOOtheme Page Builder.

Respond with JSON:
{
  "understanding": "brief description of what you see",
  "intent": "what the user wants to build",
  "sections": [
    {
      "type": "section type",
      "elements": [
        {
          "type": "element type",
          "content": "content to use",
          "style": "styling details",
          "position": "where to place"
        }
      ]
    }
  ],
  "colors": {
    "primary": "#hex",
    "secondary": "#hex"
  },
  "recommendations": ["list of recommendations for best implementation"],
  "estimatedComplexity": "low|medium|high"
}

Analyze the image carefully and create a complete implementation plan.`;
        }

        /**
         * Call vision-capable LLM API
         * @param {string|Array<string>} images - Base64 image(s)
         * @param {string} prompt - Vision prompt
         * @returns {Promise<string>} LLM response
         */
        async callVisionLLM(images, prompt) {
            console.log('[Vision Integration] Calling vision LLM...');

            // Normalize to array
            const imageArray = Array.isArray(images) ? images : [images];

            // Call backend API
            const response = await fetch('/index.php?option=com_ajax&plugin=ai_builder&format=json&task=processVision', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    images: imageArray,
                    prompt: prompt,
                    maxTokens: 2000
                })
            });

            if (!response.ok) {
                throw new Error(`Vision API error: ${response.status}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.message || 'Vision processing failed');
            }

            return data.data.response;
        }

        /**
         * Convert image to base64
         * @param {File|string} image - Image file or URL
         * @returns {Promise<string>} Base64 string
         */
        async imageToBase64(image) {
            if (typeof image === 'string') {
                // Already base64 or data URL
                if (image.startsWith('data:')) {
                    return image;
                }
                // URL - need to fetch and convert
                return await this.urlToBase64(image);
            }

            // File object
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(image);
            });
        }

        /**
         * Convert URL to base64
         * @param {string} url - Image URL
         * @returns {Promise<string>} Base64 string
         */
        async urlToBase64(url) {
            const response = await fetch(url);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }

        /**
         * Validate image file
         * @param {File} file - Image file to validate
         * @returns {Object} Validation result
         */
        validateImage(file) {
            const errors = [];

            if (!this.supportedFormats.includes(file.type)) {
                errors.push(`Unsupported format: ${file.type}. Supported: ${this.supportedFormats.join(', ')}`);
            }

            if (file.size > this.maxFileSize) {
                errors.push(`File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Max: ${this.maxFileSize / 1024 / 1024}MB`);
            }

            return {
                valid: errors.length === 0,
                errors: errors
            };
        }

        /**
         * Create file input for image upload
         * @param {Function} callback - Called when image is selected
         * @returns {HTMLElement} File input element
         */
        createImageInput(callback) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = this.supportedFormats.join(',');
            input.style.display = 'none';

            input.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const validation = this.validateImage(file);
                if (!validation.valid) {
                    callback({ error: validation.errors.join(', ') });
                    return;
                }

                try {
                    const base64 = await this.imageToBase64(file);
                    this.uploadedImages.push({
                        file: file,
                        base64: base64,
                        timestamp: new Date().toISOString()
                    });
                    callback({ success: true, base64: base64, file: file });
                } catch (error) {
                    callback({ error: error.message });
                }
            });

            return input;
        }

        /**
         * Get usage statistics
         * @returns {Object} Usage stats
         */
        getStats() {
            return {
                uploadedImages: this.uploadedImages.length,
                totalSize: this.uploadedImages.reduce((sum, img) =>
                    sum + (img.file?.size || 0), 0),
                supportedFormats: this.supportedFormats,
                maxFileSize: this.maxFileSize
            };
        }

        /**
         * Clear uploaded images
         */
        clearImages() {
            this.uploadedImages = [];
            console.log('[Vision Integration] Cleared all uploaded images');
        }
    }

    // Make available globally
    window.VisionIntegration = new VisionIntegration();

    console.log('✅ Vision Integration loaded');
    console.log('🎨 Multi-modal capabilities enabled');
    console.log('📸 Usage:');
    console.log('  VisionIntegration.processImageWithInstruction(image, "build this page")');
    console.log('  VisionIntegration.analyzePageScreenshot(screenshot)');
    console.log('  VisionIntegration.extractDesignPattern(referenceImage)');

    // Dispatch ready event
    window.dispatchEvent(new CustomEvent('vision-integration-ready', {
        detail: {
            version: '5.0.0',
            capabilities: [
                'screenshot analysis',
                'design pattern extraction',
                'before/after comparison',
                'image-to-layout conversion'
            ]
        }
    }));

})();
