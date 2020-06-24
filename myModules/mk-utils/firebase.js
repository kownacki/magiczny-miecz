// todo just take firebase or admin object
export default (_, db, storage) => {
  class Path {
    constructor(doc, field) {
      this.doc = doc;
      this.field = field;
    }
    extend(field) {
      return new Path(this.doc, joinFields([this.field, field]));
    }
  }
  const createPath = (doc, field) => new Path(doc, field);

  const isRootField = (field) => _.includes(field, [undefined, null, '']);

  const joinFields = (fields) => _.join('.', _.filter(_.negate(isRootField), fields));

  const generateUid = (timestamp = Date.now()) => `${timestamp}${_.padCharsStart('0', 9,  _.random(1, 10**9 - 1))}`;

  const get = async (path) => {
    const docData = (await db.doc(path.doc).get()).data() || {};
    return isRootField(path.field) ? docData : _.get(path.field, docData);
  };
  const update = (path, data) => {
    return isRootField(path.field)
      ? db.doc(path.doc).set(data)
      : db.doc(path.doc).set(_.setWith(Object, path.field, data, {}), {mergeFields: [path.field]});
  };

  const createImage = async (blobOrFile) => {
    await import('./mime.min.js');
    const extension = mime.getExtension(blobOrFile.type);
    const name = generateUid() + (extension ? '.' + extension : '');
    const storageRef = storage.ref('images/' + name);
    await storageRef.put(blobOrFile);
    return {name, url: await storageRef.getDownloadURL()};
  };
  const deleteImage = async (imageName) => {
    return storage.ref('images/' + imageName).delete()
  };
  const updateImage = async (path, blobOrFile, oldImageName) => {
    if (oldImageName) deleteImage(oldImageName);
    const image = await createImage(blobOrFile);
    update(path, image);
    return image;
  };

  return {
    Path,
    path: createPath,
    isRootField,
    joinFields,
    generateUid,
    get,
    update,
    createImage,
    deleteImage,
    updateImage,
  }
}
