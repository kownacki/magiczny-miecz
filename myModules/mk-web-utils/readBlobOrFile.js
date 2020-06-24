export default (blobOrFile) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = (event) => resolve(event.target.result);
  reader.readAsDataURL(blobOrFile);
});
