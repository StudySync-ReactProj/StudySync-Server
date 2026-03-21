const applyIdJsonTransform = (schema) => {
  const transform = function (doc, ret) {
    if (ret && ret._id != null) {
      ret.id = ret._id.toString();
    }
    return ret;
  };

  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform,
  });

  schema.set('toObject', {
    virtuals: true,
    versionKey: false,
    transform,
  });
};

module.exports = {
  applyIdJsonTransform
};