const calculateNewSize = (fit, maxWidth, maxHeight, srcWidth, srcHeight) => {
  let newSize;
  if (fit === 'cover') {
    newSize = {
      width: Math.min(srcWidth, maxWidth),
      height: Math.min(srcHeight, maxHeight),
    }
  } else { // 'scale-down'
    // Calculate biggest new size that keeps aspect ratio and fits
    const resizeRatio = Math.min(maxWidth / srcWidth, maxHeight / srcHeight, 1);
    newSize = {width: srcWidth * resizeRatio, height: srcHeight * resizeRatio};
  }
  return newSize;
};
const cropWithAspectRatio = (newWidth, newHeight, srcWidth, srcHeight) => {
  const resizeRatio = Math.min(srcWidth / newWidth, srcHeight / newHeight);
  const cropSize = {
    width: newWidth * resizeRatio,
    height: newHeight * resizeRatio,
  };
  return {
    ...cropSize,
    x: (srcWidth - cropSize.width) / 2,
    y: (srcHeight - cropSize.height) / 2
  }
};
const calculateCropAndResize = (fit, maxWidth, maxHeight, srcWidth, srcHeight) => {
  const newSize = calculateNewSize(fit, maxWidth, maxHeight, srcWidth, srcHeight);
  return {
    newSize,
    crop: fit === 'cover'
      ? cropWithAspectRatio(newSize.width, newSize.height, srcWidth, srcHeight)
      // 'scale-down'
      : {x: 0, y: 0, width: srcWidth, height: srcHeight},
  };
};

// Returns promise with data URL containing resized and compressed image
// Based on goo.gl/DEP8Y
// fit - 'cover' or 'scale-down'
// quality - Quality of compressed jpeg image. Number between 0 and 1
export default async (fit = 'scale-down', maxWidth = Infinity, maxHeight = Infinity, quality, imageFile) => {
  const img = document.createElement('img');
  const canvas = document.createElement('canvas');
  img.src = URL.createObjectURL(imageFile);
  await new Promise((resolve) => img.addEventListener('load', resolve));
  const cropAndResize = calculateCropAndResize(fit, maxWidth, maxHeight, img.width, img.height);
  Object
    .assign(canvas, cropAndResize.newSize)
    .getContext('2d')
    .drawImage(img,
      ...[cropAndResize.crop.x, cropAndResize.crop.y, cropAndResize.crop.width, cropAndResize.crop.height],
      0, 0, canvas.width, canvas.height,
    );
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
};
