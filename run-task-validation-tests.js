// Advanced Test: Task Validation with Authentication
// This demonstrates how validation works with protected routes

const http = require('http');

const BASE_URL = 'http://localhost:3000';

function makeRequest(method, path, body, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const headers = {
            'Content-Type': 'application/json',
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: method,
            headers: headers
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode,
                        data: JSON.parse(data)
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        data: data
                    });
                }
            });
        });

        req.on('error', reject);
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runTaskTests() {
    console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║         TASK VALIDATION TEST (WITH AUTHENTICATION)               ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

    try {
        // Step 1: Register a new user to get authentication token
        console.log('📝 Step 1: Creating test user and obtaining JWT token...\n');
        const registerPayload = {
            username: `tasktest_${Date.now()}`,
            email: `tasktest_${Date.now()}@example.com`,
            password: 'testpass123'
        };
        
        const registerResponse = await makeRequest('POST', '/api/users/register', registerPayload);
        
        if (registerResponse.status !== 201) {
            console.error('❌ Failed to register user:', registerResponse.data);
            return;
        }
        
        const token = registerResponse.data.token;
        console.log('✅ User registered successfully');
        console.log(`🔑 JWT Token obtained: ${token.substring(0, 30)}...`);
        console.log(`👤 Username: ${registerResponse.data.username}\n`);

        // Step 2: Test empty task title (should fail validation)
        console.log('======================================================================');
        console.log('TEST 1: Empty Task Title (Validation Should Block)');
        console.log('======================================================================\n');
        
        const emptyTitlePayload = {
            title: '',
            priority: 'High'
        };
        
        console.log('📤 Payload Sent:');
        console.log(JSON.stringify(emptyTitlePayload, null, 2));
        console.log('\n🔐 Authorization: Bearer token included\n');
        
        const test1 = await makeRequest('POST', '/api/tasks', emptyTitlePayload, token);
        
        console.log('📥 Server Response:');
        console.log(`Status Code: ${test1.status}`);
        console.log(JSON.stringify(test1.data, null, 2));
        
        console.log('\n💡 What Happened:');
        console.log('1. Request included valid JWT token → authMiddleware passed ✅');
        console.log('2. Reached validation middleware → createTaskValidation rules');
        console.log('3. Title validation failed: .trim().notEmpty()');
        console.log('4. Returned 400 Bad Request BEFORE controller executed');
        console.log('5. No database query made - validation blocked request\n');
        
        if (test1.status === 400) {
            console.log('✅ PASS: Empty title correctly rejected\n');
        } else {
            console.log('❌ FAIL: Expected 400 status\n');
        }

        // Step 3: Test invalid priority (should fail validation)
        console.log('======================================================================');
        console.log('TEST 2: Invalid Priority Value (Validation Should Block)');
        console.log('======================================================================\n');
        
        const invalidPriorityPayload = {
            title: 'My Important Task',
            priority: 'UltraHigh',
            taskNotes: 'This should fail'
        };
        
        console.log('📤 Payload Sent:');
        console.log(JSON.stringify(invalidPriorityPayload, null, 2));
        console.log('\n🔐 Authorization: Bearer token included\n');
        
        const test2 = await makeRequest('POST', '/api/tasks', invalidPriorityPayload, token);
        
        console.log('📥 Server Response:');
        console.log(`Status Code: ${test2.status}`);
        console.log(JSON.stringify(test2.data, null, 2));
        
        console.log('\n💡 What Happened:');
        console.log('1. Auth passed ✅ - valid token');
        console.log('2. Priority validation: .isIn(["Low", "Medium", "High", "Critical"])');
        console.log('3. "UltraHigh" not in allowed list → validation failed');
        console.log('4. Database schema also enforces enum, but API catches it first');
        console.log('5. Better error message than database constraint error\n');
        
        if (test2.status === 400) {
            console.log('✅ PASS: Invalid priority correctly rejected\n');
        } else {
            console.log('❌ FAIL: Expected 400 status\n');
        }

        // Step 4: Test valid task creation (should succeed)
        console.log('======================================================================');
        console.log('TEST 3: Valid Task Creation (Should Succeed)');
        console.log('======================================================================\n');
        
        const validTaskPayload = {
            title: 'Study for final exam',
            priority: 'High',
            status: 'In Progress',
            taskNotes: 'Focus on chapters 5-8',
            dueDate: '2026-02-15'
        };
        
        console.log('📤 Payload Sent:');
        console.log(JSON.stringify(validTaskPayload, null, 2));
        console.log('\n🔐 Authorization: Bearer token included\n');
        
        const test3 = await makeRequest('POST', '/api/tasks', validTaskPayload, token);
        
        console.log('📥 Server Response:');
        console.log(`Status Code: ${test3.status}`);
        console.log(JSON.stringify(test3.data, null, 2));
        
        console.log('\n💡 What Happened:');
        console.log('1. Auth passed ✅ - valid JWT token');
        console.log('2. Validation passed ✅ - all rules satisfied');
        console.log('   - Title: Not empty ✅');
        console.log('   - Priority: "High" in allowed list ✅');
        console.log('   - Status: "In Progress" in allowed list ✅');
        console.log('3. Controller executed: createTask()');
        console.log('4. Database query: Task created with user reference');
        console.log('5. Response: 201 Created with task object\n');
        
        if (test3.status === 201) {
            console.log('✅ PASS: Valid task created successfully\n');
            console.log(`📋 Task ID: ${test3.data._id}`);
            console.log(`📅 Created: ${test3.data.createdAt}`);
        } else {
            console.log('❌ FAIL: Expected 201 status\n');
        }

        // Step 5: Test task update with invalid status
        console.log('\n======================================================================');
        console.log('TEST 4: Task Update with Invalid Status');
        console.log('======================================================================\n');
        
        const invalidUpdatePayload = {
            status: 'Almost Done'  // Invalid status
        };
        
        console.log('📤 Payload Sent (PUT request):');
        console.log(JSON.stringify(invalidUpdatePayload, null, 2));
        
        if (test3.status === 201) {
            const taskId = test3.data._id;
            console.log(`\n🎯 Target: /api/tasks/${taskId}`);
            console.log('🔐 Authorization: Bearer token included\n');
            
            const test4 = await makeRequest('PUT', `/api/tasks/${taskId}`, invalidUpdatePayload, token);
            
            console.log('📥 Server Response:');
            console.log(`Status Code: ${test4.status}`);
            console.log(JSON.stringify(test4.data, null, 2));
            
            console.log('\n💡 What Happened:');
            console.log('1. Auth passed ✅ - valid token');
            console.log('2. Status validation: .isIn(["Not Started", "In Progress", "Completed"])');
            console.log('3. "Almost Done" not in allowed list → validation failed');
            console.log('4. Update blocked before database query');
            console.log('5. Task remains unchanged in database\n');
            
            if (test4.status === 400) {
                console.log('✅ PASS: Invalid status correctly rejected\n');
            } else {
                console.log('❌ FAIL: Expected 400 status\n');
            }
        }

        // Step 6: Test without authentication token
        console.log('======================================================================');
        console.log('TEST 5: Task Creation WITHOUT Token (Auth Should Block)');
        console.log('======================================================================\n');
        
        const noAuthPayload = {
            title: 'This should not work',
            priority: 'Low'
        };
        
        console.log('📤 Payload Sent:');
        console.log(JSON.stringify(noAuthPayload, null, 2));
        console.log('\n🚫 Authorization: NO TOKEN PROVIDED\n');
        
        const test5 = await makeRequest('POST', '/api/tasks', noAuthPayload);  // No token
        
        console.log('📥 Server Response:');
        console.log(`Status Code: ${test5.status}`);
        console.log(JSON.stringify(test5.data, null, 2));
        
        console.log('\n💡 What Happened:');
        console.log('1. authMiddleware executes FIRST');
        console.log('2. No token found → 401 Unauthorized');
        console.log('3. Request stopped at auth layer');
        console.log('4. Validation middleware never reached');
        console.log('5. Controller never executed\n');
        
        console.log('🔐 Middleware Execution Order:');
        console.log('   protect (auth) → createTaskValidation → validate → createTask');
        console.log('   ❌ BLOCKED HERE\n');
        
        if (test5.status === 401) {
            console.log('✅ PASS: Unauthorized request correctly blocked\n');
        } else {
            console.log('❌ FAIL: Expected 401 status\n');
        }

        // Summary
        console.log('╔═══════════════════════════════════════════════════════════════════╗');
        console.log('║                    KEY SECURITY INSIGHTS                         ║');
        console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
        console.log('🔐 Layered Security (Defense in Depth):');
        console.log('   1. Authentication Layer (authMiddleware)');
        console.log('   2. Validation Layer (express-validator)');
        console.log('   3. Business Logic Layer (controllers)');
        console.log('   4. Database Schema Layer (Mongoose)');
        console.log('');
        console.log('✅ Benefits:');
        console.log('   • Invalid requests caught early (saves resources)');
        console.log('   • Clear error messages (better debugging)');
        console.log('   • Data integrity maintained (no bad data in DB)');
        console.log('   • Security enhanced (multiple validation layers)');
        console.log('   • User experience improved (detailed error feedback)');
        console.log('');
        console.log('🎓 Academic Requirements:');
        console.log('   ✅ Server-side validation implemented');
        console.log('   ✅ Input sanitization (trim, normalize)');
        console.log('   ✅ Enum validation (priority, status)');
        console.log('   ✅ Required field validation (title)');
        console.log('   ✅ Reusable middleware pattern');
        console.log('   ✅ Consistent error handling (400 Bad Request)');
        console.log('   ✅ Authentication integration');
        console.log('');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.error('⚠️  Server is not running! Start it with: npm start\n');
        }
    }
}

// Run the tests
console.log('Starting task validation tests...');
runTaskTests();
