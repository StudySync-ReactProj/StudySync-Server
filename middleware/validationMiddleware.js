const { validationResult } = require('express-validator');

/**
 * Reusable validation middleware that checks for validation errors
 * Returns 400 Bad Request with detailed error list if validation fails
 */
const validate = (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        return res.status(400).json({
            message: 'Validation failed',
            errors: errors.array().map(error => ({
                field: error.path,
                message: error.msg,
                value: error.value
            }))
        });
    }
    
    next();
};

module.exports = { validate };
