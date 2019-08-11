
require('@tensorflow/tfjs-node');
const faceapi = require('face-api.js');
const canvas = require('canvas');
const fs = require('fs');

// patch nodejs environment, we need to provide an implementation of
// HTMLCanvasElement and HTMLImageElement, additionally an implementation
// of ImageData is required, in case you want to use the MTCNN
const { Canvas, Image, ImageData } = canvas
faceapi.env.monkeyPatch({ Canvas, Image, ImageData })


const faceDetectionNet = faceapi.nets.ssdMobilenetv1;
// const faceDetectionNet = faceapi.nets.tinyFaceDetector;
// export const faceDetectionNet = mtcnn

// SsdMobilenetv1Options
const minConfidence = 0.5;

// TinyFaceDetectorOptions
const inputSize = 320;
const scoreThreshold = 0.5;

let options = new faceapi.SsdMobilenetv1Options({ minConfidence });
// let options = new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold })
let INIT = 0;
let fileIdx = 0;
let unknownIdx = 0;
let labels = {};
let faceMatcher;

fs.watch(__dirname + '/labels.json', (eventType, filename) => {
  console.log(`labels.json changed: ${eventType} ${filename}`);
  init();
});


function getFilePath(idx) {
  return __dirname + '/photolib/' + String(idx).padStart(4, 0) + '.jpg';
}

function savePhoto(canvas) {

  while (fs.existsSync(getFilePath(fileIdx))) {
    fileIdx++;
  }

  while ('unknown' + String(unknownIdx).padStart(4, 0) in labels) {
    unknownIdx++;
  }
  labels['unknown' + String(unknownIdx).padStart(4, 0)] = [fileIdx];
  fs.writeFileSync(__dirname + '/labels.json', JSON.stringify(labels));

  fs.writeFileSync(getFilePath(fileIdx), canvas.toBuffer('image/jpeg'));
  fileIdx++;
}

async function init() {

  INIT = 1;
  await faceDetectionNet.loadFromDisk(__dirname + '/weights');
  await faceapi.nets.faceLandmark68Net.loadFromDisk(__dirname + '/weights')
  await faceapi.nets.faceRecognitionNet.loadFromDisk(__dirname + '/weights')
  // await faceapi.nets.faceLandmark68TinyNet.loadFromDisk(__dirname + '/weights')
  // await faceapi.nets.ssdMobilenetv1.loadFromDisk(__dirname + '/weights')



  let rawdata = fs.readFileSync(__dirname + '/labels.json');
  labels = JSON.parse(rawdata);

  let labeledDescriptors = [];
  for (let person in labels) {
    let descriptors = [];
    for (let idx of labels[person]) {
      try {
        const queryImage = await canvas.loadImage(getFilePath(idx));
        const res = await faceapi
          .detectSingleFace(queryImage)
          .withFaceLandmarks()
          .withFaceDescriptor();
        descriptors.push(res.descriptor);
      } catch (e){
        console.log(getFilePath(idx));
        console.log(e);
      }
    }
    if (descriptors.length){
      labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(person, descriptors));
    }
  }

  faceMatcher = new faceapi.FaceMatcher(labeledDescriptors);
  console.log('face-api Ready!')
  INIT = 2;
}


async function recFace(buffer, cb) {
  // INIT = 0: No init, 1: Initilizating, 2, Initialized
  if (!INIT) {
    await init();
  } else if (INIT == 1) {
    return;
  }
  const img = await canvas.loadImage(buffer);
  let detections = await faceapi
    .detectAllFaces(img, options)
    .withFaceLandmarks()
    .withFaceDescriptors();

  let found = new Set();


  detections.forEach(async detect => {
    let bestMatch = faceMatcher.findBestMatch(detect.descriptor);

    // console.log(faceMatcher);
    // console.log(faceMatcher.matchDescriptor(fd.descriptor));
    if (bestMatch.label !== 'unknown') {
      found.add(bestMatch.label);
    } else {
      let face = detect.detection;
      let { width, height } = face.box;
      if (height < 150) return;

      let ptDiff = new faceapi.Point(0, 0);
      let landmark = detect.landmarks;
      landmark.getLeftEye().forEach(pt => ptDiff = ptDiff.add(pt))
      landmark.getRightEye().forEach(pt => ptDiff = ptDiff.sub(pt))

      let xdiff = Math.abs(ptDiff.x / width / 6 * 100);
      let ydiff = Math.abs(ptDiff.y / height / 6 * 100)

      if (xdiff > 40 && ydiff < 3) {
        
        let x = Math.max(0, face.box.x - width*0.1)/face.imageWidth;
        let y = Math.max(0, face.box.y - height*0.1)/face.imageHeight;
        let w = Math.min(face.imageWidth, width*1.2)/face.imageWidth;
        let h = Math.min(face.imageHeight, height*1.2)/face.imageHeight;
        let rect = new faceapi.Rect(x, y, w, h);
        let largeFace = new faceapi.FaceDetection(face.score, rect, face.imageDims);
        
        let canvas = await faceapi.extractFaces(img, [largeFace]);
        savePhoto(canvas[0]);
        console.log('new phto added!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
      }
    }
  })


  // if (newFace && detections) {
  //   for (let i = 0; i < detections.length; i++) {
  //     let face = detections[i].detection;
  //     let landmark = detections[i].landmarks;

  //     let { width, height } = face.box;
  //     let ptDiff = new faceapi.Point(0, 0);
  //     landmark.getLeftEye().forEach(pt => ptDiff = ptDiff.add(pt))
  //     landmark.getRightEye().forEach(pt => ptDiff = ptDiff.sub(pt))

  //     let xdiff = Math.abs(ptDiff.x / width / 6 * 100);
  //     let ydiff = Math.abs(ptDiff.y / height / 6 * 100)

  //     if (height > 150 && xdiff > 40 && ydiff < 3) {
  //       let canvas = await faceapi.extractFaces(img, [face]);
  //       savePhoto(canvas[0]);
  //       console.log('new phto added!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
  //     }
  //   }
  // }
  cb(found);

}


module.exports = { recFace };

