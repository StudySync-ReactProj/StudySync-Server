const applyIdJsonTransform = (schema) => {
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) {
      ret.id = ret._id;
      return ret;
    }
  });
};

module.exports = {
  applyIdJsonTransform
};