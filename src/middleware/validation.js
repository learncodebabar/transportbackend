const Joi = require('joi');

// Validation schemas
const schemas = {
  updateRiderProfile: Joi.object({
    name: Joi.string().min(2).max(50),
    phone: Joi.string().pattern(/^[0-9]{10,15}$/),
    profileImage: Joi.string().uri(),
  }),
  
  updateVehicleInfo: Joi.object({
    vehicleType: Joi.string().valid('bike', 'auto', 'car'),
    vehicleModel: Joi.string().min(2).max(50),
    vehicleNumber: Joi.string().min(4).max(20),
    vehicleColor: Joi.string().min(2).max(30),
  }),
  
  updateRiderLocation: Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required(),
    address: Joi.string().optional(),
  }),
};

// Validation middleware factory
const validate = (schema) => {
  return (req, res, next) => {
    if (!schemas[schema]) {
      return next();
    }
    
    const { error } = schemas[schema].validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }
    next();
  };
};

const validateId = (req, res, next) => {
  const { id } = req.params;
  if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format',
    });
  }
  next();
};

module.exports = { validate, validateId };