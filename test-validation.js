// Test file to verify validation middleware works correctly
// Run this after starting the server to test validation

const validationTests = {
  
  // Test 1: Invalid Registration - Email format
  invalidEmail: {
    endpoint: 'POST /api/users/register',
    body: {
      username: 'testuser',
      email: 'not-an-email',
      password: 'password123'
    },
    expectedStatus: 400,
    expectedError: 'Please provide a valid email address'
  },

  // Test 2: Invalid Registration - Password too short
  shortPassword: {
    endpoint: 'POST /api/users/register',
    body: {
      username: 'testuser',
      email: 'test@example.com',
      password: '123'
    },
    expectedStatus: 400,
    expectedError: 'Password must be at least 6 characters long'
  },

  // Test 3: Valid Registration
  validRegistration: {
    endpoint: 'POST /api/users/register',
    body: {
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123'
    },
    expectedStatus: 201
  },

  // Test 4: Invalid Task - Empty title
  emptyTaskTitle: {
    endpoint: 'POST /api/tasks',
    body: {
      title: '',
      priority: 'High'
    },
    expectedStatus: 400,
    expectedError: 'Task title is required'
  },

  // Test 5: Invalid Task - Wrong priority
  invalidPriority: {
    endpoint: 'POST /api/tasks',
    body: {
      title: 'My Task',
      priority: 'UltraHigh'
    },
    expectedStatus: 400,
    expectedError: 'Priority must be one of: Low, Medium, High, Critical'
  },

  // Test 6: Valid Task
  validTask: {
    endpoint: 'POST /api/tasks',
    body: {
      title: 'Complete assignment',
      priority: 'High',
      taskNotes: 'Due next week'
    },
    expectedStatus: 201
  },

  // Test 7: Invalid Login - Missing password
  missingPassword: {
    endpoint: 'POST /api/users/login',
    body: {
      email: 'test@example.com',
      password: ''
    },
    expectedStatus: 400,
    expectedError: 'Password is required'
  },

  // Test 8: Multiple validation errors
  multipleErrors: {
    endpoint: 'POST /api/users/register',
    body: {
      username: 'a',
      email: 'invalid',
      password: '123'
    },
    expectedStatus: 400,
    expectedErrors: [
      'Please provide a valid email address',
      'Password must be at least 6 characters long',
      'Username must be at least 2 characters long'
    ]
  }
};

console.log('Validation Test Cases Defined');
console.log('Use tools like Postman, curl, or Thunder Client to test these endpoints');
console.log('\nExample curl command:');
console.log('curl -X POST http://localhost:5000/api/users/register \\');
console.log('  -H "Content-Type: application/json" \\');
console.log('  -d \'{"username":"a","email":"invalid","password":"123"}\'');
console.log('\nExpected response: 400 Bad Request with detailed validation errors');

module.exports = validationTests;
