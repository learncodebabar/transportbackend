const tf = require('@tensorflow/tfjs-node');
const cv = require('opencv4nodejs');

class HandDetectionService {
  constructor() {
    this.model = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      // Load pre-trained hand detection model
      // Using MediaPipe or TensorFlow Lite model
      this.model = await tf.loadGraphModel('file://./models/hand-detection/model.json');
      this.initialized = true;
      console.log('✅ Hand detection model loaded');
    } catch (error) {
      console.error('Failed to load hand detection model:', error);
      // Fallback to basic detection
      this.initialized = false;
    }
  }

  async detectHands(imageBuffer) {
    try {
      if (this.initialized && this.model) {
        return await this.detectWithAI(imageBuffer);
      }
      return await this.detectWithOpenCV(imageBuffer);
    } catch (error) {
      console.error('Hand detection error:', error);
      return { isHand: false, confidence: 0, error: error.message };
    }
  }

  async detectWithAI(imageBuffer) {
    // Convert buffer to tensor
    const imageTensor = tf.node.decodeImage(imageBuffer, 3);
    const resized = tf.image.resizeBilinear(imageTensor, [224, 224]);
    const normalized = resized.div(255.0);
    const batched = normalized.expandDims(0);
    
    const predictions = await this.model.predict(batched).data();
    
    const confidence = predictions[0];
    const isHand = confidence > 0.7;
    
    // Cleanup
    imageTensor.dispose();
    resized.dispose();
    normalized.dispose();
    batched.dispose();
    
    return {
      isHand,
      confidence: Math.round(confidence * 100),
      method: 'ai'
    };
  }

  async detectWithOpenCV(imageBuffer) {
    try {
      // Convert buffer to OpenCV matrix
      const mat = await cv.imdecodeAsync(imageBuffer);
      const gray = await mat.cvtColor(cv.COLOR_BGR2GRAY);
      
      // Use skin color detection
      const hsv = await mat.cvtColor(cv.COLOR_BGR2HSV);
      const lowerSkin = new cv.Vec(0, 20, 70);
      const upperSkin = new cv.Vec(20, 255, 255);
      const skinMask = await hsv.inRange(lowerSkin, upperSkin);
      
      // Find contours
      const contours = await skinMask.findContours(cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      
      // Analyze contours for hand-like shapes
      let isHand = false;
      let maxArea = 0;
      
      for (const contour of contours) {
        const area = await contour.area();
        const hull = await contour.convexHull();
        const hullArea = await hull.area();
        const solidity = area / hullArea;
        
        // Hand characteristics
        if (area > 5000 && solidity > 0.6 && solidity < 0.9) {
          maxArea = Math.max(maxArea, area);
          isHand = true;
        }
      }
      
      const confidence = isHand ? Math.min(90, Math.round(maxArea / 1000)) : 0;
      
      // Cleanup
      mat.delete();
      gray.delete();
      hsv.delete();
      skinMask.delete();
      
      return {
        isHand,
        confidence: Math.min(confidence, 85),
        method: 'opencv'
      };
    } catch (error) {
      return { isHand: false, confidence: 0, error: error.message, method: 'opencv' };
    }
  }

  // Verify image quality
  async verifyImageQuality(imageBuffer) {
    try {
      const mat = await cv.imdecodeAsync(imageBuffer);
      const gray = await mat.cvtColor(cv.COLOR_BGR2GRAY);
      
      // Check blurriness using Laplacian variance
      const laplacian = await gray.laplacian(cv.CV_64F);
      const mean = await laplacian.mean();
      const variance = mean[0];
      
      const isBlurry = variance < 100;
      
      // Check brightness
      const brightness = await gray.mean();
      const isTooDark = brightness[0] < 50;
      const isTooBright = brightness[0] > 200;
      
      // Check resolution
      const width = mat.cols;
      const height = mat.rows;
      const isLowResolution = width < 640 || height < 480;
      
      mat.delete();
      gray.delete();
      laplacian.delete();
      
      return {
        isBlurry,
        isTooDark,
        isTooBright,
        isLowResolution,
        quality: isBlurry || isTooDark || isTooBright || isLowResolution ? 'poor' : 'good'
      };
    } catch (error) {
      return { quality: 'unknown', error: error.message };
    }
  }
}

module.exports = new HandDetectionService();